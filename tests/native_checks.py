"""Real Git integration checks for the local VS Code runtime.

Usage: python -X utf8 tests/native_checks.py [--git ABSOLUTE_GIT_EXE]
Only the temporary directory created by this test is modified or removed.
"""
import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile


parser = argparse.ArgumentParser()
parser.add_argument('--git', default=shutil.which('git'))
args = parser.parse_args()
GIT = str(Path(args.git).resolve())
NATIVE = Path(__file__).resolve().parents[1] / 'runtime' / 'native.py'
LESSONS = json.loads(NATIVE.with_name('lessons.json').read_text(encoding='utf-8'))
checks = 0
temp_parent = Path(tempfile.gettempdir()).resolve()
test_root = Path(tempfile.mkdtemp(prefix='git-onboarding-native-', dir=temp_parent)).resolve()
assert test_root.parent == temp_parent and test_root.name.startswith('git-onboarding-native-')
labs = test_root / "中文 空格 learner's labs"
global_config = test_root / 'global.gitconfig'
global_hooks = test_root / 'user global hooks'
global_hooks.mkdir()
for hook in ('pre-commit', 'pre-push'):
    hook_file = global_hooks / hook
    hook_file.write_text('#!/bin/sh\necho "Global hooks must not run in lessons" >&2\nexit 86\n', encoding='utf-8', newline='\n')
    hook_file.chmod(0o755)
global_config.write_text('[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = missing-signing-tool\n'
                         f'[core]\n\thooksPath = "{global_hooks.as_posix()}"\n\tautocrlf = true\n', encoding='utf-8')
user_env = {key: value for key, value in os.environ.items() if not key.upper().startswith('GIT_')}
user_env.update({'GIT_CONFIG_GLOBAL': str(global_config), 'GIT_CONFIG_NOSYSTEM': '1',
                 'GIT_TERMINAL_PROMPT': '0'})


def expect(condition, message):
    global checks
    assert condition, message
    checks += 1


def request(action='probe', lesson=None, mode='guided', reset=False, root=None, ok=True, **extra):
    payload = {'action': action, 'lesson': lesson, 'mode': mode, 'reset': reset, **extra}
    result = subprocess.run([sys.executable, '-X', 'utf8', str(NATIVE), '--root', str(root or labs),
                             '--git', GIT], input=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
                            env=user_env, capture_output=True, timeout=60)
    try:
        decoded = json.loads(result.stdout.decode('utf-8'))
    except Exception as exc:
        raise AssertionError(f'Invalid JSON protocol: {result.stdout!r} {result.stderr!r}') from exc
    expect(decoded['ok'] is ok, f'{payload}: {decoded}')
    expect(result.returncode == (0 if ok else 1), f'Unexpected exit: {result.returncode}')
    return decoded['result'] if ok else decoded['error']


def command(repo, *arguments, check=True):
    result = subprocess.run([GIT, '-C', str(repo), *arguments], capture_output=True,
                            env=user_env, text=True, encoding='utf-8', errors='replace', timeout=30)
    if check:
        expect(result.returncode == 0, f'git {arguments}: {result.stderr}')
    return result


def write(path, content):
    path.write_text(content, encoding='utf-8', newline='')


def remove_readonly(function, filename, error):
    candidate = Path(filename).resolve()
    if not candidate.is_relative_to(test_root):
        raise ValueError('Refusing cleanup outside test directory')
    os.chmod(candidate, stat.S_IWRITE)
    function(filename)


@contextmanager
def open_workspace_directory(path):
    """Simulate VS Code/terminal directory handles that prohibit rename/delete."""
    if os.name != 'nt':
        yield
        return
    import ctypes
    from ctypes import wintypes
    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel32.CreateFileW.argtypes = (wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                                    wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE)
    kernel32.CreateFileW.restype = wintypes.HANDLE
    kernel32.CloseHandle.argtypes = (wintypes.HANDLE,)
    handle = kernel32.CreateFileW(str(path), 0x80000000, 0x1 | 0x2, None, 3, 0x02000000, None)
    if handle == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        delete_handle = kernel32.CreateFileW(str(path), 0x00010000, 0x1 | 0x2 | 0x4, None, 3, 0x02000000, None)
        if delete_handle != ctypes.c_void_p(-1).value:
            kernel32.CloseHandle(delete_handle)
            raise AssertionError('Windows test handle did not deny delete access')
        expect(ctypes.get_last_error() == 32, 'Windows test handle blocks DELETE sharing')
        yield
    finally:
        kernel32.CloseHandle(handle)


try:
    probe = request()
    expect(probe['runtime'] == 'native' and probe['lessons'] == ['basics', 'collab', 'recovery'], 'probe capabilities')
    expect(not labs.exists(), 'probe must not create a workspace')
    request('init', 'freeplay', ok=False)
    request('init', 'basics', mode='invalid', ok=False)
    expect(not labs.exists(), 'invalid lessons must not create root')
    request('write', 'basics', ok=False)
    request('state', 'basics', ok=False)

    for mode in ('guided', 'challenge'):
        for lesson in ('basics', 'collab', 'recovery'):
            state = request('init', lesson, mode)
            repo = Path(state['path'])
            base = repo.parent
            expect(not state['complete'] and state['error'] is None, f'{lesson}/{mode} initial state')
            expect(repo == labs / f'{lesson}-{mode}' / 'workspace', 'absolute Windows path including apostrophe and Chinese')
            expect(not list(repo.glob('.git-onboarding*')), 'ownership markers stay outside Git worktree')
            expect(command(repo, 'config', '--local', 'commit.gpgsign').stdout.strip() == 'false', 'native SCM bypasses global signing')
            expect(command(repo, 'config', '--local', 'core.autocrlf').stdout.strip() == 'false', 'stable local line endings')
            hooks = command(repo, 'config', '--local', 'core.hooksPath').stdout.strip()
            expect(Path(hooks).is_dir() and not list(Path(hooks).iterdir()), 'native SCM uses owned empty hooks')
            settings = json.loads((repo / '.vscode' / 'settings.json').read_text(encoding='utf-8'))
            expect(settings['git.enableCommitSigning'] is False and settings['git.autofetch'] is False,
                   'workspace overrides user signing and automatic remote fetch')
            expect(command(repo, 'check-ignore', '.vscode/settings.json').stdout.strip() == '.vscode/settings.json',
                   'editor settings excluded from Git exercise')
            item = next(item for item in LESSONS if item['id'] == lesson)
            target = item['target' if mode == 'guided' else 'challengeTarget']
            if lesson == 'basics':
                command(repo, 'commit', '--allow-empty', '-m', '空提交不能完成练习')
                expect(not request('state', lesson, mode)['complete'], 'empty commit rejected')
                write(repo / 'README.md', '# Git 学习手册\r\n\r\n我通过 VS Code 学会了提交。\r\n')
                expect(not request('state', lesson, mode)['complete'], 'saving is not committing')
                command(repo, 'add', 'README.md')
                expect(not request('state', lesson, mode)['complete'], 'staging is not committing')
                command(repo, 'commit', '-m', '用 Source Control 提交中文内容')
            elif lesson == 'collab':
                command(repo, 'switch', '-c', 'feature/welcome')
                write(repo / 'release.txt', target + '\n')
                command(repo, 'add', 'release.txt')
                command(repo, 'commit', '-m', '准备发布')
                command(repo, 'fetch', 'origin')
                merge = command(repo, 'merge', 'origin/main', check=False)
                expect(merge.returncode != 0 and 'CONFLICT' in merge.stdout, 'real native Git merge conflict')
                state = request('state', lesson, mode)
                expect(state['conflicts'] == ['release.txt'] and not state['complete'], 'conflict state exposed')
                write(repo / 'release.txt', target.replace('\n', '\r\n') + '\r\n')
                command(repo, 'add', 'release.txt')
                command(repo, 'commit', '-m', '在合并编辑器保留双方修改')
                command(repo, 'switch', 'main')
                command(repo, 'merge', 'feature/welcome')
                expect(not request('state', lesson, mode)['complete'], 'must push to complete collaboration')
                command(repo, 'push', 'origin', 'main')
                expect(command(base / 'remote.git', 'config', '--local', 'core.hooksPath').stdout.strip() == hooks,
                       'bare remote has local hooks isolation')
                expect(command(base / 'teammate', 'config', '--local', 'commit.gpgsign').stdout.strip() == 'false',
                       'teammate has local signing isolation')
            else:
                command(repo, 'restore', '--', 'notes.txt')
                command(repo, 'restore', '--staged', '--', 'draft.txt')
                expect(not request('state', lesson, mode)['complete'], 'must fix committed configuration')
                command(repo, 'revert', '--no-edit', 'HEAD')
                expect(bool(command(repo, 'diff').stdout.strip()), 'draft remains in working tree')
            state = request('state', lesson, mode)
            expect(state['complete'], f'{lesson}/{mode} complete: {state["checks"]} {state["error"]}')
            expect(request('init', lesson, mode)['complete'], 'resume preserves completed workspace')
            settings['editor.fontSize'] = 19
            (repo / '.vscode' / 'settings.json').write_text(json.dumps(settings), encoding='utf-8')
            request('init', lesson, mode)
            expect(json.loads((repo / '.vscode' / 'settings.json').read_text(encoding='utf-8'))['editor.fontSize'] == 19,
                   'resume preserves learner editor preferences')
            old_head = state['head']
            original_base_id, original_repo_id = base.stat().st_ino, repo.stat().st_ino
            with open_workspace_directory(base), open_workspace_directory(repo):
                reset = request('init', lesson, mode, reset=True)
            expect(base.stat().st_ino == original_base_id and repo.stat().st_ino == original_repo_id,
                   'reset retains base/workspace directory identities despite Windows open handles')
            expect(not reset['complete'], 'reset creates new unfinished exercise')
            archive = Path(reset['archivedPath'])
            expect(archive.parent == labs / '.archives' and archive.is_dir(), 'old workspace safely archived')
            archive_info = json.loads((archive / '.archive-info.json').read_text(encoding='utf-8'))
            expect(archive_info['verification'] == 'sha256' and archive_info['verifiedFiles'] > 0,
                   'archive is verified before workspace contents are cleared')
            expect(command(archive / 'workspace', 'rev-parse', '--short', 'HEAD').stdout.strip() == old_head,
                   'archive preserves actual Git history')
            print(f'PASS {lesson}/{mode}', flush=True)

    if os.name == 'nt':
        locked_file = labs / 'basics-guided' / 'workspace' / 'README.md'
        original_bytes = locked_file.read_bytes()
        with open_workspace_directory(locked_file):
            request('init', 'basics', reset=True, ok=False)
        interrupted = json.loads((labs / '.ownership' / 'basics-guided.json').read_text(encoding='utf-8'))
        expect(interrupted['state'] == 'initializing', 'failure after verified archive leaves recoverable marker')
        safe_archive = Path(interrupted['archivedPath'])
        expect((safe_archive / 'workspace' / 'README.md').read_bytes() == original_bytes,
               'locked-file reset failure preserves verified original archive')
        expect(str(safe_archive) in request('init', 'basics', ok=False), 'interruption error locates existing safe archive')
        expect(not request('init', 'basics', reset=True)['complete'], 'retry recovers partial cleanup after file unlock')
        expect((safe_archive / 'workspace' / 'README.md').read_bytes() == original_bytes,
               'recovery never removes earlier complete backup')

    foreign = test_root / 'foreign root'
    foreign.mkdir()
    write(foreign / 'keep.txt', 'do not touch')
    request('init', 'basics', root=foreign, ok=False)
    expect((foreign / 'keep.txt').read_text() == 'do not touch', 'foreign root preserved')

    owner_file = labs / '.ownership' / 'basics-guided.json'
    owner_data = owner_file.read_bytes()
    owner_file.unlink()
    request('init', 'basics', reset=True, ok=False)
    expect((labs / 'basics-guided' / 'workspace' / 'README.md').exists(), 'unowned base not overwritten')
    owner_file.write_bytes(owner_data)

    owner = json.loads(owner_data)
    owner['state'] = 'initializing'
    owner_file.write_text(json.dumps(owner), encoding='utf-8')
    write(labs / 'basics-guided' / 'workspace' / 'rescue.txt', 'recover me')
    expect('中断' in request('init', 'basics', ok=False), 'interrupted init explains recovery')
    request('state', 'basics', ok=False)
    recovered = request('init', 'basics', reset=True)
    expect((Path(recovered['archivedPath']) / 'workspace' / 'rescue.txt').read_text() == 'recover me',
           'interrupted initialization reset archives all files')

    outside = test_root / 'outside'
    outside.mkdir()
    write(outside / 'do-not-touch.txt', 'outside data')
    junction = labs / 'basics-guided' / 'workspace' / 'redirected'
    if os.name == 'nt':
        link_result = subprocess.run(['cmd.exe', '/c', 'mklink', '/J', str(junction), str(outside)], capture_output=True)
        expect(link_result.returncode == 0, f'junction creation: {link_result.stderr!r}')
    else:
        junction.symlink_to(outside, target_is_directory=True)
    request('state', 'basics', ok=False)
    request('init', 'basics', reset=True, ok=False)
    expect((outside / 'do-not-touch.txt').read_text() == 'outside data', 'junction target unchanged')
    if os.name == 'nt':
        junction.rmdir()
    else:
        junction.unlink()

    redirected_root = test_root / 'redirected-root'
    if os.name == 'nt':
        link_result = subprocess.run(['cmd.exe', '/c', 'mklink', '/J', str(redirected_root), str(labs)], capture_output=True)
        expect(link_result.returncode == 0, 'root junction created')
    else:
        redirected_root.symlink_to(labs, target_is_directory=True)
    request('probe', root=redirected_root, ok=False)
    request('init', 'basics', root=redirected_root, reset=True, ok=False)
    if os.name == 'nt':
        redirected_root.rmdir()
    else:
        redirected_root.unlink()
    print(json.dumps({'passed': checks, 'scenarios': 6, 'platform': sys.platform,
                      'git': subprocess.check_output([GIT, '--version'], text=True).strip()}), flush=True)
finally:
    # Delete only the random, verified directory owned by this invocation.
    resolved = test_root.resolve()
    if resolved.parent == temp_parent and resolved.name.startswith('git-onboarding-native-'):
        shutil.rmtree(resolved, onerror=remove_readonly)

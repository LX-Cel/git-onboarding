"""Trusted lesson orchestration. All actions run inside the unprivileged sandbox."""
import json
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
import advanced
import maintenance
import teamwork

ROOT = Path('/home/student/labs')
COURSE_VERSION = '0.2.0'
LESSONS = json.loads(Path(__file__).with_name('lessons.json').read_text())
IDS = {lesson['id'] for lesson in LESSONS}
EDITOR_DOTFILES = {'.gitignore', '.gitattributes', '.gitmodules'}
SAFE_ENV = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GIT_CONFIG_NOSYSTEM': '1',
            'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_PAGER': 'cat', 'GIT_EDITOR': 'true',
            'GIT_OPTIONAL_LOCKS': '0', 'LC_ALL': 'C.UTF-8'}

def git(repo, *args, check=True):
    result = subprocess.run(['git', '-c', 'core.quotepath=false', '-c', 'core.fsmonitor=false',
                             '-C', str(repo), *args], env=SAFE_ENV, capture_output=True, timeout=10)
    if check and result.returncode:
        raise ValueError(result.stderr.decode(errors='replace').strip()[:2000])
    return result.stdout.decode(errors='replace').rstrip('\n')

def config(repo):
    git(repo, 'config', 'user.name', 'Git Learner')
    git(repo, 'config', 'user.email', 'learner@example.invalid')
    git(repo, 'config', 'init.defaultBranch', 'main')
    git(repo, 'config', 'core.autocrlf', 'false')

def commit(repo, message):
    git(repo, 'add', '--all')
    git(repo, 'commit', '-m', message)
    return git(repo, 'rev-parse', 'HEAD')

def advanced_api():
    return SimpleNamespace(git=git, config=config, commit=commit, text_at=text_at, ancestor=ancestor)

def location(lesson, mode):
    if lesson not in IDS or mode not in ('guided', 'challenge'):
        raise ValueError('未知练习或模式')
    if ROOT.is_symlink() or ROOT.resolve() != ROOT:
        raise ValueError('练习根目录被修改，请修复环境')
    base = ROOT / f'{lesson}-{mode}'
    if base.is_symlink() or (base.exists() and base.resolve() != base):
        raise ValueError('练习路径不能是符号链接')
    return base, base / 'workspace'

def initialize(lesson, mode, reset=False):
    base, repo = location(lesson, mode)
    if base.exists() and not reset:
        return snapshot(lesson, mode)
    if base.exists():
        # Fixed, validated direct child only; rmtree does not follow interior symlinks.
        shutil.rmtree(base)
    repo.mkdir(parents=True)
    git(repo, 'init', '-b', 'main')
    config(repo)
    record = {'lesson': lesson, 'mode': mode}
    if lesson == 'basics':
        (repo / 'README.md').write_text('# Git 学习手册\n\n学习从这里开始。\n')
        record['initial'] = commit(repo, '创建学习手册')
    elif lesson == 'collab':
        (repo / 'release.txt').write_text('release=1\nowner=team\nstatus=draft\n')
        record['initial'] = commit(repo, '创建发布配置')
        remote = base / 'remote.git'
        git(base, 'init', '--bare', '-b', 'main', str(remote))
        git(repo, 'remote', 'add', 'origin', str(remote))
        git(repo, 'push', '-u', 'origin', 'main')
        teammate = base / 'teammate'
        git(base, 'clone', str(remote), str(teammate))
        config(teammate)
        value = 2 if mode == 'guided' else 5
        (teammate / 'release.txt').write_text(f'release={value}\nowner=team\nstatus=draft\n')
        record['teammate'] = commit(teammate, '队友：更新发布版本')
        git(teammate, 'push', 'origin', 'main')
    elif lesson in advanced.IDS:
        advanced.setup(advanced_api(), repo, base, lesson, mode, record)
    elif lesson in maintenance.IDS:
        maintenance.setup(advanced_api(), repo, base, lesson, mode, record)
    elif lesson in teamwork.IDS:
        teamwork.setup(advanced_api(), repo, base, lesson, mode, record)
    elif lesson == 'recovery':
        (repo / 'notes.txt').write_text('这段笔记需要保留。\n')
        (repo / 'draft.txt').write_text('初始草稿\n')
        (repo / 'config.ini').write_text('safe_mode=on\n')
        record['initial'] = commit(repo, '建立正确配置和文档')
        (repo / 'config.ini').write_text('safe_mode=off\n')
        record['bad'] = commit(repo, '误操作：关闭安全模式')
        (repo / 'notes.txt').write_text('不需要的临时试验\n')
        draft = '需要保留的学习草稿' if mode == 'guided' else '需要保留的独立挑战草稿'
        (repo / 'draft.txt').write_text(draft + '\n')
        record['draft'] = draft
        git(repo, 'add', 'draft.txt')
    else:
        raise ValueError('课程尚未实现')
    (base / 'scenario.json').write_text(json.dumps(record, ensure_ascii=False))
    return snapshot(lesson, mode)

def safe_file(repo, name, existing=False):
    if not isinstance(name, str) or len(name) > 240 or '\\' in name or '\x00' in name:
        raise ValueError('无效文件路径')
    parts = Path(name).parts
    if not parts or Path(name).is_absolute() or any(p in ('.git', '..') or (p.startswith('.') and not (i == len(parts) - 1 and p in EDITOR_DOTFILES)) for i, p in enumerate(parts)):
        raise ValueError('只能编辑练习仓库中的普通文件')
    path = repo / name
    if not path.resolve().is_relative_to(repo.resolve()) or any(p.is_symlink() for p in [path, *path.parents] if p != ROOT.parent):
        raise ValueError('不允许通过链接访问文件')
    if existing and not path.is_file():
        raise ValueError('文件不存在')
    return path

def read_file(repo, name):
    path = safe_file(repo, name, True)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        import stat
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise ValueError('只能读取普通文本文件')
        data = os.read(fd, 262145)
        if len(data) > 262144 or b'\x00' in data:
            raise ValueError('编辑器支持 256 KB 以内的文本文件')
        return data.decode('utf-8')
    finally:
        os.close(fd)

def write_file(repo, name, content):
    if not isinstance(content, str) or len(content.encode()) > 262144:
        raise ValueError('文件超过 256 KB')
    path = safe_file(repo, name)
    if not path.parent.is_dir():
        raise ValueError('请先在终端创建父目录')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o644)
    try:
        import stat
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise ValueError('只能写入普通文本文件')
        os.ftruncate(fd, 0)
        with os.fdopen(fd, 'w', closefd=False) as stream:
            stream.write(content)
    finally:
        os.close(fd)

def text_at(repo, rev, name):
    return git(repo, 'show', f'{rev}:{name}', check=False)

def ancestor(repo, first, second):
    result = subprocess.run(['git', '-C', str(repo), 'merge-base', '--is-ancestor', first, second],
                            env=SAFE_ENV, capture_output=True, timeout=5)
    return result.returncode == 0

def assess(repo, base, lesson, mode):
    record = json.loads((base / 'scenario.json').read_text())
    spec = next(x for x in LESSONS if x['id'] == lesson)
    status = git(repo, 'status', '--porcelain')
    clean = not status
    target = spec['target' if mode == 'guided' else 'challengeTarget']
    if lesson in advanced.IDS:
        return advanced.assess(advanced_api(), repo, base, lesson, mode, record)
    if lesson in maintenance.IDS:
        return maintenance.assess(advanced_api(), repo, base, lesson, mode, record)
    if lesson in teamwork.IDS:
        return teamwork.assess(advanced_api(), repo, base, lesson, mode, record)
    if lesson == 'basics':
        original = text_at(repo, record['initial'], 'README.md').strip()
        committed = text_at(repo, 'HEAD', 'README.md').strip()
        changed = bool(committed) and committed != original and ancestor(repo, record['initial'], 'HEAD')
        return [
            {'label': 'README 修改已进入提交', 'done': changed,
             'detail': '已在提交中找到你的 README 修改，内容不必照抄示例。' if changed else
                       '请修改 README.md 的正文并保存，再暂存、提交。只修改提交说明或创建空提交不算完成。'},
            {'label': '工作区与暂存区干净', 'done': clean,
             'detail': '没有尚未提交的文件修改。' if clean else '还有文件修改未提交，运行 git status 查看它们位于工作区还是暂存区。'}
        ]
    elif lesson == 'collab':
        feature = git(repo, 'rev-parse', '--verify', 'refs/heads/feature/welcome', check=False)
        main = git(repo, 'rev-parse', '--verify', 'refs/heads/main', check=False)
        remote = base / 'remote.git'
        checks = [
            ('创建并合并功能分支', bool(feature) and feature != record['initial'] and ancestor(repo, feature, 'main')),
            ('保留队友提交历史', ancestor(repo, record['teammate'], 'main')),
            ('main 包含正确配置', text_at(repo, 'main', 'release.txt') == target),
            ('练习远端已收到 main', git(remote, 'rev-parse', 'main') == main and text_at(remote, 'main', 'release.txt') == target),
            ('回到 main 且没有待处理改动', git(repo, 'branch', '--show-current') == 'main' and clean)
        ]
    else:
        draft = read_file(repo, 'draft.txt').strip()
        staged = git(repo, 'diff', '--cached', '--name-only')
        good_config = text_at(repo, 'HEAD', 'config.ini') == 'safe_mode=on'
        history_kept = ancestor(repo, record['bad'], 'HEAD') and git(repo, 'rev-parse', 'HEAD') != record['bad']
        # Semantic inverse commit: preserve the bad commit and introduce a descendant restoring its change.
        checks = [('notes.txt 已恢复且没有额外改动', read_file(repo, 'notes.txt').strip() == '这段笔记需要保留。'),
                  ('草稿修改保留在工作区', draft == record['draft'] and text_at(repo, 'HEAD', 'draft.txt') == '初始草稿'),
                  ('暂存区已清空', not staged),
                  ('新提交恢复安全模式并保留旧历史', good_config and history_kept)]
    return [{'label': label, 'done': done} for label, done in checks]

def snapshot(lesson, mode):
    base, repo = location(lesson, mode)
    if not repo.is_dir() or repo.is_symlink():
        raise ValueError('仓库不存在或路径被修改，请重新开始本练习')
    files = []
    for folder, dirs, names in os.walk(repo, followlinks=False):
        dirs[:] = [d for d in dirs if not d.startswith('.') and not (Path(folder) / d).is_symlink()]
        for name in names:
            p = Path(folder) / name
            if (not name.startswith('.') or name in EDITOR_DOTFILES) and not p.is_symlink() and p.is_file():
                files.append(str(p.relative_to(repo)))
            if len(files) >= 150:
                break
        if len(files) >= 150:
            break
    # -z avoids quoting and handles whitespace/newlines in ordinary names.
    entries = git(repo, 'status', '--porcelain=v1', '-z').split('\x00')
    changes = []
    skip = False
    for entry in entries:
        if skip:
            skip = False
            continue
        if len(entry) >= 3:
            changes.append({'index': entry[0], 'worktree': entry[1], 'path': entry[3:]})
            skip = entry[0] in 'RC'
    history = []
    raw = git(repo, 'log', '--all', '--date-order', '-24', '--format=%H%x1f%P%x1f%s%x1f%D', check=False)
    for line in raw.splitlines():
        parts = line.split('\x1f')
        if len(parts) == 4:
            history.append({'hash': parts[0], 'parents': parts[1].split(), 'subject': parts[2], 'refs': parts[3]})
    try:
        checks = assess(repo, base, lesson, mode)
        error = None
    except (ValueError, OSError, subprocess.SubprocessError) as exc:
        checks = []
        error = str(exc)[:1000]
    conflicts = git(repo, 'diff', '--name-only', '--diff-filter=U').splitlines()
    record = json.loads((base / 'scenario.json').read_text())
    remotes = [{'name': name, 'url': git(repo, 'remote', 'get-url', name, check=False)}
               for name in git(repo, 'remote').splitlines()]
    return {'path': str(repo), 'branch': git(repo, 'branch', '--show-current'),
            'operation': advanced.operation(advanced_api(), repo), 'remotes': remotes,
            'hosting': advanced.hosting_view(advanced_api(), repo, base, record),
            'head': git(repo, 'rev-parse', '--short', 'HEAD', check=False),
            'files': sorted(files), 'changes': changes, 'history': history, 'checks': checks,
            'complete': bool(checks) and all(c['done'] for c in checks), 'conflicts': conflicts,
            'merge': (repo / '.git' / 'MERGE_HEAD').exists(),
            'diff': git(repo, 'diff', '--no-ext-diff', '--no-textconv', check=False)[:16000],
            'stagedDiff': git(repo, 'diff', '--cached', '--no-ext-diff', '--no-textconv', check=False)[:16000],
            'error': error}

def dispatch(request):
    action = request.get('action')
    lesson, mode = request.get('lesson'), request.get('mode', 'guided')
    if action == 'probe':
        hashes = {name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
                  for name in ['engine.py', 'advanced.py', 'maintenance.py', 'teamwork.py', 'relay.py', 'lessons.json']}
        return {'courseVersion': COURSE_VERSION, 'courseHashes': hashes, 'uid': os.getuid(), 'git': subprocess.check_output(['git', '--version'], text=True).strip(),
                'windowsMount': Path('/mnt/c').exists(), 'interop': bool(os.environ.get('WSL_INTEROP')),
                'initVisible': Path('/init').exists()}
    base, repo = location(lesson, mode)
    if action == 'init':
        return initialize(lesson, mode, request.get('reset') is True)
    if action == 'state':
        return snapshot(lesson, mode)
    if action == 'host':
        record = json.loads((base / 'scenario.json').read_text())
        advanced.host_action(advanced_api(), repo, base, record, request)
        return snapshot(lesson, mode)
    if action == 'read':
        return {'content': read_file(repo, request.get('path'))}
    if action == 'write':
        write_file(repo, request.get('path'), request.get('content'))
        return snapshot(lesson, mode)
    raise ValueError('不支持的操作')

if __name__ == '__main__':
    try:
        request = json.loads(sys.stdin.buffer.read(1048577))
        print(json.dumps({'ok': True, 'result': dispatch(request)}, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({'ok': False, 'error': str(exc)[:2000]}, ensure_ascii=False))
        sys.exit(1)

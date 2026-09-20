"""Windows/local adapter for the three introductory lessons.

Run with Python 3.11+ and ``-X utf8``. This is a normal local Git workspace,
not the desktop application's Linux security sandbox. Lifecycle operations are
restricted to explicitly owned directories; reset archives rather than deletes.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import uuid


APPLICATION = 'git-onboarding-vscode'
SCHEMA = 1
LESSON_IDS = ('basics', 'collab', 'recovery')
MODES = ('guided', 'challenge')
ROOT_MARKER = '.git-onboarding-native.json'
ROOT = None
GIT = None
ENGINE = None
SAFE_ENV = None


def checked_path(path):
    """Reject links, junctions and every other Windows reparse point in a path."""
    path = Path(os.path.abspath(path))
    for item in [*reversed(path.parents), path]:
        try:
            info = item.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise ValueError(f'练习路径不能经过符号链接或目录联接：{item}')
    if path.resolve() != path:
        raise ValueError(f'练习路径必须使用真实路径：{path}')
    return path


def read_json(path):
    checked_path(path)
    if not path.is_file() or path.stat().st_size > 65536:
        raise ValueError(f'无效的练习所有权记录：{path}')
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError(f'练习所有权记录无法读取：{path}') from exc


def write_json(path, value):
    checked_path(path)
    temporary = path.with_name(f'{path.name}.{uuid.uuid4().hex}.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    temporary.replace(path)


def owned_root(create=False):
    checked_path(ROOT)
    if not ROOT.exists():
        if not create:
            return None
        ROOT.mkdir(parents=True, exist_ok=False)
        # Exclusive creation ensures a pre-existing directory is never adopted.
        (ROOT / ROOT_MARKER).write_text(json.dumps({
            'application': APPLICATION, 'schema': SCHEMA,
            'id': uuid.uuid4().hex, 'root': str(ROOT),
        }), encoding='utf-8')
    if not ROOT.is_dir():
        raise ValueError('练习根路径不是目录')
    marker = ROOT / ROOT_MARKER
    if not marker.exists():
        raise ValueError('该练习根目录不属于本插件，拒绝接管；请选择新的练习目录')
    owner = read_json(marker)
    if (owner.get('application') != APPLICATION or owner.get('schema') != SCHEMA
            or owner.get('root') != str(ROOT) or not isinstance(owner.get('id'), str)
            or len(owner['id']) != 32):
        raise ValueError('练习根目录所有权不匹配，拒绝操作')
    return owner


def metadata_path(lesson, mode):
    return ROOT / '.ownership' / f'{lesson}-{mode}.json'


def validate_tree(base):
    """Git must not follow a redirected worktree, git directory or object path."""
    checked_path(base)
    for folder, directories, names in os.walk(base, followlinks=False):
        for name in [*directories, *names]:
            checked_path(Path(folder) / name)
    repo = base / 'workspace'
    checked_path(repo)
    if repo.exists() and not repo.is_dir():
        raise ValueError('练习工作区不是目录')
    for candidate in [repo, base / 'teammate', base / 'remote.git']:
        git_dir = candidate if candidate.name == 'remote.git' else candidate / '.git'
        if git_dir.exists() and not git_dir.is_dir():
            raise ValueError('练习仓库不能重定向到外部 Git 目录')
        if (git_dir / 'objects' / 'info' / 'alternates').exists():
            raise ValueError('练习仓库不能使用外部 Git 对象目录')
        if (git_dir / 'commondir').exists():
            raise ValueError('练习仓库不能使用外部公共 Git 目录')


def ownership(lesson, mode, root_owner):
    marker = metadata_path(lesson, mode)
    checked_path(marker)
    if not marker.exists():
        return None
    owner = read_json(marker)
    if (owner.get('application') != APPLICATION or owner.get('rootId') != root_owner['id']
            or owner.get('lesson') != lesson or owner.get('mode') != mode
            or owner.get('state') not in ('initializing', 'ready')):
        raise ValueError('练习目录所有权不匹配，拒绝操作')
    return owner


def location(lesson, mode):
    if lesson not in LESSON_IDS or mode not in MODES:
        raise ValueError('原生练习暂时只支持 basics、collab、recovery 和 guided、challenge 模式')
    root_owner = owned_root()
    base = checked_path(ROOT / f'{lesson}-{mode}')
    repo = checked_path(base / 'workspace')
    if root_owner is None:
        return base, repo
    owner = ownership(lesson, mode, root_owner)
    if base.exists():
        if owner is None:
            raise ValueError('该目录没有本插件的练习所有权记录，拒绝操作')
        validate_tree(base)
    return base, repo


def hooks_directory():
    hooks = checked_path(ROOT / '.empty-hooks')
    if not hooks.is_dir() or any(hooks.iterdir()):
        raise ValueError('练习专用 hooks 目录被修改，请恢复为空目录后重试')
    return hooks


def git(repo, *args, check=True, extra_env=None):
    checked_path(repo)
    command = [str(GIT), '-c', 'core.quotepath=false', '-c', 'core.fsmonitor=false',
               '-c', f'core.hooksPath={hooks_directory().as_posix()}',
               '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false',
               '-c', 'tag.gpgsign=false', '-C', str(repo), *args]
    result = subprocess.run(command, env={**SAFE_ENV, **(extra_env or {})},
                            capture_output=True, timeout=20)
    if check and result.returncode:
        raise ValueError(result.stderr.decode('utf-8', errors='replace').strip()[:2000])
    if result.returncode == 0 and args and args[0] == 'init' and '--bare' in args:
        config(Path(args[-1]))
    return result.stdout.decode('utf-8', errors='replace').rstrip('\n')


def config(repo):
    for key, value in {
        'user.name': 'Git Learner', 'user.email': 'learner@example.invalid',
        'init.defaultBranch': 'main', 'core.autocrlf': 'false',
        'core.hooksPath': hooks_directory().as_posix(), 'core.fsmonitor': 'false',
        'commit.gpgsign': 'false', 'tag.gpgsign': 'false',
    }.items():
        git(repo, 'config', '--local', key, value)


def ancestor(repo, first, second):
    result = subprocess.run([str(GIT), '-C', str(repo), 'merge-base', '--is-ancestor', first, second],
                            env=SAFE_ENV, capture_output=True, timeout=10)
    return result.returncode == 0


def text_at(repo, revision, name):
    # VS Code can save CRLF on Windows; line endings are not a learning goal.
    return git(repo, 'show', f'{revision}:{name}', check=False).replace('\r\n', '\n').rstrip('\r')


def is_repository(api, repo):
    top = api.git(repo, 'rev-parse', '--show-toplevel', check=False)
    # Git for Windows uses forward slashes, pathlib uses native separators.
    return bool(top) and Path(top).resolve() == repo.resolve()


def read_file(repo, name):
    path = checked_path(ENGINE.safe_file(repo, name, True))
    if not stat.S_ISREG(path.stat().st_mode):
        raise ValueError('只能读取普通文本文件')
    with path.open('rb') as stream:
        data = stream.read(262145)
    if len(data) > 262144 or b'\x00' in data:
        raise ValueError('编辑器支持 256 KB 以内的文本文件')
    return data.decode('utf-8').replace('\r\n', '\n')


def configure(root, git_executable):
    global ROOT, GIT, ENGINE, SAFE_ENV
    if sys.version_info < (3, 11):
        raise ValueError('本地练习需要 Python 3.11 或更新版本')
    if not sys.flags.utf8_mode:
        raise ValueError('请使用 python -X utf8 启动原生练习引擎')
    if not Path(root).is_absolute() or not Path(git_executable).is_absolute():
        raise ValueError('练习根目录和 Git 程序必须使用绝对路径')
    ROOT = checked_path(root)
    GIT = Path(git_executable)
    if not GIT.is_file():
        raise ValueError('找不到所选的 Git 程序')
    SAFE_ENV = {key: value for key, value in os.environ.items() if not key.upper().startswith('GIT_')}
    SAFE_ENV.update({'GIT_TERMINAL_PROMPT': '0', 'GIT_CONFIG_NOSYSTEM': '1',
                     'GIT_CONFIG_GLOBAL': os.devnull, 'GIT_PAGER': 'cat',
                     'GIT_EDITOR': 'true', 'GIT_OPTIONAL_LOCKS': '0', 'LC_ALL': 'C.UTF-8'})
    import engine
    ENGINE = engine
    ENGINE.ROOT = ROOT
    ENGINE.SAFE_ENV = SAFE_ENV
    ENGINE.IDS = set(LESSON_IDS)
    ENGINE.location = location
    ENGINE.git = git
    ENGINE.config = config
    ENGINE.ancestor = ancestor
    ENGINE.text_at = text_at
    ENGINE.read_file = read_file
    ENGINE.foundations.is_repository = is_repository


def file_digest(path):
    checked_path(path)
    if not stat.S_ISREG(path.stat().st_mode):
        raise ValueError(f'练习归档仅支持普通文件：{path}')
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return {'size': path.stat().st_size, 'sha256': digest.hexdigest()}


def archive_manifest(base):
    validate_tree(base)
    files = {}
    directories = []
    for folder, names, filenames in os.walk(base, followlinks=False):
        for name in names:
            directories.append((Path(folder) / name).relative_to(base).as_posix())
        for name in filenames:
            path = checked_path(Path(folder) / name)
            files[path.relative_to(base).as_posix()] = file_digest(path)
    return {'files': files, 'directories': sorted(directories)}


def copy_verified_archive(base, archived):
    before = archive_manifest(base)

    def copy_file(source, target):
        checked_path(source)
        checked_path(target)
        return shutil.copy2(source, target, follow_symlinks=False)

    shutil.copytree(base, archived, symlinks=True, copy_function=copy_file)
    if archive_manifest(archived) != before or archive_manifest(base) != before:
        raise ValueError(f'归档验证未通过或文件正在修改，原练习尚未清空。备份位置：{archived}')
    return before


def clear_archived_contents(base, repo, manifest):
    """Keep open base/workspace directories; remove only verified archived content."""
    checked_path(base)
    checked_path(repo)
    if base.parent != ROOT or repo != base / 'workspace':
        raise ValueError('拒绝清理练习范围之外的目录')
    validate_tree(base)
    if archive_manifest(base) != manifest:
        raise ValueError('练习内容在归档后发生变化，已停止重置；原始备份仍然保留')
    for name, expected in manifest['files'].items():
        path = checked_path(base / name)
        if not path.is_relative_to(base) or path in (base, repo):
            raise ValueError('拒绝清理练习范围之外的文件')
        if file_digest(path) != expected:
            raise ValueError(f'归档后文件发生变化，已停止重置：{path}')
        info = path.stat()
        if getattr(info, 'st_file_attributes', 0) & 0x1:
            # Git objects are read-only on Windows; only this already archived
            # ordinary file has its attribute changed before unlinking it.
            path.chmod(info.st_mode | stat.S_IWRITE)
        path.unlink()
    for name in sorted(manifest['directories'], key=lambda value: len(Path(value).parts), reverse=True):
        directory = checked_path(base / name)
        if directory == repo:
            continue
        if not directory.is_relative_to(base) or directory == base:
            raise ValueError('拒绝清理练习范围之外的目录')
        directory.rmdir()
    if any(path != repo for path in base.iterdir()) or (repo.exists() and any(repo.iterdir())):
        raise ValueError('重置期间有新文件写入，已保留这些文件并停止重置；原始备份仍然保留')


def initialize(lesson, mode, reset=False):
    # Validate identifiers before creating any directories.
    location(lesson, mode)
    root_owner = owned_root(create=True)
    for name in ('.ownership', '.empty-hooks'):
        folder = checked_path(ROOT / name)
        folder.mkdir(exist_ok=True)
    hooks_directory()
    base, repo = location(lesson, mode)
    owner = ownership(lesson, mode, root_owner)
    if owner and owner['state'] == 'initializing' and not reset:
        backup = f'。已验证的原始备份：{owner["archivedPath"]}' if owner.get('archivedPath') else ''
        raise ValueError(f'上次练习初始化被中断；请重新开始，本次会先归档已有文件{backup}')
    if owner and owner['state'] == 'ready' and not base.exists() and not reset:
        raise ValueError('练习目录已丢失；请重新开始以创建新的练习')
    archived = None
    if base.exists() and reset:
        if owner is None:
            raise ValueError('不能重置没有本插件所有权记录的目录')
        validate_tree(base)
        archives = checked_path(ROOT / '.archives')
        archives.mkdir(exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        archived = checked_path(archives / f'{lesson}-{mode}-{timestamp}-{uuid.uuid4().hex[:8]}')
        manifest = copy_verified_archive(base, archived)
        write_json(archived / '.archive-info.json', {
            'application': APPLICATION, 'lesson': lesson, 'mode': mode,
            'originalPath': str(base), 'archivedAt': timestamp,
            'verifiedFiles': len(manifest['files']), 'verification': 'sha256',
        })
        write_json(metadata_path(lesson, mode), {
            'application': APPLICATION, 'rootId': root_owner['id'],
            'lesson': lesson, 'mode': mode, 'state': 'initializing',
            'archivedPath': str(archived),
        })
        location(lesson, mode)
        clear_archived_contents(base, repo, manifest)
    if base.exists() and not reset:
        return ENGINE.snapshot(lesson, mode)
    write_json(metadata_path(lesson, mode), {
        'application': APPLICATION, 'rootId': root_owner['id'],
        'lesson': lesson, 'mode': mode, 'state': 'initializing',
        **({'archivedPath': str(archived)} if archived else {}),
    })
    state = ENGINE.seed(lesson, mode, base, repo)
    # Limit editor/Git overrides to this disposable lesson folder. Existing
    # workspaces are resumed above and their settings are never overwritten.
    editor = checked_path(repo / '.vscode')
    editor.mkdir()
    write_json(editor / 'settings.json', {
        'git.enableCommitSigning': False, 'git.autofetch': False,
        'git.confirmSync': True, 'git.enableSmartCommit': False,
        'git.useEditorAsCommitInput': False,
        'files.eol': '\n', 'files.encoding': 'utf8',
    })
    exclude = checked_path(repo / '.git' / 'info' / 'exclude')
    with exclude.open('a', encoding='utf-8', newline='\n') as stream:
        stream.write('\n# VS Code settings for this practice folder only\n/.vscode/\n')
    write_json(metadata_path(lesson, mode), {
        'application': APPLICATION, 'rootId': root_owner['id'],
        'lesson': lesson, 'mode': mode, 'state': 'ready',
    })
    if archived:
        state['archivedPath'] = str(archived)
    return state


def dispatch(request):
    if not isinstance(request, dict):
        raise ValueError('请求必须是 JSON 对象')
    action = request.get('action')
    if action == 'probe':
        owned_root()
        version = subprocess.check_output([str(GIT), '--version'], env=SAFE_ENV,
                                          timeout=10).decode('utf-8').strip()
        return {'runtime': 'native', 'python': sys.version.split()[0], 'git': version,
                'root': str(ROOT), 'lessons': list(LESSON_IDS), 'modes': list(MODES),
                'courseVersion': ENGINE.COURSE_VERSION}
    lesson, mode = request.get('lesson'), request.get('mode', 'guided')
    if action == 'init':
        return initialize(lesson, mode, request.get('reset') is True)
    if action == 'state':
        base, repo = location(lesson, mode)
        root_owner = owned_root()
        owner = ownership(lesson, mode, root_owner) if root_owner else None
        if not owner or owner['state'] != 'ready':
            raise ValueError('练习尚未完成初始化；请开始练习，或重新开始以恢复中断的初始化')
        return ENGINE.snapshot(lesson, mode)
    raise ValueError('原生练习只支持 probe、init、state 操作')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--git', required=True)
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        configure(args.root, args.git)
        payload = sys.stdin.buffer.read(1048577)
        if len(payload) > 1048576:
            raise ValueError('请求超过 1 MB')
        result = dispatch(json.loads(payload.decode('utf-8')))
        print(json.dumps({'ok': True, 'result': result}, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({'ok': False, 'error': str(exc)[:2000]}, ensure_ascii=False))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

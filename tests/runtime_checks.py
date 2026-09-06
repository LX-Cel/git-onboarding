import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess

spec = importlib.util.spec_from_file_location('engine', '/opt/git-onboarding/engine.py')
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)
checks = 0

def expect(condition, message):
    global checks
    assert condition, message
    checks += 1

def command(repo, *args, check=True):
    proc = subprocess.run(['git', '-C', str(repo), *args], capture_output=True, text=True)
    if check:
        assert proc.returncode == 0, proc.stderr
    return proc

for mode in ['guided', 'challenge']:
    for lesson in ['basics', 'collab', 'recovery']:
        state = engine.initialize(lesson, mode, True)
        expect(not state['complete'], f'{lesson} {mode} must not pass initially')
        base, repo = engine.location(lesson, mode)
        item = next(l for l in engine.LESSONS if l['id'] == lesson)
        target = item['target' if mode == 'guided' else 'challengeTarget']
        if lesson == 'basics':
            command(repo, 'commit', '--allow-empty', '-m', '今天完成了第一次 Git 提交。')
            expect(not engine.snapshot(lesson, mode)['complete'], 'empty commit or matching message must not pass')
            (repo / 'unrelated.txt').write_text('unrelated change\n')
            command(repo, 'add', 'unrelated.txt')
            command(repo, 'commit', '-m', 'unrelated file')
            expect(not engine.snapshot(lesson, mode)['complete'], 'unrelated file commit must not pass')
            engine.write_file(repo, 'README.md', '# Git 学习手册\n\n今天天气不错。\n\n今天晚餐吃了什么？\n')
            expect(not engine.snapshot(lesson, mode)['complete'], 'saving alone must not pass')
            state = engine.snapshot(lesson, mode)
            expect(any(c['worktree'] == 'M' and c['index'] == ' ' for c in state['changes']), 'unstaged status columns')
            command(repo, 'add', 'README.md')
            expect(not engine.snapshot(lesson, mode)['complete'], 'staging alone must not pass')
            command(repo, 'commit', '-m', '独立选择的提交说明')
            expect(engine.snapshot(lesson, mode)['complete'], 'custom wording shown in user screenshot must pass')
        elif lesson == 'collab':
            command(repo, 'switch', '-c', 'feature/welcome')
            engine.write_file(repo, 'release.txt', target + '\n')
            command(repo, 'add', 'release.txt')
            command(repo, 'commit', '-m', '准备发布')
            command(repo, 'fetch', 'origin')
            merge = command(repo, 'merge', 'origin/main', check=False)
            expect(merge.returncode != 0 and 'CONFLICT' in merge.stdout, 'must produce a real merge conflict')
            state = engine.snapshot(lesson, mode)
            expect(state['conflicts'] == ['release.txt'], 'conflict detected by repository state')
            expect('<<<<<<<' in engine.read_file(repo, 'release.txt'), 'editor sees true conflict markers')
            engine.write_file(repo, 'release.txt', target + '\n')
            command(repo, 'add', 'release.txt')
            command(repo, 'commit', '-m', '合并队友更新')
            command(repo, 'switch', 'main')
            command(repo, 'merge', 'feature/welcome')
            expect(not engine.snapshot(lesson, mode)['complete'], 'must not pass before push')
            command(repo, 'push', 'origin', 'main')
        else:
            command(repo, 'restore', '--', 'notes.txt')
            command(repo, 'restore', '--staged', '--', 'draft.txt')
            expect(not engine.snapshot(lesson, mode)['complete'], 'must restore committed config too')
            command(repo, 'revert', '--no-edit', 'HEAD')
            expect(bool(command(repo, 'diff').stdout.strip()), 'intentional draft remains dirty')
        state = engine.snapshot(lesson, mode)
        expect(state['complete'], f'{lesson} {mode}: {state["checks"]} {state["error"]}')
        # Resume retains actual state; explicit reset restores the scenario.
        expect(engine.initialize(lesson, mode)['complete'], 'resume must preserve work')
        expect(not engine.initialize(lesson, mode, True)['complete'], 'reset must restore initial state')
        print(f'PASS {lesson}/{mode}', flush=True)

base, repo = engine.location('basics', 'guided')
for name in ['../../etc/passwd', '/etc/passwd', '.git/config', 'folder/../../escape']:
    try:
        engine.write_file(repo, name, 'bad')
        raise AssertionError('unsafe editor path accepted: ' + name)
    except ValueError:
        checks += 1
(repo / 'escape').symlink_to('/etc/passwd')
try:
    engine.read_file(repo, 'escape')
    raise AssertionError('symlink read accepted')
except ValueError:
    checks += 1
os.mkfifo(repo / 'pipe')
try:
    engine.write_file(repo, 'pipe', 'bad')
    raise AssertionError('FIFO write accepted')
except (ValueError, OSError):
    checks += 1
expect(os.getuid() == 1000, 'ordinary user')
expect(not Path('/mnt/c').exists(), 'Windows drive not visible')
expect(not Path('/init').exists(), 'WSL init not visible')
expect(not Path('/run/WSL').exists(), 'WSL sockets not visible')
expect('WSL_INTEROP' not in os.environ, 'interop variable removed')
proc_status = Path('/proc/self/status').read_text()
expect('NoNewPrivs:\t1' in proc_status, 'no new privileges')
expect('CapEff:\t0000000000000000' in proc_status, 'no effective capabilities')
try:
    Path('/etc/git-onboarding').write_text('bad')
    raise AssertionError('root filesystem was writable')
except OSError:
    checks += 1
sock = socket.socket()
sock.settimeout(1)
try:
    sock.connect(('1.1.1.1', 443))
    raise AssertionError('network escape')
except OSError:
    checks += 1
finally:
    sock.close()
print(json.dumps({'passed': checks, 'isolation': 'PASS', 'lessons': 6}), flush=True)

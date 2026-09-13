"""Exercise public engine operations with real Git, including incorrect outcomes."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path.insert(0, os.environ.get('COURSE_TEST_DIR', '/opt/git-onboarding'))
import engine as e

count = 0

def expect(value, message):
    global count
    assert value, message
    count += 1

def g(repo, *args, check=True):
    proc = subprocess.run(['git', '-C', str(repo), *args], env=e.SAFE_ENV, capture_output=True, text=True)
    if check:
        assert proc.returncode == 0, proc.stderr
    return proc

def complete(lesson, mode):
    state = e.snapshot(lesson, mode)
    expect(state['complete'], f'{lesson}/{mode}: {state["checks"]} {state["error"]}')

def host(lesson, mode, operation, **kwargs):
    return e.dispatch(dict(action='host', lesson=lesson, mode=mode, operation=operation, **kwargs))

def rejected(call, message):
    try:
        call()
    except ValueError:
        expect(True, message)
    else:
        raise AssertionError(message)

with tempfile.TemporaryDirectory(prefix='advanced-scenarios-') as directory:
    e.ROOT = Path(directory) / 'labs'
    for mode in ['guided', 'challenge']:
        for lesson in sorted(e.advanced.IDS - e.advanced.hosting.IDS | {'fork-pr'}):
            initial = e.initialize(lesson, mode, True)
            expect(initial['checks'] and not initial['complete'] and not initial['error'], f'{lesson} starts incomplete with valid checks')
            base, repo = e.location(lesson, mode)
            record = json.loads((base / 'scenario.json').read_text())
            value = record['value']
            if lesson in {'rebase', 'rebase-conflict'}:
                # A merge preserving all content must not satisfy a rebase exercise.
                merged = g(repo, 'merge', 'main', '--no-edit', check=False)
                if merged.returncode:
                    (repo / 'feature.txt').write_text(value + '\n')
                    e.commit(repo, 'resolve merge')
                expect(not e.snapshot(lesson, mode)['complete'], 'merge is not a rebase')
                g(repo, 'reset', '--hard', record['feature'])
                rebased = g(repo, 'rebase', 'main', check=False)
                if lesson.endswith('conflict'):
                    expect(rebased.returncode != 0 and e.snapshot(lesson, mode)['operation'] == 'rebase', 'real rebase conflict visible')
                    g(repo, 'rebase', '--abort')
                    expect(g(repo, 'rev-parse', 'HEAD').stdout.strip() == record['feature'], 'abort restores original head')
                    g(repo, 'rebase', 'main', check=False)
                    (repo / 'feature.txt').write_text(value + '\n')
                    g(repo, 'add', 'feature.txt')
                    g(repo, 'rebase', '--continue')
                else:
                    expect(rebased.returncode == 0, 'nonconflicting rebase succeeds')
            elif lesson == 'interactive-rebase':
                # Drive the real interactive todo editor deterministically, preserving the real rebase engine.
                script = Path(directory) / 'todo.py'
                script.write_text('import sys\nfrom pathlib import Path\np=Path(sys.argv[1])\ns=p.read_text().splitlines()\nn=0\nfor i,line in enumerate(s):\n if line.startswith("pick "):\n  n+=1\n  if n>1: s[i]="fixup "+line[5:]\np.write_text("\\n".join(s)+"\\n")\n')
                result = subprocess.run(['git', '-C', str(repo), 'rebase', '-i', 'main'],
                    env={**e.SAFE_ENV, 'GIT_SEQUENCE_EDITOR': f'python3 {script}'}, capture_output=True, text=True)
                expect(result.returncode == 0, result.stderr)
            elif lesson.startswith('cherry-pick'):
                g(repo, 'commit', '--allow-empty', '-m', '修复：启用严格模式')
                expect(not e.snapshot(lesson, mode)['complete'], 'matching message cannot pass')
                g(repo, 'reset', '--hard', 'HEAD~1')
                result = g(repo, 'cherry-pick', '-x', 'fix-to-pick', check=False)
                if lesson.endswith('conflict'):
                    expect(result.returncode != 0 and e.snapshot(lesson, mode)['operation'] == 'cherry-pick', 'real cherry-pick conflict visible')
                    g(repo, 'cherry-pick', '--abort')
                    expect(not e.snapshot(lesson, mode)['operation'], 'abort clears operation')
                    g(repo, 'cherry-pick', '-x', 'fix-to-pick', check=False)
                    (repo / 'config.ini').write_text('safe_mode=strict\n')
                    g(repo, 'add', 'config.ini')
                    g(repo, 'cherry-pick', '--continue')
                else:
                    expect(result.returncode == 0, result.stderr)
            elif lesson == 'stash':
                g(repo, 'stash', 'push', '-u', '-m', 'save work')
                expect(not (repo / 'scratch.txt').exists(), 'stash -u includes untracked draft')
                g(repo, 'switch', 'hotfix')
                (repo / 'config.ini').write_text('safe_mode=strict\n')
                e.commit(repo, 'hotfix')
                g(repo, 'switch', 'main')
                expect(not e.snapshot(lesson, mode)['complete'], 'missing drafts fails')
                g(repo, 'stash', 'pop')
            elif lesson == 'reflog':
                log = g(repo, 'reflog', '--format=%H').stdout
                expect(record['lost'] in log, 'lost work remains in reflog')
                g(repo, 'switch', '-c', 'recovered', record['lost'])
            elif lesson == 'fork-pr':
                rejected(lambda: host(lesson, mode, 'create', title='feature', branch='feature/welcome'), 'cannot PR before fork')
                host(lesson, mode, 'fork')
                host(lesson, mode, 'fork')
                g(repo, 'remote', 'add', 'origin', str(base / 'origin.git'))
                g(repo, 'remote', 'add', 'upstream', str(base / 'upstream.git'))
                g(repo, 'fetch', 'upstream')
                g(repo, 'merge', '--ff-only', 'upstream/main')
                g(repo, 'switch', '-c', 'feature/welcome')
                (repo / 'feature.txt').write_text(value + '\n')
                e.commit(repo, 'contribution')
                rejected(lambda: host(lesson, mode, 'create', title='feature', branch='feature/welcome'), 'local commit is not pushed')
                g(repo, 'push', '-u', 'origin', 'feature/welcome')
                rejected(lambda: host(lesson, mode, 'create', title='feature', branch='feature/../../HEAD'), 'invalid ref rejected')
                host(lesson, mode, 'create', title='贡献功能', branch='feature/welcome')
                state = host(lesson, mode, 'review')
                expect(state['hosting']['pr']['review'] == 'changes_requested', 'review requires tests')
                rejected(lambda: host(lesson, mode, 'merge'), 'cannot merge changes-requested PR')
                (repo / 'tests.txt').write_text('tests=pass\n')
                e.commit(repo, 'add tests')
                state = host(lesson, mode, 'review')
                expect(state['hosting']['pr']['review'] == 'changes_requested', 'unpushed tests do not satisfy remote review')
                g(repo, 'push', 'origin', 'feature/welcome')
                state = host(lesson, mode, 'review')
                expect(state['hosting']['pr']['review'] == 'approved', 'pushed tests approve review')
                (repo / 'README.md').write_text('# Contribution\n')
                e.commit(repo, 'extra change')
                g(repo, 'push', 'origin', 'feature/welcome')
                expect(e.snapshot(lesson, mode)['hosting']['pr']['staleReview'], 'new remote head invalidates approval')
                rejected(lambda: host(lesson, mode, 'merge'), 'cannot merge stale review')
                host(lesson, mode, 'review')
                state = host(lesson, mode, 'merge')
                expect(state['hosting']['pr']['status'] == 'merged' and not state['complete'], 'merge alone still requires sync')
                g(repo, 'switch', 'main')
                g(repo, 'fetch', 'upstream')
                g(repo, 'merge', '--ff-only', 'upstream/main')
                expect(not e.snapshot(lesson, mode)['complete'], 'must also synchronize personal origin')
                g(repo, 'push', 'origin', 'main')
                g(repo, 'branch', '-d', 'feature/welcome')
                g(repo, 'push', 'origin', '--delete', 'feature/welcome')
            complete(lesson, mode)
            expect(e.initialize(lesson, mode)['complete'], 'resume preserves achievement')
            expect(not e.initialize(lesson, mode, True)['complete'], 'reset creates original scenario')
            print(f'PASS {lesson}/{mode}', flush=True)
    print(f'Advanced scenarios: {count} assertions passed', flush=True)

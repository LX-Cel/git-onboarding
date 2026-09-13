"""Real Git workflows, incorrect outcomes and reset/resume through the engine."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path.insert(0, os.environ.get('COURSE_TEST_DIR', '/opt/git-onboarding'))
import engine as e
import maintenance as m

count = 0
def expect(value, message):
    global count
    assert value, message
    count += 1

def g(repo, *args, check=True, input=None):
    result = subprocess.run(['git', '-C', str(repo), *args], env=e.SAFE_ENV, text=True, capture_output=True, input=input)
    if check:
        assert result.returncode == 0, result.stderr
    return result

def complete(lesson, mode):
    state = e.snapshot(lesson, mode)
    expect(state['complete'], f'{lesson}/{mode}: {state["checks"]} {state["error"]}')

with tempfile.TemporaryDirectory(prefix='maintenance-scenarios-') as directory:
    e.ROOT = Path(directory) / 'labs'
    expect(e.IDS == {'basics', 'collab', 'recovery'} | e.advanced.IDS | m.IDS | e.teamwork.IDS | e.foundations.IDS, 'every catalog lesson has an implementation')
    expect(len(e.IDS) == len(e.LESSONS), 'catalog IDs are unique')
    for mode in ['guided', 'challenge']:
        for lesson in sorted(m.IDS):
            state = e.initialize(lesson, mode, True)
            expect(state['checks'] and not state['complete'] and not state['error'], f'{lesson}/{mode} starts incomplete with valid checks')
            base, repo = e.location(lesson, mode)
            record = json.loads((base / 'scenario.json').read_text())
            if lesson == 'partial-stage':
                e.commit(repo, 'incorrect: both hunks')
                expect(not e.snapshot(lesson, mode)['complete'], 'committing both edits must fail')
                g(repo, 'reset', '--mixed', 'baseline')
                result = g(repo, 'add', '-p', 'settings.ini', input='y\nn\n')
                expect('@@' in result.stdout, 'real interactive patch selector used')
                expect(not e.snapshot(lesson, mode)['complete'], 'staging without commit cannot pass')
                g(repo, 'commit', '-m', 'feature only')
            elif lesson == 'amend':
                g(repo, 'add', 'tests.txt')
                g(repo, 'commit', '-m', 'incorrect extra commit')
                expect(not e.snapshot(lesson, mode)['complete'], 'extra commit does not repair original')
                g(repo, 'reset', '--soft', 'HEAD~1')
                g(repo, 'commit', '--amend', '--no-edit')
            elif lesson.startswith('reset-'):
                # Each goal must distinguish all three resulting index/worktree states.
                correct = lesson.removeprefix('reset-')
                for wrong in {'soft', 'mixed', 'hard'} - {correct}:
                    g(repo, 'reset', '--hard', record['beforeReset'])
                    g(repo, 'reset', '--' + wrong, 'baseline')
                    expect(not e.snapshot(lesson, mode)['complete'], f'{wrong} cannot satisfy {correct}')
                g(repo, 'reset', '--hard', record['beforeReset'])
                g(repo, 'reset', '--' + correct, 'baseline')
            elif lesson == 'worktree':
                # Independent clones are deliberately not accepted as linked worktrees.
                linked = base / 'hotfix-tree'
                e.git(base, 'clone', str(repo), str(linked))
                e.config(linked)
                g(linked, 'switch', '-c', 'hotfix')
                (linked / 'config.ini').write_text('safe_mode=strict\n')
                e.commit(linked, 'fix in wrong clone')
                expect(not e.snapshot(lesson, mode)['complete'], 'clone is not shared worktree')
                import shutil
                shutil.rmtree(linked)
                g(repo, 'worktree', 'add', str(linked), '-b', 'hotfix')
                expect(g(repo, 'worktree', 'add', str(base / 'duplicate'), 'main', check=False).returncode != 0, 'cannot check out main in two trees by default')
                (linked / 'config.ini').write_text('safe_mode=strict\n')
                expect(not e.snapshot(lesson, mode)['complete'], 'uncommitted hotfix fails')
                e.commit(linked, 'isolated hotfix')
            elif lesson == 'bisect':
                g(repo, 'branch', 'culprit', 'HEAD')
                expect(not e.snapshot(lesson, mode)['complete'], 'latest bad is not necessarily first bad')
                g(repo, 'branch', '-D', 'culprit')
                g(repo, 'bisect', 'start', 'HEAD', 'baseline')
                expect(e.snapshot(lesson, mode)['operation'] == 'bisect', 'ongoing bisect visible')
                result = g(repo, 'bisect', 'run', 'python3', 'check.py')
                expect('is the first bad commit' in result.stdout, 'test script locates real regression')
                actual = g(repo, 'rev-parse', 'refs/bisect/bad').stdout.strip()
                expect(actual == record['firstBad'], f'bisect identified {actual}, expected {record["firstBad"]}: {result.stdout}')
                g(repo, 'branch', 'culprit', 'refs/bisect/bad')
                expect(not e.snapshot(lesson, mode)['complete'], 'must finish bisect and restore main')
                g(repo, 'bisect', 'reset')
            elif lesson == 'tags':
                tag = record['tag']
                g(repo, 'tag', tag)
                g(repo, 'push', 'origin', 'main', tag)
                expect(not e.snapshot(lesson, mode)['complete'], 'lightweight tag fails even when pushed')
                g(repo, 'push', 'origin', '--delete', tag)
                g(repo, 'tag', '-d', tag)
                g(repo, 'tag', '-a', tag, 'baseline', '-m', 'wrong target')
                g(repo, 'push', 'origin', tag)
                expect(not e.snapshot(lesson, mode)['complete'], 'annotated tag at wrong commit fails')
                g(repo, 'push', 'origin', '--delete', tag)
                g(repo, 'tag', '-d', tag)
                g(repo, 'tag', '-a', tag, '-m', 'release')
                expect(not e.snapshot(lesson, mode)['complete'], 'local-only tag fails')
                g(repo, 'push', 'origin', 'main', '--follow-tags')
            elif lesson == 'ignore':
                expect('.gitignore' in state['files'], 'project dotfile is shown in editor')
                e.write_file(repo, '.gitignore', '*.log\ncache/\n')
                expect(e.read_file(repo, '.gitignore') == '*.log\ncache/\n', 'project dotfile can be edited')
                g(repo, 'add', '.gitignore')
                g(repo, 'commit', '-m', 'ignore rules only')
                expect(not e.snapshot(lesson, mode)['complete'], 'ignore rules do not untrack existing files')
                g(repo, 'rm', '--cached', 'build.log')
                g(repo, 'rm', '-r', '--cached', 'cache')
                g(repo, 'commit', '-m', 'untrack build outputs')
                complete(lesson, mode)
                (repo / 'build.log').unlink()
                expect(not e.snapshot(lesson, mode)['complete'], 'deleting local log violates preservation requirement')
                (repo / 'build.log').write_text('构建日志要保留在本地\n')
                for bad_path in ['.git/config', '.gitignore/secret', 'nested/.git/HEAD', '.ssh/config', '../.gitignore']:
                    try:
                        e.write_file(repo, bad_path, 'bad')
                        raise AssertionError('editor allowed unsafe path: ' + bad_path)
                    except ValueError:
                        expect(True, 'protected path rejected')
            elif lesson == 'rename':
                (repo / 'docs').mkdir()
                (repo / 'docs/guide.md').write_text((repo / 'old-guide.md').read_text())
                e.commit(repo, 'copy only')
                expect(not e.snapshot(lesson, mode)['complete'], 'copy without removing old path fails')
                g(repo, 'reset', '--hard', 'baseline')
                (repo / 'docs').mkdir(exist_ok=True)
                g(repo, 'mv', 'old-guide.md', 'docs/guide.md')
                g(repo, 'rm', 'obsolete.txt')
                g(repo, 'commit', '-m', 'move guide and remove obsolete example')
                expect('建立正确的基线' in g(repo, 'log', '--follow', '--format=%s', '--', 'docs/guide.md').stdout, 'history follows rename')
            complete(lesson, mode)
            expect(e.initialize(lesson, mode)['complete'], 'resume preserves correct result')
            expect(not e.initialize(lesson, mode, True)['complete'], 'reset reconstructs initial state')
            print(f'PASS {lesson}/{mode}', flush=True)
    print(f'Maintenance scenarios: {count} assertions passed', flush=True)

"""Lifecycle and recovery checks exercise real initial failures, not command tracking."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path.insert(0, os.environ['COURSE_TEST_DIR'])
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


with tempfile.TemporaryDirectory(prefix='foundations-') as directory:
    e.ROOT = Path(directory) / 'labs'
    expect(e.IDS == {'basics', 'collab', 'recovery'} | e.advanced.IDS | e.maintenance.IDS | e.teamwork.IDS | e.foundations.IDS | e.extensions.IDS | e.access.IDS | e.capstone.IDS, 'all catalog courses implemented')
    for mode in ['guided', 'challenge']:
        for lesson in sorted(e.foundations.IDS):
            state = e.initialize(lesson, mode, True)
            expect(not state['error'] and state['checks'] and not state['complete'], f'{lesson} starts valid and incomplete: {state["error"]}')
            base, repo = e.location(lesson, mode)
            record = json.loads((base / 'scenario.json').read_text())
            value = record['value']
            snapshot = lambda: e.snapshot(lesson, mode)
            if lesson == 'init-config':
                expect(not (repo / '.git').exists(), 'ordinary directory has no git repository')
                g(repo, 'init', '-b', 'main')
                expect(not snapshot()['complete'], 'init alone is not complete')
                g(repo, 'config', 'user.name', 'Practice User')
                g(repo, 'config', 'user.email', 'wrong@example.invalid')
                (repo / 'README.md').write_text('# 新项目\n' + value + '\n')
                e.commit(repo, 'first commit')
                expect(not snapshot()['complete'], 'wrong identity rejected')
                g(repo, 'config', '--local', 'user.email', 'learner@example.invalid')
                expect(not snapshot()['complete'], 'configuration does not rewrite existing author')
                g(repo, 'commit', '--amend', '--reset-author', '--no-edit')
            elif lesson == 'clone-tracking':
                expect(not state['files'] and not state['history'], 'clone begins with an empty directory')
                g(repo, 'clone', str(base / 'origin.git'), '.')
                e.config(repo)
                expect(not snapshot()['complete'], 'clone alone is incomplete')
                g(repo, 'switch', '--track', 'origin/feature/team')
                (repo / 'feature.txt').write_text(value + '\n')
                e.commit(repo, 'team contribution')
                expect(not snapshot()['complete'], 'local work still needs push')
                g(repo, 'push')
                g(repo, 'branch', '--unset-upstream')
                expect(not snapshot()['complete'], 'tracking configuration matters')
                g(repo, 'branch', '--set-upstream-to=origin/feature/team')
            elif lesson == 'merge-abort':
                expect(state['operation'] == 'merge' and 'feature.txt' in state['conflicts'], 'real merge has stopped with conflict')
                (repo / 'feature.txt').write_text('main-version\n')
                g(repo, 'add', 'feature.txt')
                g(repo, 'commit', '-m', 'resolved merge')
                expect(not snapshot()['complete'], 'resolving instead of aborting does not satisfy goal')
                g(repo, 'reset', '--hard', record['main'])
                expect(g(repo, 'merge', 'feature/topic', check=False).returncode != 0, 'retry reproduces conflict')
                g(repo, 'merge', '--abort')
                expect(not snapshot()['operation'], 'abort clears merge operation')
                (repo / 'notes.txt').unlink()
                expect(not snapshot()['complete'], 'lost unrelated draft cannot pass')
                (repo / 'notes.txt').write_text('untracked draft to keep\n')
            elif lesson.startswith('pull-'):
                g(repo, 'fetch', 'origin')
                expect(not snapshot()['complete'], 'fetch alone does not integrate')
                expect(g(repo, 'pull', '--ff-only', check=False).returncode != 0, 'fast-forward refuses divergent history')
                expect(e.git(repo, 'rev-parse', 'HEAD') == record['local'], 'refused pull preserves local tip')
                if lesson == 'pull-merge':
                    g(repo, 'pull', '--rebase')
                    expect(not snapshot()['complete'], 'linear replay cannot pass merge policy')
                    g(repo, 'reset', '--hard', record['local'])
                    g(repo, 'config', '--local', 'pull.rebase', 'false')
                    g(repo, 'pull', '--no-edit')
                else:
                    g(repo, 'pull', '--no-rebase', '--no-edit')
                    expect(not snapshot()['complete'], 'merge cannot pass linear policy')
                    g(repo, 'reset', '--hard', record['local'])
                    if lesson == 'pull-ff-only':
                        g(repo, 'config', '--local', 'pull.ff', 'only')
                        expect(g(repo, 'pull', check=False).returncode != 0, 'configured ff-only also refuses divergence')
                        g(repo, 'rebase', 'origin/main')
                    else:
                        g(repo, 'config', '--local', 'pull.rebase', 'true')
                    g(repo, 'pull')
                expect(not snapshot()['complete'], 'integration still needs remote synchronization')
                g(repo, 'push')
            elif lesson in {'detached-head', 'deleted-branch', 'fsck-recovery'}:
                if lesson == 'detached-head':
                    expect(not state['branch'] and e.git(repo, 'rev-parse', 'HEAD') == record['lost'], 'work exists on detached HEAD')
                else:
                    expect(not e.git(repo, 'show-ref', '--verify', 'refs/heads/feature/lost', check=False), 'branch was really deleted')
                if lesson == 'fsck-recovery':
                    expect(record['lost'] not in e.git(repo, 'reflog', '--all'), 'reflog cannot supply lost object')
                    expect('dangling commit ' + record['lost'] in g(repo, 'fsck', '--full', '--no-reflogs').stdout, 'fsck discovers actual dangling commit')
                elif lesson == 'deleted-branch':
                    expect(record['lost'] in e.git(repo, 'reflog', '--all', '--format=%H'), 'reflog identifies removed branch tip')
                g(repo, 'switch', '-c', 'recovered', record['initial'])
                (repo / 'feature.txt').write_text(value + '\n')
                e.commit(repo, 'similar replacement')
                expect(not snapshot()['complete'], 'same content is not original commit recovery')
                g(repo, 'reset', '--hard', record['lost'])
                if lesson == 'fsck-recovery':
                    expect(not snapshot()['complete'], 'recovery alone has not completed object maintenance')
                    g(repo, 'gc')
                    expect(g(repo, 'fsck', '--full').returncode == 0, 'reachable recovered work survives gc')
                    expect(e.git(repo, 'rev-parse', 'recovered') == record['lost'], 'gc preserves recovered reference')
            elif lesson == 'blame-log':
                blame = g(repo, 'blame', '--porcelain', '-L', '2,2', 'config.ini').stdout
                expect(blame.startswith(record['bad']), 'blame locates exact modifying commit')
                expect(record['bad'] in e.git(repo, 'log', '--format=%H', '-S', 'retries=0', '--', 'config.ini'), 'pickaxe independently locates change')
                (repo / 'config.ini').write_text(f'timeout=30\nretries={record["retries"]}\nmode=safe\n')
                (repo / 'investigation.txt').write_text('suspect=' + record['tip'] + '\n')
                e.commit(repo, 'fix with wrong attribution')
                expect(not snapshot()['complete'], 'correct fix with incorrect diagnosis fails')
                (repo / 'investigation.txt').write_text('suspect=' + record['bad'] + '\n')
                e.commit(repo, 'correct diagnosis')
            elif lesson == 'am-conflict':
                expect(state['operation'] == 'am' and state['conflicts'], 'real mail application conflict is identified as am')
                expect('Patch Contributor' in g(repo, 'am', '--show-current-patch').stdout, 'original mail is inspectable')
                g(repo, 'am', '--abort')
                expect(e.git(repo, 'rev-parse', 'HEAD') == record['main'] and not snapshot()['operation'], 'am abort restores pre-application main')
                (repo / 'feature.txt').write_text(value + '\n')
                e.commit(repo, 'manual commit')
                expect(not snapshot()['complete'], 'manual own-author commit cannot replace mail author')
                g(repo, 'reset', '--hard', record['main'])
                expect(g(repo, 'am', '-3', str(base / 'incoming.patch'), check=False).returncode != 0, 'am retry conflicts again')
                (repo / 'feature.txt').write_text(value + '\n')
                g(repo, 'add', 'feature.txt')
                expect(not snapshot()['complete'], 'staged resolution alone is incomplete')
                g(repo, 'am', '--continue')
            elif lesson == 'attributes':
                binary = (repo / 'asset.bin').read_bytes()
                (repo / '.gitattributes').write_text('*.sh text eol=lf\n*.cmd text eol=crlf\n*.bin -text\n')
                g(repo, 'add', '.gitattributes')
                g(repo, 'commit', '-m', 'rules only')
                expect(not snapshot()['complete'], 'rules alone do not normalize old blobs')
                g(repo, 'add', '--renormalize', '.')
                g(repo, 'commit', '-m', 'normalize tracked files')
                expect(not snapshot()['complete'], 'working file bytes still need checkout conversion')
                (repo / 'run.sh').unlink()
                (repo / 'run.cmd').unlink()
                g(repo, 'restore', '--source=HEAD', '--worktree', 'run.sh', 'run.cmd')
                g(repo, 'add', 'run.sh', 'run.cmd')
                expect(not e.git(repo, 'diff', '--cached'), 'index refresh adds no content change')
                expect((repo / 'asset.bin').read_bytes() == binary, 'binary remains byte-identical')
                expect('i/lf    w/crlf' in e.git(repo, 'ls-files', '--eol', 'run.cmd'), 'CMD index LF and workspace CRLF differ intentionally')
            state = snapshot()
            expect(state['complete'], f'{lesson}/{mode} {state["checks"]} {state["error"]} {state["changes"]} {state["diff"]}')
            expect(e.initialize(lesson, mode)['complete'], 'resume preserves correct outcome')
            expect(not e.initialize(lesson, mode, True)['complete'], 'reset restores original exercise')
            print(f'PASS {lesson}/{mode}', flush=True)
    print(f'Foundations scenarios: {count} assertions passed', flush=True)

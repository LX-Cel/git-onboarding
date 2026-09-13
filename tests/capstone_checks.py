"""Validate complete work outcomes, including the drafts and history that must survive."""
import json
import os
from pathlib import Path
import shutil
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
    result = subprocess.run(['git', '-C', str(repo), *args], env=e.SAFE_ENV, capture_output=True, text=True, timeout=20)
    if check:
        assert result.returncode == 0, result.stderr
    return result


with tempfile.TemporaryDirectory(prefix='capstone-') as directory:
    e.ROOT = Path(directory) / 'labs'
    for mode in ['guided', 'challenge']:
        for lesson in sorted(e.capstone.IDS):
            first = e.initialize(lesson, mode, True)
            expect(not first['error'] and not first['complete'], f'{lesson} starts valid but not completed: {first["error"]}')
            base, repo = e.location(lesson, mode)
            record = json.loads((base / 'scenario.json').read_text())
            value, draft = record['value'], record['draft']
            snapshot = lambda: e.snapshot(lesson, mode)
            if lesson == 'capstone-onboarding':
                expect(first['repositoryReady'] is False and first['files'] == [], 'onboarding actually starts in an empty directory')
                g(repo, 'init', '-b', 'main')
                e.config(repo)
                g(repo, 'commit', '--allow-empty', '-m', 'unrelated replacement')
                expect(not snapshot()['complete'], 'unrelated initialization cannot substitute for team history')
                shutil.rmtree(repo / '.git')
                g(repo, 'clone', '../origin.git', '.')
                e.config(repo)
                g(repo, 'switch', '--track', 'origin/feature/welcome')
                (repo / 'feature.txt').write_text(value + '\n')
                (repo / 'notes.local').write_text('个人入职笔记\n')
                (repo / '.gitignore').write_text('notes.local\n')
                g(repo, 'add', '.gitignore', 'feature.txt')
                g(repo, 'commit', '-m', 'complete handover')
                expect(not snapshot()['complete'], 'locally completed handover still needs remote delivery')
                g(repo, 'push', '-u', 'origin', 'feature/welcome')
                expect(snapshot()['complete'], 'cloned handover passes after valid delivery')
                valid = e.git(repo, 'rev-parse', 'HEAD')
                g(repo, 'commit', '--amend', '--no-edit', '--author=Wrong Author <wrong@example.invalid>')
                g(repo, 'commit', '--allow-empty', '-m', 'correct identity but no feature change')
                g(repo, 'push', '--force-with-lease', 'origin', 'feature/welcome')
                expect(not snapshot()['complete'], 'empty correctly attributed commit cannot disguise wrong feature author')
                g(repo, 'reset', '--hard', valid)
                g(repo, 'push', '--force-with-lease', 'origin', 'feature/welcome')
                (repo / 'notes.local').unlink()
                expect(not snapshot()['complete'], 'ignoring notes does not permit losing them')
                (repo / 'notes.local').write_text('个人入职笔记\n')
                g(repo, 'branch', '--unset-upstream')
                expect(not snapshot()['complete'], 'handover needs usable branch tracking')
                g(repo, 'branch', '--set-upstream-to=origin/feature/welcome')
            elif lesson == 'capstone-release':
                g(repo, 'stash', 'push', '-m', 'personal draft')
                g(repo, 'reset', '--hard', record['initial'])
                expect(not snapshot()['complete'], 'hard reset cannot stand in for shared release recovery')
                g(repo, 'reset', '--hard', record['bad'])
                g(repo, 'revert', '--no-edit', 'v2.0.0')
                (repo / 'version.txt').write_text('2.0.1\n')
                e.commit(repo, 'prepare patch version')
                g(repo, 'tag', 'v2.0.1')
                g(repo, 'push', 'origin', 'main', 'refs/tags/v2.0.1')
                g(repo, 'stash', 'pop')
                expect(not snapshot()['complete'], 'lightweight release tag lacks annotation')
                g(repo, 'tag', '-d', 'v2.0.1')
                g(repo, 'tag', '-a', 'v2.0.1', '-m', 'safe patch release')
                expect(not snapshot()['complete'], 'local tag repair still needs remote tag update')
                # Only the test's intentionally bad lightweight tag is replaced.
                old_tag = e.git(base / 'origin.git', 'rev-parse', 'v2.0.1')
                g(repo, 'push', '--force-with-lease=refs/tags/v2.0.1:'+old_tag, 'origin', 'refs/tags/v2.0.1')
                expect(snapshot()['complete'], 'shared release evidence and drafts survive patch release')
                published = e.git(repo, 'rev-parse', 'v2.0.0')
                g(repo, 'tag', '-f', 'v2.0.0', 'HEAD')
                expect(not snapshot()['complete'], 'rewriting published release evidence invalidates recovery')
                g(repo, 'update-ref', 'refs/tags/v2.0.0', published)
                g(repo, 'add', 'draft.txt')
                expect(not snapshot()['complete'], 'personal draft must not remain staged for release')
                g(repo, 'restore', '--staged', 'draft.txt')
            elif lesson == 'capstone-concurrent':
                expect(g(repo, 'rebase', 'origin/main', check=False).returncode != 0, 'unstaged draft requires protection before rebase')
                g(repo, 'stash', 'push', '-u', '-m', 'protect both drafts')
                g(repo, 'fetch', 'origin')
                expect(g(repo, 'rebase', 'origin/main', check=False).returncode != 0, 'concurrent changes produce actual rebase conflict')
                expect(snapshot()['operation'] == 'rebase' and 'feature.txt' in snapshot()['conflicts'], 'UI exposes interrupted operation and conflicting file')
                g(repo, 'rebase', '--abort')
                expect(e.git(repo, 'rev-parse', 'HEAD') == record['feature'], 'abort restores original feature commit')
                g(repo, 'rebase', 'origin/main', check=False)
                (repo / 'feature.txt').write_text(value + '\n')
                g(repo, 'add', 'feature.txt')
                g(repo, 'rebase', '--continue')
                expect(not snapshot()['complete'], 'integrated local branch is not yet delivered')
                expect(g(repo, 'push', 'origin', 'feature/topic', check=False).returncode != 0, 'ordinary push rejects rewritten feature history')
                g(repo, 'push', '--force-with-lease', 'origin', 'feature/topic')
                expect(not snapshot()['complete'], 'delivery still needs personal work restored')
                g(repo, 'stash', 'pop')
                expect(snapshot()['complete'], 'linear delivery and both restored drafts pass')
                (repo / 'notes.local').unlink()
                expect(not snapshot()['complete'], 'dropping untracked notes is data loss')
                (repo / 'notes.local').write_text('本地笔记-'+mode+'\n')
            elif lesson == 'capstone-legacy':
                expect(not first['branch'], 'legacy repo actually starts detached')
                expect(g(repo, 'fetch', 'origin', check=False).returncode != 0, 'bad remote fails actual fetch')
                candidate = g(repo, 'log', '-g', '--all', '--format=%H', '--grep=遗失的完整功能提交', '-1').stdout.strip()
                expect(candidate == record['lost'], 'reflog reveals original missing commit')
                g(repo, 'switch', '-C', 'main', candidate)
                g(repo, 'restore', '--worktree', 'config.ini')
                g(repo, 'remote', 'set-url', 'origin', '../origin.git')
                expect(not snapshot()['complete'], 'local recovery alone cannot replace remote delivery')
                g(repo, 'push', '-u', 'origin', 'main')
                expect(snapshot()['complete'], 'exact original commit, remote and two draft layers recovered')
                g(repo, 'restore', '--staged', 'draft.txt')
                expect(not snapshot()['complete'], 'unstaging the draft loses the required index version')
                working = (repo / 'draft.txt').read_text()
                (repo / 'draft.txt').write_text('staged-'+draft+'\n')
                g(repo, 'add', 'draft.txt')
                (repo / 'draft.txt').write_text(working)
            else:
                expect(first['freeplay'] and first['checks'] == [], 'freeplay has no pretend passing criteria')
                expect({r['name'] for r in first['remotes']} == {'origin', 'upstream'}, 'freeplay supplies two real remotes')
                g(repo, 'switch', 'feature/experiment')
                (repo / 'feature.txt').write_text('experiment\n')
                saved = e.commit(repo, 'free experiment')
                g(repo, 'push', 'origin', 'feature/experiment')
                state = snapshot()
                expect(state['head'] == saved[:7] and not state['complete'] and not state['error'], 'free changes are visible without turning into a graded completion')
                g(repo, 'switch', 'main')
                (repo / 'feature.txt').write_text('other experiment\n')
                e.commit(repo, 'other branch')
                expect(g(repo, 'merge', 'feature/experiment', check=False).returncode != 0, 'freeplay can create a real conflict')
                expect(snapshot()['conflicts'] == ['feature.txt'] and not snapshot()['error'], 'freeplay exposes conflicts without a grader error')
                resumed = e.initialize(lesson, mode)
                expect(resumed['conflicts'] == ['feature.txt'], 'freeplay preserves in-progress experiments across resume')
                g(repo, 'merge', '--abort')
                shutil.rmtree(repo / '.git')
                expect(not snapshot()['repositoryReady'] and not snapshot()['error'], 'freeplay can explore an uninitialized directory')
                g(repo, 'init', '-b', 'new-experiment')
                e.config(repo)
                e.commit(repo, 'new experiment repository')
                expect(snapshot()['branch'] == 'new-experiment', 'freeplay can rebuild its own repository')
            if lesson != 'freeplay':
                final = snapshot()
                expect(final['complete'] and not final['error'], f'{lesson} all required outcomes: {final["checks"]}')
                expect(e.initialize(lesson, mode)['complete'], 'finished composite task resumes')
            expect(not e.initialize(lesson, mode, True)['complete'], 'reset recreates initial task')
            print('PASS', lesson, mode)
print('Composite tasks and freeplay:', count, 'assertions passed')

"""Integration evidence for collaboration workflows using isolated real Git repos."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path.insert(0, os.environ.get('COURSE_TEST_DIR', '/opt/git-onboarding'))
import engine as e
import teamwork as t

count = 0
def expect(value, message):
    global count
    assert value, message
    count += 1

def g(repo, *args, check=True, extra_env=None):
    result = subprocess.run(['git', '-C', str(repo), *args], env={**e.SAFE_ENV, **(extra_env or {})}, capture_output=True, text=True)
    if check:
        assert result.returncode == 0, result.stderr
    return result

def complete(lesson, mode):
    state = e.snapshot(lesson, mode)
    expect(state['complete'], f'{lesson}/{mode}: {state["checks"]} {state["error"]}')

with tempfile.TemporaryDirectory(prefix='teamwork-scenarios-') as directory:
    e.ROOT = Path(directory) / 'labs'
    for mode in ['guided', 'challenge']:
        for lesson in sorted(t.IDS):
            state = e.initialize(lesson, mode, True)
            expect(state['checks'] and not state['complete'] and not state['error'], f'{lesson}/{mode} initial checks valid')
            base, repo = e.location(lesson, mode)
            record = json.loads((base / 'scenario.json').read_text())
            if lesson == 'push-rejected':
                expect(g(repo, 'push', 'origin', 'main', check=False).returncode != 0, 'diverged push really rejects')
                g(repo, 'fetch', 'origin')
                expect(not e.snapshot(lesson, mode)['complete'], 'fetch alone does not integrate work')
                g(repo, 'rebase', 'origin/main')
                expect(not e.snapshot(lesson, mode)['complete'], 'integrated but unpushed fails')
                g(repo, 'push', 'origin', 'main')
            elif lesson == 'force-with-lease':
                rejected = g(repo, 'push', '--force-with-lease', 'origin', 'feature/topic', check=False)
                expect(rejected.returncode != 0 and 'stale info' in rejected.stderr, 'stale tracking ref causes lease rejection')
                expect(e.git(base / 'origin.git', 'rev-parse', 'feature/topic') == record['teammate'], 'rejection preserves teammate tip')
                g(repo, 'fetch', 'origin')
                g(repo, 'branch', 'backup/team', 'origin/feature/topic')
                expect(not e.snapshot(lesson, mode)['complete'], 'backup alone does not preserve teammate content in rewritten branch')
                g(repo, 'cherry-pick', 'backup/team')
                expect(g(repo, 'push', 'origin', 'feature/topic', check=False).returncode != 0, 'rewritten history needs explicit authorized update')
                g(repo, 'push', '--force-with-lease=refs/heads/feature/topic:' + record['teammate'], 'origin', 'feature/topic')
            elif lesson == 'remote-repair':
                expect(g(repo, 'fetch', 'origin', check=False).returncode != 0, 'broken address cannot fetch')
                g(repo, 'remote', 'set-url', 'origin', str(base / 'origin.git'))
                g(repo, 'remote', 'rename', 'origin', 'upstream')
                expect(not e.snapshot(lesson, mode)['complete'], 'renaming does not prune stale remote branch')
                g(repo, 'fetch', '--prune', 'upstream')
            elif lesson == 'rebase-onto':
                g(repo, 'rebase', 'main')
                expect(not e.snapshot(lesson, mode)['complete'], 'ordinary rebase carries unwanted ancestor')
                g(repo, 'reset', '--hard', record['topic'])
                g(repo, 'rebase', '--onto', 'main', 'feature/base', 'feature/topic')
            elif lesson == 'autosquash':
                g(repo, 'rebase', '-i', '--autosquash', 'main', extra_env={'GIT_SEQUENCE_EDITOR': 'true'})
                expect(e.text_at(repo, 'HEAD^', 'feature.txt') == record['value'], 'fixup lands in feature commit, not documentation')
            elif lesson == 'stash-conflict':
                result = g(repo, 'stash', 'pop', check=False)
                expect(result.returncode != 0 and 'CONFLICT' in result.stdout, 'real stash conflict occurs')
                expect(bool(g(repo, 'stash', 'list').stdout), 'failed pop preserves stash')
                expect(e.snapshot(lesson, mode)['conflicts'] == ['feature.txt'], 'conflict shown in state')
                (repo / 'feature.txt').write_text(f'feature={record["value"]}\nteam=preserved\n')
                e.commit(repo, 'resolve stash conflict')
                expect(not e.snapshot(lesson, mode)['complete'], 'must deliberately clear restored stash')
                g(repo, 'stash', 'drop')
            elif lesson == 'merge-revert':
                expect(g(repo, 'revert', '--no-edit', 'bad-merge', check=False).returncode != 0, 'merge revert requires parent selection')
                g(repo, 'revert', '-m', '1', '--no-edit', 'bad-merge')
            elif lesson == 'submodule':
                g(repo, '-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', '--recursive')
                expect(not e.snapshot(lesson, mode)['complete'], 'initialization only restores pinned old version')
                module = repo / 'vendor/library'
                g(module, 'fetch', 'origin')
                g(module, 'checkout', 'origin/main')
                expect(not e.snapshot(lesson, mode)['complete'], 'submodule checkout alone does not update parent commit')
                g(repo, 'add', 'vendor/library')
                expect(not e.snapshot(lesson, mode)['complete'], 'staged gitlink is not committed')
                g(repo, 'commit', '-m', 'upgrade dependency')
            elif lesson == 'sparse-checkout':
                g(repo, 'rm', 'apps/admin/index.txt')
                e.commit(repo, 'incorrectly delete admin')
                expect(not e.snapshot(lesson, mode)['complete'], 'deletion is not sparse checkout')
                g(repo, 'reset', '--hard', 'baseline')
                g(repo, 'sparse-checkout', 'init', '--cone')
                g(repo, 'sparse-checkout', 'set', 'apps/web', 'docs')
            elif lesson == 'shallow-clone':
                checkout = base / 'checkout'
                g(base, 'clone', '--depth', '1', (base / 'origin.git').as_uri(), str(checkout))
                expect(g(checkout, 'rev-parse', '--is-shallow-repository').stdout.strip() == 'true', 'clone really is shallow')
                expect(not e.snapshot(lesson, mode)['complete'], 'shallow history is incomplete')
                g(checkout, 'fetch', '--deepen', '2', 'origin')
                expect(g(checkout, 'rev-list', '--count', 'HEAD').stdout.strip() == '3', 'incremental deepening works')
                expect(not e.snapshot(lesson, mode)['complete'], 'partial deepening is still incomplete')
                g(checkout, 'fetch', '--unshallow', 'origin')
            elif lesson == 'patch-am':
                g(repo, 'apply', str(base / 'incoming.patch'))
                e.commit(repo, 'manual application loses original author')
                expect(not e.snapshot(lesson, mode)['complete'], 'apply plus own commit loses original author')
                g(repo, 'reset', '--hard', record['main'])
                g(repo, 'am', str(base / 'incoming.patch'))
            elif lesson == 'bundle':
                (base / 'transfer.bundle').write_text('not a Git bundle')
                expect(not e.snapshot(lesson, mode)['complete'], 'invalid bundle does not count')
                g(repo, 'bundle', 'create', str(base / 'transfer.bundle'), '--all')
                expect(not e.snapshot(lesson, mode)['complete'], 'must verify by recovering actual repository')
                g(base, 'clone', str(base / 'transfer.bundle'), str(base / 'verification'))
            complete(lesson, mode)
            expect(e.initialize(lesson, mode)['complete'], 'resume retains solved state')
            expect(not e.initialize(lesson, mode, True)['complete'], 'reset recreates initial scenario')
            print(f'PASS {lesson}/{mode}', flush=True)
    print(f'Teamwork scenarios: {count} assertions passed', flush=True)

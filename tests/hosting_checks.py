"""Real offline PR checks, stale approvals, integration strategies, and receive hooks."""
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
    result = subprocess.run(['git', '-C', str(repo), *args], env=e.SAFE_ENV, capture_output=True, text=True)
    if check:
        assert result.returncode == 0, result.stderr
    return result


def rejected(call, message):
    try:
        call()
    except ValueError:
        expect(True, message)
    else:
        raise AssertionError(message)


with tempfile.TemporaryDirectory(prefix='hosting-tests-') as directory:
    e.ROOT = Path(directory) / 'labs'
    for mode in ['guided', 'challenge']:
        for lesson in sorted(e.advanced.hosting.IDS):
            state = e.initialize(lesson, mode, True)
            expect(not state['error'] and not state['complete'] and state['checks'], 'valid incomplete initial state')
            base, repo = e.location(lesson, mode)
            value = json.loads((base / 'scenario.json').read_text())['value']
            host = lambda operation, **kwargs: e.dispatch(dict(action='host', lesson=lesson, mode=mode, operation=operation, **kwargs))
            snapshot = lambda: e.snapshot(lesson, mode)
            host('fork')
            g(repo, 'remote', 'add', 'origin', str(base / 'origin.git'))
            g(repo, 'remote', 'add', 'upstream', str(base / 'upstream.git'))
            g(repo, 'fetch', 'upstream')
            g(repo, 'merge', '--ff-only', 'upstream/main')
            initial = e.git(repo, 'rev-parse', 'HEAD')
            g(repo, 'switch', '-c', 'feature/welcome')
            (repo / 'feature.txt').write_text(value + '\n')
            e.commit(repo, '功能提交')
            g(repo, 'push', '-u', 'origin', 'feature/welcome')
            if lesson == 'branch-protection':
                direct = g(repo, 'push', 'upstream', 'feature/welcome:main', check=False)
                expect(direct.returncode != 0 and 'Protected main' in direct.stderr, 'real hook rejects direct push')
                deletion = g(repo, 'push', 'upstream', '--delete', 'main', check=False)
                expect(deletion.returncode != 0, 'protected branch cannot be deleted')
                expect(e.git(base / 'upstream.git', 'rev-parse', 'main') == initial, 'rejected writes preserve upstream')
            if lesson == 'fork-pr':
                # Reproduce the record shape stored by the published preview, not new defaults.
                record = json.loads((base / 'scenario.json').read_text())
                record['hosting'] = {'forked': True, 'pr': None}
                (base / 'scenario.json').write_text(json.dumps(record))
                expect(not snapshot()['error'], 'old fork record remains readable')
            host('create', title='PR 功能贡献', branch='feature/welcome')
            state = host('check')
            expect(state['hosting']['pr']['checks'] == 'failed', 'integrated checks fail without tests')
            host('review')
            rejected(lambda: host('merge'), 'cannot merge failed review')
            (repo / 'tests.txt').write_text('tests=pass\n')
            e.commit(repo, '测试提交')
            expect(host('check')['hosting']['pr']['checks'] == 'failed', 'unpushed local tests do not pass CI')
            g(repo, 'push', 'origin', 'feature/welcome')
            expect(host('review')['hosting']['pr']['review'] == 'approved', 'updated remote passes review')
            strategy = snapshot()['hosting']['requiredStrategy']
            if lesson != 'fork-pr':
                expect(snapshot()['hosting']['pr']['staleChecks'], 'old failed result not reused')
                rejected(lambda: host('merge', strategy=strategy), 'approval alone cannot merge')
            expect(host('check')['hosting']['pr']['checks'] == 'passed', 'integrated feature and tests pass')
            if lesson == 'pr-conflict':
                rejected(lambda: host('merge'), 'cannot skip the upstream scenario')
                host('advance')
                pr = snapshot()['hosting']['pr']
                expect(pr['staleReview'] and pr['staleChecks'], 'base updates expire review and check')
                rejected(lambda: host('merge'), 'stale base cannot be merged')
                host('review')
                rejected(lambda: host('merge'), 'review alone cannot bypass stale base check')
                pr = host('check')['hosting']['pr']
                expect(pr['checks'] == 'failed' and '冲突' in pr['checkMessage'], 'real integration tree conflicts')
                g(repo, 'fetch', 'upstream')
                before = e.git(repo, 'rev-parse', 'HEAD')
                result = g(repo, 'rebase', 'upstream/main', check=False)
                expect(result.returncode != 0 and snapshot()['operation'] == 'rebase', 'learner encounters real rebase conflict')
                g(repo, 'rebase', '--abort')
                expect(e.git(repo, 'rev-parse', 'HEAD') == before, 'abort restores learner branch')
                g(repo, 'rebase', 'upstream/main', check=False)
                (repo / 'feature.txt').write_text(value + '\n')
                g(repo, 'add', 'feature.txt')
                g(repo, 'rebase', '--continue')
                expect(g(repo, 'push', 'origin', 'feature/welcome', check=False).returncode != 0, 'ordinary push refuses rewritten branch')
                g(repo, 'push', '--force-with-lease', 'origin', 'feature/welcome')
                host('review')
                expect(host('check')['hosting']['pr']['checks'] == 'passed', 'resolved integrated tree passes')
                rejected(lambda: host('advance'), 'upstream event only occurs once')
            # Every source update, including a documentation-only commit, expires checks and review.
            (repo / 'README.md').write_text('# PR contribution\n')
            e.commit(repo, '补充说明')
            g(repo, 'push', 'origin', 'feature/welcome')
            pr = snapshot()['hosting']['pr']
            expect(pr['staleChecks'] and pr['staleReview'], 'new source expires both gates')
            rejected(lambda: host('merge', strategy=strategy), 'stale source cannot merge')
            host('review')
            if lesson != 'fork-pr':
                rejected(lambda: host('merge', strategy=strategy), 'review cannot reuse checks for older head')
            host('check')
            if strategy != 'merge':
                rejected(lambda: host('merge', strategy='merge'), 'wrong integration strategy refused')
            source = e.git(repo, 'rev-parse', 'HEAD')
            base_head = e.git(base / 'upstream.git', 'rev-parse', 'main')
            source_count = int(e.git(repo, 'rev-list', '--count', f'{base_head}..HEAD'))
            if lesson == 'fork-pr':
                # A legacy open PR had no checked/reviewed base metadata.
                record = json.loads((base / 'scenario.json').read_text())
                record['hosting'] = {k: record['hosting'][k] for k in ['forked', 'pr']}
                for key in ['reviewedBase', 'checkedHead', 'checkedBase', 'checks']:
                    record['hosting']['pr'].pop(key, None)
                (base / 'scenario.json').write_text(json.dumps(record))
            state = host('merge', strategy=strategy)
            expect(state['hosting']['pr']['status'] == 'merged' and not state['complete'], 'merged PR still requires main sync')
            expect(e.git(base / 'origin.git', 'rev-parse', 'feature/welcome') == source, 'hosting integration preserves source branch')
            g(repo, 'switch', 'main')
            g(repo, 'fetch', 'upstream')
            g(repo, 'merge', '--ff-only', 'upstream/main')
            expect(not snapshot()['complete'], 'personal main must also be updated')
            g(repo, 'push', 'origin', 'main')
            state = snapshot()
            expect(state['complete'], f'{lesson}: {state["checks"]} {state["error"]}')
            if strategy in {'squash', 'rebase'}:
                expected = 1 if strategy == 'squash' else source_count
                expect(e.git(repo, 'rev-list', '--count', f'{base_head}..HEAD') == str(expected), 'actual upstream commit count matches strategy')
                expect(not e.git(repo, 'rev-list', '--merges', f'{base_head}..HEAD'), 'upstream has no merge commits')
            else:
                expect(len(e.git(repo, 'rev-list', '--parents', '-n', '1', 'HEAD').split()) == 3, 'merge strategy creates two real parents')
            if lesson == 'branch-protection':
                hook = base / 'upstream.git/hooks/pre-receive'
                hook.write_text('#!/bin/sh\nexit 0\n')
                expect(not snapshot()['complete'], 'removed branch policy cannot pass')
                hook.write_text(e.advanced.hosting.PROTECTION)
            g(repo, 'push', 'origin', '--delete', 'feature/welcome')
            state = snapshot()
            expect(state['complete'] and state['hosting']['pr']['diff'], 'completed PR retains evidence after source deletion')
            expect(e.initialize(lesson, mode)['complete'], 'resume preserves completed PR')
            expect(not e.initialize(lesson, mode, True)['complete'], 'reset restores original state')
            print(f'PASS {lesson}/{mode}', flush=True)
    # A clean final merge tree does not guarantee every intermediate rebase patch applies.
    lesson, mode = 'pr-rebase', 'guided'
    e.initialize(lesson, mode, True)
    base, repo = e.location(lesson, mode)
    host('fork')
    g(repo, 'remote', 'add', 'origin', str(base / 'origin.git'))
    g(repo, 'remote', 'add', 'upstream', str(base / 'upstream.git'))
    g(repo, 'fetch', 'upstream')
    g(repo, 'merge', '--ff-only', 'upstream/main')
    g(repo, 'switch', '-c', 'feature/welcome')
    (repo / 'config.ini').write_text('safe_mode=off\n')
    e.commit(repo, 'temporary config')
    (repo / 'config.ini').write_text('safe_mode=on\n')
    e.commit(repo, 'restore config')
    (repo / 'feature.txt').write_text('ready\n')
    e.commit(repo, 'feature')
    (repo / 'tests.txt').write_text('tests=pass\n')
    e.commit(repo, 'tests')
    g(repo, 'push', '-u', 'origin', 'feature/welcome')
    worker = base / 'maintainer'
    (worker / 'config.ini').write_text('safe_mode=strict\n')
    upstream_tip = e.commit(worker, 'upstream strict config')
    g(worker, 'push', 'origin', 'main')
    host('create', title='intermediate replay', branch='feature/welcome')
    host('review')
    expect(host('check')['hosting']['pr']['checks'] == 'passed', 'final integrated tree is clean')
    rejected(lambda: host('merge', strategy='rebase'), 'intermediate config patch actually conflicts')
    expect(not e.advanced.operation(e.advanced_api(), worker), 'failed hosting replay is aborted')
    expect(e.git(base / 'upstream.git', 'rev-parse', 'main') == upstream_tip, 'failed integration never updates upstream')
    g(repo, 'fetch', 'upstream')
    g(repo, 'reset', '--hard', 'upstream/main')
    (repo / 'feature.txt').write_text('ready\n')
    e.commit(repo, 'clean feature')
    (repo / 'tests.txt').write_text('tests=pass\n')
    e.commit(repo, 'clean tests')
    g(repo, 'push', '--force-with-lease', 'origin', 'feature/welcome')
    host('review')
    host('check')
    expect(host('merge', strategy='rebase')['hosting']['pr']['status'] == 'merged', 'corrected PR can retry the same worker')
    print(f'Hosting scenarios: {count} assertions passed', flush=True)

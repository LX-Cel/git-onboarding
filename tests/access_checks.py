"""Exercise real curl/credential exchange, Git smart HTTP packets and permission failures."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading

sys.path.insert(0, os.environ['COURSE_TEST_DIR'])
import engine as e
import access

count = 0


def expect(value, message):
    global count
    assert value, message
    count += 1


def g(repo, *args, check=True):
    result = subprocess.run(['git', '-C', str(repo), *args], env=e.SAFE_ENV,
                            capture_output=True, text=True, timeout=20)
    if check:
        assert result.returncode == 0, result.stderr
    return result


with tempfile.TemporaryDirectory(prefix='access-') as directory:
    e.ROOT = Path(directory) / 'labs'
    for mode in ['guided', 'challenge']:
        for lesson in sorted(access.IDS):
            state = e.initialize(lesson, mode, True)
            expect(not state['error'] and not state['complete'] and state['checks'], 'initial state is valid and incomplete')
            base, repo = e.location(lesson, mode)
            record = json.loads((base / 'scenario.json').read_text())
            snapshot = lambda: e.snapshot(lesson, mode)
            server = access.server_for(base)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                tip = e.commit(repo, 'deliver feature')
                expect(not snapshot()['complete'], 'local commit is not HTTP delivery')
                before = e.git(base / 'team.git', 'rev-parse', 'main')
                read = g(repo, 'ls-remote', 'origin', check=False)
                if lesson == 'auth-expired':
                    expect(read.returncode != 0 and ('Authentication failed' in read.stderr or 'could not read Username' in read.stderr), 'expired credential fails actual HTTP authentication')
                    g(repo, 'config', 'user.name', 'Different Author')
                    g(repo, 'config', 'user.email', 'different@example.invalid')
                    expect(g(repo, 'ls-remote', 'origin', check=False).returncode != 0, 'commit author configuration cannot fix authentication')
                elif lesson == 'auth-context':
                    expect(read.returncode != 0 and '403' in read.stderr, 'valid personal credential cannot access team repository')
                    expect(g(repo, 'ls-remote', 'personal').returncode == 0, 'same credential legitimately accesses personal repository')
                    g(repo, 'config', '--local', 'credential.useHttpPath', 'true')
                else:
                    expect(read.returncode == 0 and before in read.stdout, 'read succeeds before permission repair')
                    write = g(repo, 'push', 'origin', 'main', check=False)
                    expect(write.returncode != 0 and '403' in write.stderr, 'actual HTTP write permission denied')
                expect(e.git(base / 'team.git', 'rev-parse', 'main') == before, 'denied requests do not mutate remote refs')
                if lesson == 'auth-permission':
                    access.credential(repo, 'approve', {'url': access.URL+'/team.git', 'username':'learner', 'password':record['writeToken']})
                    expect(g(repo, 'push', 'origin', 'main', check=False).returncode != 0, 'valid write token does not grant write access to another repository')
                    g(repo, 'remote', 'set-url', '--push', 'origin', access.URL+'/fork.git')
                else:
                    access.credential(repo, 'reject', {'url': access.URL+'/team.git'})
                    access.credential(repo, 'approve', {'url': access.URL+'/team.git', 'username':'learner', 'password':record['writeToken']})
                    if lesson == 'auth-context':
                        access.credential(repo, 'approve', {'url': access.URL+'/personal.git', 'username':'personal', 'password':record['personalToken']})
                expect(g(repo, 'ls-remote', 'origin').returncode == 0, 'repaired credential permits team read')
                if lesson == 'auth-context':
                    expect(g(repo, 'ls-remote', 'personal').returncode == 0, 'path scoping preserves personal access')
                destination = 'fork.git' if lesson == 'auth-permission' else 'team.git'
                # A direct file push has the same content, but has not exercised HTTP auth.
                g(repo, 'push', str(base / destination), 'main')
                expect(not snapshot()['complete'], 'file transport cannot substitute for authenticated HTTP delivery')
                g(base / destination, 'update-ref', 'refs/heads/main', before)
                g(repo, 'push', 'origin', 'main')
                expect(snapshot()['complete'], f'{lesson} actual authenticated delivery passes: {snapshot()["checks"]}')
                expect(e.git(base / destination, 'rev-parse', 'main') == tip, 'server received the exact submitted commit')
                # Fetch a new remote commit through the same real protocol, not just refs.
                writer = base / 'writer'
                g(base, 'clone', str(base / destination), str(writer))
                e.config(writer)
                (writer / 'server.txt').write_text('received over HTTP\n')
                new = e.commit(writer, 'server addition')
                g(writer, 'push', 'origin', 'main')
                g(repo, 'fetch', access.URL + '/' + destination, 'main')
                expect(e.git(repo, 'show', 'FETCH_HEAD:server.txt') == 'received over HTTP', 'upload-pack transferred a real new object')
                expect(not snapshot()['complete'], 'remote advancement invalidates stale delivery result')
                g(repo, 'merge', '--ff-only', 'FETCH_HEAD')
                expect(snapshot()['complete'], 'syncing a later server commit preserves proven feature delivery')
                # A second genuine transfer remains valid as well.
                (repo / 'followup.txt').write_text('reviewed\n')
                e.commit(repo, 'follow-up')
                g(repo, 'push', 'origin', 'main')
                expect(snapshot()['complete'], 'fetch and new authenticated delivery recover cleanly')
                events = [json.loads(line) for line in (base / 'access-events.jsonl').read_text().splitlines()]
                expect(any(event['status'] == 401 for event in events), 'HTTP challenge actually occurred')
                if lesson != 'auth-expired':
                    expect(any(event['status'] == 403 for event in events), 'permission denial actually occurred')
                expect(all('token' not in event and 'password' not in event for event in events), 'server evidence never logs credential values')
                resumed = e.initialize(lesson, mode)
                expect(resumed['complete'], 'finished exercise resumes')
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)
            expect(not e.initialize(lesson, mode, True)['complete'], 'reset recreates a failing authentication scenario')
            print('PASS', lesson, mode)
print('HTTP authentication scenarios:', count, 'assertions passed')

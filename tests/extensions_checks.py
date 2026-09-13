"""Cryptographic checks and LFS transfers must use actual tools and object contents."""
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


with tempfile.TemporaryDirectory(prefix='extensions-') as directory:
    e.ROOT = Path(directory)/'labs'
    for mode in ['guided','challenge']:
        for lesson in sorted(e.extensions.IDS):
            state = e.initialize(lesson, mode, True)
            expect(not state['error'] and state['checks'] and not state['complete'], f'{lesson} initial state: {state["error"]}')
            base, repo = e.location(lesson,mode)
            record = json.loads((base/'scenario.json').read_text())
            snapshot = lambda: e.snapshot(lesson,mode)
            if lesson == 'ssh-signing':
                e.commit(repo,'unsigned feature')
                g(repo,'tag','-a','v1','-m','unsigned release')
                expect(not snapshot()['complete'], 'ordinary commit and tag cannot pass signature goal')
                g(repo,'config','gpg.format','ssh')
                g(repo,'config','user.signingkey',str(base/'keys/learner'))
                trust = base/'allowed_signers'
                trust.write_text('learner@example.invalid '+record['publicKey']+'\n')
                g(repo,'config','gpg.ssh.allowedSignersFile',str(trust))
                g(repo,'commit','--amend','--no-edit','-S')
                expect(not snapshot()['complete'], 'signed commit still needs a signed tag')
                g(repo,'tag','-d','v1')
                g(repo,'tag','-s','v1','-m','signed release')
                expect(g(repo,'verify-commit','HEAD').returncode == 0, 'OpenSSH verifies real commit signature')
                expect(g(repo,'verify-tag','v1').returncode == 0, 'OpenSSH verifies real tag signature')
                signed = e.git(repo,'rev-parse','HEAD')
                raw = subprocess.check_output(['git','-C',str(repo),'cat-file','commit',signed],env=e.SAFE_ENV)
                tampered = subprocess.check_output(['git','-C',str(repo),'hash-object','-t','commit','-w','--stdin'],input=raw+b'tampered\n',env=e.SAFE_ENV).decode().strip()
                g(repo,'reset','--hard',tampered)
                expect(g(repo,'verify-commit','HEAD',check=False).returncode != 0, 'changed signed payload fails cryptographic verification')
                expect(not snapshot()['complete'], 'signature text alone cannot pass')
                g(repo,'reset','--hard',signed)
                trust.write_text('')
                expect(not snapshot()['complete'], 'configured trust must also allow independent verification')
                trust.write_text('learner@example.invalid '+record['publicKey']+'\n')
            elif lesson == 'history-cleanup':
                expect(not (repo/'credentials.txt').exists(), 'current working tree already has no secret file')
                expect(not snapshot()['complete'], 'deleting current file does not clean history')
                g(repo,'filter-repo','--force','--path','credentials.txt','--invert-paths')
                expect(not snapshot()['complete'], 'local rewrite still leaves original remote')
                g(repo,'remote','add','origin',str(base/'origin.git'))
                g(repo,'push','--force-with-lease=refs/heads/main:'+record['tip'], 'origin','main')
                expect(not snapshot()['complete'], 'pushing only main leaves the leaked tag and objects')
                g(repo,'push','--force-with-lease=refs/tags/v0:'+record['leak'],'origin','refs/tags/v0')
                expect(not snapshot()['complete'], 'unreachable remote blobs still need controlled cleanup')
                for where in [repo, base/'origin.git']:
                    g(where,'reflog','expire','--expire=now','--all')
                    g(where,'gc','--prune=now')
                expect(record['secret'] not in e.git(repo,'log','--all','-p'), 'rewritten history no longer exposes the synthetic credential')
            else:
                g(repo,'lfs','install','--local')
                if lesson == 'lfs-track':
                    e.commit(repo,'ordinary binary')
                    expect(not snapshot()['complete'], 'ordinary blob is not LFS storage')
                g(repo,'lfs','track','*.bin')
                g(repo,'add','.gitattributes')
                g(repo,'add','--renormalize','model.bin')
                g(repo,'commit','-m','track current binary')
                expect(not snapshot()['complete'], 'current pointer without uploaded objects is incomplete')
                if lesson == 'lfs-migrate':
                    g(repo,'push','origin','main')
                    expect(not snapshot()['complete'], 'tracking current file does not convert old history')
                    g(repo,'lfs','migrate','import','--yes','--include=*.bin','--everything')
                    expect(not snapshot()['complete'], 'migration pointer still needs working file checkout and delivery')
                    g(repo,'lfs','checkout')
                    expect(g(repo,'push','origin','main',check=False).returncode != 0, 'ordinary push rejects migrated history')
                    g(repo,'lfs','push','--all','origin')
                    g(repo,'push','--force-with-lease','origin','main')
                else:
                    g(repo,'push','origin','main')
                state=snapshot()
                expect(state['complete'], f'LFS transfer: {state["checks"]} {state["error"]}; work size={(repo/"model.bin").stat().st_size}; fsck={g(repo,"lfs","fsck","--objects","--pointers",check=False)}')
                oid=record['assetSha']
                local=repo/'.git/lfs/objects'/oid[:2]/oid[2:4]/oid
                expect(local.is_file(), 'actual LFS object exists on disk')
                local.unlink()
                (repo/'model.bin').write_text(e.git(repo,'show','HEAD:model.bin')+'\n')
                expect(not snapshot()['complete'], 'pointer without local content cannot pass')
                g(repo,'lfs','fetch','origin')
                expect(local.is_file(), 'real LFS fetch restores missing content')
                expect(not snapshot()['complete'], 'fetch does not replace the working pointer')
                g(repo,'lfs','checkout')
                remote_object=next((base/'origin.git/lfs/objects').rglob(oid))
                content=remote_object.read_bytes()
                replacement = remote_object.with_suffix('.replacement')
                replacement.write_bytes(b'corrupt-object')
                replacement.replace(remote_object)
                expect(not snapshot()['complete'], 'remote object corruption is detected')
                remote_object.write_bytes(content)
            state=snapshot()
            expect(state['complete'], f'{lesson}/{mode}: {state["checks"]} {state["error"]}')
            expect(e.initialize(lesson,mode)['complete'], 'resume retains completion')
            expect(not e.initialize(lesson,mode,True)['complete'], 'reset recreates scenario and disposable key')
            print(f'PASS {lesson}/{mode}',flush=True)
    print(f'Extensions scenarios: {count} assertions passed',flush=True)

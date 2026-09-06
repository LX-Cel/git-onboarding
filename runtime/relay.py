"""Pipe-safe JSON transport for a real Linux PTY, without Windows native addons."""
import base64
import fcntl
import json
import os
import pty
import select
import signal
import struct
import subprocess
import sys
import termios

master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 100, 0, 0))

def session():
    os.setsid()
    fcntl.ioctl(0, termios.TIOCSCTTY, 0)

proc = subprocess.Popen(['/opt/git-onboarding/sandbox.sh', '/bin/bash', '--noprofile',
                         '--rcfile', '/opt/git-onboarding/bashrc', '-i'],
                        stdin=slave, stdout=slave, stderr=slave, preexec_fn=session)
os.close(slave)
pending = b''
try:
    while True:
        readable, _, _ = select.select([master, sys.stdin.buffer], [], [], 0.25)
        if master in readable:
            try:
                chunk = os.read(master, 16384)
            except OSError:
                break
            if not chunk:
                break
            print(json.dumps({'data': base64.b64encode(chunk).decode()}), flush=True)
        if sys.stdin.buffer in readable:
            chunk = os.read(sys.stdin.fileno(), 65536)
            if not chunk:
                break
            pending += chunk
            if len(pending) > 262144:
                break
            while b'\n' in pending:
                line, pending = pending.split(b'\n', 1)
                message = json.loads(line)
                if 'data' in message:
                    os.write(master, base64.b64decode(message['data']))
                elif 'cols' in message:
                    cols = max(20, min(400, int(message['cols'])))
                    rows = max(5, min(160, int(message['rows'])))
                    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
        if proc.poll() is not None and not readable:
            break
finally:
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    proc.wait()
    os.close(master)
    print(json.dumps({'exit': proc.returncode}), flush=True)

"""Offline HTTP authentication exercises backed by real Git smart-protocol processes.

The server lives in the calling terminal's network namespace. Only synthetic training
credentials are used; no system credential manager, external network, or TLS claims.
"""
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit, parse_qs


IDS = {'auth-expired', 'auth-scope', 'auth-context', 'auth-permission'}
HOST = '127.0.0.1:8765'
URL = 'http://' + HOST


def credential(repo, action, values):
    data = ''.join(f'{key}={value}\n' for key, value in values.items()) + '\n'
    result = subprocess.run(['git', '-C', str(repo), 'credential', action], input=data,
                            text=True, capture_output=True, timeout=10,
                            env={**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null'})
    return dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line) if result.returncode == 0 else {}


def setup(e, repo, base, lesson, mode, record):
    g = lambda *args: e.git(repo, *args)
    record['value'] = 'ready' if mode == 'guided' else 'released'
    record['writeToken'] = 'DEMO-' + mode + '-write'
    record['readToken'] = 'DEMO-' + mode + '-read'
    record['personalToken'] = 'DEMO-' + mode + '-personal'
    (repo / 'README.md').write_text('# 本地认证与权限练习\n')
    record['initial'] = e.commit(repo, '建立远端项目')
    for name in ['team.git', 'personal.git', 'fork.git']:
        e.git(base, 'clone', '--bare', str(repo), str(base / name))
    g('remote', 'add', 'origin', URL + '/team.git')
    if lesson == 'auth-context':
        g('remote', 'add', 'personal', URL + '/personal.git')
    g('config', '--local', 'credential.helper', 'store --file=../practice-credentials')
    g('config', '--local', 'http.proxy', '')
    token = 'DEMO-EXPIRED' if lesson == 'auth-expired' else record['readToken'] if lesson == 'auth-scope' else record['writeToken']
    entries = [f'http://learner:{token}@{HOST}/team.git']
    if lesson == 'auth-context':
        entries.insert(0, f'http://personal:{record["personalToken"]}@{HOST}/personal.git')
    vault = base / 'practice-credentials'
    vault.write_text('\n'.join(entries) + '\n')
    vault.chmod(0o600)
    for name, username, current_token in [('team', 'learner', record['writeToken']), ('personal', 'personal', record['personalToken'])]:
        entry = base / (name + '-credential.txt')
        entry.write_text(f'url={URL}/{name}.git\nusername={username}\npassword={current_token}\n\n')
        entry.chmod(0o600)
    (repo / 'feature.txt').write_text(record['value'] + '\n')
    # This launcher uses the current trusted module, including in temporary source tests.
    (base / 'serve.py').write_text('import runpy, sys\nsys.argv = ["access.py", "serve", ' + repr(str(base)) + '] + sys.argv[1:]\nrunpy.run_path(' + repr(str(Path(__file__).resolve())) + ', run_name="__main__")\n')
    (base / 'access-guide.txt').write_text(
        '仅用于离线练习；不要输入真实账号或令牌。\n'
        'python ../serve.py --start：在当前终端隔离网络内启动服务；重连终端后重新启动。\n'
        f'团队地址：{URL}/team.git；个人地址：{URL}/personal.git；Fork 地址：{URL}/fork.git\n'
        f'团队账号 learner，只读令牌 {record["readToken"]}，读写令牌 {record["writeToken"]}\n'
        f'个人账号 personal，令牌 {record["personalToken"]}，只用于 personal.git\n'
        'team-credential.txt 与 personal-credential.txt 提供本模式的假凭据协议记录，可用 git credential approve 读取。\n'
        + ('本关 learner 对团队仓库只有读权限；读写令牌仍不能覆盖仓库授权。功能必须推送到 fork.git。\n' if lesson == 'auth-permission' else '')
        + '真实平台应使用操作系统安全凭据管理器或授权登录。本关 store 文件中的明文仅是假凭据，不能当作真实令牌保存建议。\n')


def assess(e, repo, base, lesson, mode, record):
    import advanced
    g = lambda *args: e.git(repo, *args, check=False)
    head = g('rev-parse', 'HEAD')
    destination = 'fork.git' if lesson == 'auth-permission' else 'team.git'
    events = []
    if (base / 'access-events.jsonl').exists():
        for line in (base / 'access-events.jsonl').read_text().splitlines():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass  # A concurrent HTTP request may still be finishing its final line.
    resolved = credential(repo, 'fill', {'url': URL + '/' + destination})
    checks = [
        ('功能已提交并保留项目历史', e.text_at(repo, 'HEAD', 'feature.txt') == record['value'] and head != record['initial'] and e.ancestor(repo, record['initial'], 'HEAD')),
        ('使用本关读写账号凭据且未嵌入远端地址', resolved.get('username') == 'learner' and resolved.get('password') == record['writeToken'] and '@' not in g('remote', 'get-url', '--push', 'origin')),
        ('功能通过认证的 HTTP 推送到正确仓库', e.git(base / destination, 'rev-parse', 'main') == head and any(event.get('status') == 200 and event.get('service') == 'git-receive-pack' and event.get('method') == 'POST' and event.get('repo') == destination and event.get('head') and e.ancestor(repo, event['head'], head) and e.text_at(repo, event['head'], 'feature.txt') == record['value'] for event in events)),
        ('origin 保留正确拉取与推送地址', g('remote', 'get-url', 'origin') == URL + '/team.git' and g('remote', 'get-url', '--push', 'origin') == URL + '/' + destination)]
    if lesson == 'auth-context':
        personal = credential(repo, 'fill', {'url': URL + '/personal.git'})
        checks.extend([
            ('按仓库路径区分凭据', g('config', '--get', 'credential.useHttpPath') == 'true'),
            ('个人账号仍可用于个人仓库', personal.get('username') == 'personal' and personal.get('password') == record['personalToken'] and any(event.get('status') == 200 and event.get('repo') == 'personal.git' for event in events))])
    if lesson == 'auth-permission':
        checks.append(('只读团队主线保持不变', e.git(base / 'team.git', 'rev-parse', 'main') == record['initial']))
    checks.extend([
        ('工作区与暂存区干净', not g('status', '--porcelain')),
        ('没有进行中的 Git 操作', not advanced.operation(e, repo))])
    return [{'label': label, 'done': bool(done)} for label, done in checks]


def server_for(base):
    record = json.loads((base / 'scenario.json').read_text())

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def respond(self, status, content, kind='text/plain', **headers):
            self.send_response(status)
            self.send_header('Content-Type', kind)
            self.send_header('Content-Length', str(len(content)))
            for key, value in headers.items():
                self.send_header(key.replace('_', '-'), value)
            self.end_headers()
            self.wfile.write(content)

        def request(self):
            parsed = urlsplit(self.path)
            parts = parsed.path.strip('/').split('/')
            name = parts[0]
            service = parse_qs(parsed.query).get('service', [''])[0] if self.command == 'GET' else parts[-1]
            if name not in {'team.git', 'personal.git', 'fork.git'} or service not in {'git-upload-pack', 'git-receive-pack'}:
                self.respond(404, b'Unknown training repository or service\n')
                return
            if parsed.path != '/' + name + ('/info/refs' if self.command == 'GET' else '/' + service):
                self.respond(404, b'Unknown training endpoint\n')
                return
            auth = self.headers.get('Authorization', '')
            try:
                username, token = base64.b64decode(auth.removeprefix('Basic '), validate=True).decode().split(':', 1) if auth.startswith('Basic ') else ('', '')
            except (ValueError, UnicodeError):
                username, token = '', ''
            valid = (username == 'learner' and token in [record['readToken'], record['writeToken']]) or (username == 'personal' and token == record['personalToken'])
            write = service == 'git-receive-pack'
            permitted = (name == 'personal.git' and username == 'personal') or (name != 'personal.git' and username == 'learner')
            permitted = permitted and (not write or token != record['readToken']) and not (name == 'team.git' and write and record['lesson'] == 'auth-permission')
            status = 200 if valid and permitted else 403 if valid else 401
            event = {'status': status, 'repo': name, 'service': service, 'method': self.command}
            if status != 200:
                with (base / 'access-events.jsonl').open('a') as log:
                    log.write(json.dumps(event) + '\n')
                if status == 401:
                    self.respond(401, b'Invalid or expired training credential\n', WWW_Authenticate='Basic realm="Offline Git practice"')
                else:
                    self.respond(403, b'Authenticated account lacks repository or write permission\n')
                return
            # These small fixtures use bounded request bodies. Never accept unbounded data.
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                self.respond(400, b'Invalid body length\n')
                return
            if self.headers.get('Transfer-Encoding') or not 0 <= length <= 8388608:
                self.respond(413, b'Training HTTP requests are limited to 8 MiB\n')
                return
            args = ['git', service.removeprefix('git-'), '--stateless-rpc']
            if self.command == 'GET':
                args.append('--advertise-refs')
            args.append(str(base / name))
            output = subprocess.run(args, input=self.rfile.read(length), capture_output=True, timeout=15,
                                    env={**os.environ, 'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_NOSYSTEM': '1'})
            if output.returncode:
                self.respond(500, b'Git service failed\n')
                return
            data = output.stdout
            if self.command == 'GET':
                prefix = ('# service=' + service + '\n').encode()
                data = f'{len(prefix) + 4:04x}'.encode() + prefix + b'0000' + data
            else:
                event['head'] = subprocess.check_output(['git', '-C', str(base / name), 'rev-parse', 'main']).decode().strip()
            with (base / 'access-events.jsonl').open('a') as log:
                log.write(json.dumps(event) + '\n')
            self.respond(200, data, 'application/x-' + service + ('-advertisement' if self.command == 'GET' else '-result'), Cache_Control='no-cache')

        do_GET = request
        do_POST = request

    return HTTPServer(('127.0.0.1', 8765), Handler)


if __name__ == '__main__':
    base = Path(sys.argv[2]).resolve()
    if '--start' in sys.argv:
        # Fork only after binding successfully. The inherited listener is ready before
        # the prompt returns; bubblewrap's PID namespace owns the child lifetime.
        server = server_for(base)
        if os.fork():
            server.server_close()
            print('离线 Git HTTP 服务已就绪：' + URL + '（当前终端有效）')
        else:
            with open(os.devnull, 'r+') as null:
                for fd in [0, 1, 2]:
                    os.dup2(null.fileno(), fd)
            server.serve_forever()
    else:
        server_for(base).serve_forever()

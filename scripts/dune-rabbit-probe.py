#!/usr/bin/env python3
"""Bounded RabbitMQ schema discovery. Standard library only; no game-message publishing."""
import base64
import argparse
import contextlib
import collections
import getpass
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

BINDINGS = (
    ('notifications', 'topic', 'PlayerOnlineState'),
    ('chat.intercept', 'topic', '#'),
    ('status.Survival_1.dim_0', 'fanout', ''),
    ('status.DeepDesert_1.dim_0', 'fanout', ''),
    ('travel_queue_status', 'topic', '#'),
    ('director_respawned', 'fanout', ''),
)
BASE = 'http://127.0.0.1:15672/api'


def shape(value, depth=0):
    """Report structure, never scalar message values or raw message bodies."""
    if depth >= 7:
        return '<depth limit>'
    if isinstance(value, dict):
        result = {}
        for key, child in list(value.items())[:32]:
            safe = str(key)
            if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,63}', safe) or re.fullmatch(r'[A-Fa-f0-9]{16,}', safe):
                safe = '<dynamic key>'
            result[safe] = shape(child, depth + 1)
        return result
    if isinstance(value, list):
        return {'array': [shape(child, depth + 1) for child in value[:2]]}
    if isinstance(value, str):
        if value.lstrip().startswith(('{', '[')) and len(value) <= 65536:
            try:
                return {'encoded_json': shape(json.loads(value), depth + 1)}
            except (ValueError, RecursionError):
                pass
        return 'string'
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return 'boolean'
    if isinstance(value, (int, float)):
        return 'number'
    return 'unknown'


class Client:
    def __init__(self, user, password):
        self.auth = 'Basic ' + base64.b64encode((user + ':' + password).encode()).decode()
        # Credentials never go through an inherited HTTP proxy or redirects.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def request(self, method, path, body=None):
        payload = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(BASE + path, data=payload, method=method,
            headers={'Authorization': self.auth, 'Content-Type': 'application/json'})
        with self.opener.open(request, timeout=5) as response:
            raw = response.read(4 * 1024 * 1024 + 1)
            if len(raw) > 4 * 1024 * 1024:
                raise ValueError('Response exceeds capture limit')
            return json.loads(raw) if raw else None


def discover(client):
    exchanges = client.request('GET', '/exchanges/%2F')
    bindings = client.request('GET', '/bindings/%2F')
    if not isinstance(exchanges, list) or not isinstance(bindings, list):
        raise ValueError('Unexpected broker inventory format')
    selected = []
    for entry in exchanges:
        name, kind = entry.get('name', ''), entry.get('type', '')
        gameplay = name.startswith(('chat.', 'status.')) or name in (
            'notifications', 'travel_queue_status', 'director_respawned', 'heartbeats')
        keys = {b.get('routing_key', '') for b in bindings if b.get('source_name', b.get('source')) == name}
        print(json.dumps({'exchange': name, 'type': kind, 'existing_binding_keys': len(keys),
                          'capture': bool(gameplay and kind in ('fanout', 'topic', 'direct'))}), flush=True)
        if not gameplay:
            continue
        if kind == 'fanout':
            selected.append((name, kind, ''))
        elif kind == 'topic':
            selected.append((name, kind, '#'))
        elif kind == 'direct':
            selected.extend((name, kind, key) for key in sorted(keys))
    if len(selected) > 256:
        raise ValueError('Inventory exceeds 256 binding safety limit')
    print('Inventory is vhost /. Login, RPC, default and tracing exchanges are not captured.', flush=True)
    print('Direct routing keys are sampled from current bindings; newly created routes require another run.', flush=True)
    return selected


def capture(client, duration=120, message_limit=1000, discovery=False, raw_file=None):
    queue = 'arrakis.probe.' + uuid.uuid4().hex
    path = '/queues/%2F/' + queue
    counts = collections.Counter()
    shapes = collections.Counter()
    created = False
    received = 0
    try:
        verified = []
        candidates = discover(client) if discovery else BINDINGS
        for exchange, expected_type, routing in candidates:
            try:
                data = client.request('GET', '/exchanges/%2F/' + urllib.parse.quote(exchange, safe=''))
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    print('Absent exchange:', exchange, flush=True)
                    continue
                raise
            if data.get('type') != expected_type:
                print('Skipping unexpected exchange type:', exchange, flush=True)
                continue
            verified.append((exchange, routing))
        if not verified:
            print('No expected exchanges available.')
            return
        created = True  # Also attempt cleanup if declaration succeeds but its response is lost.
        client.request('PUT', path, {'durable': True, 'auto_delete': False, 'arguments': {
            'x-expires': 300000, 'x-message-ttl': 60000, 'x-max-length': 2000,
            'x-max-length-bytes': 4 * 1024 * 1024, 'x-overflow': 'drop-head', 'x-queue-type': 'classic'}})
        for exchange, routing in verified:
            client.request('POST', '/bindings/%2F/e/' + urllib.parse.quote(exchange, safe='') + '/q/' + queue,
                           {'routing_key': routing, 'arguments': {}})
        print('CAPTURE READY: send normal map chat and log your character out/in.', flush=True)
        print(f'Observing up to {duration} seconds / {message_limit} messages. Only field structures are printed.', flush=True)
        deadline = time.monotonic() + duration
        while time.monotonic() < deadline and received < message_limit:
            batch = client.request('POST', path + '/get', {'count': min(25, message_limit - received),
                'ackmode': 'ack_requeue_false', 'encoding': 'base64', 'truncate': 65536})
            for message in batch:
                received += 1
                exchange = message.get('exchange', '')
                if exchange not in dict(verified):
                    continue
                counts[exchange] += 1
                if raw_file is not None:
                    raw_file.write(json.dumps({'observed_at': time.time(), 'message': message}) + '\n')
                    raw_file.flush()
                try:
                    raw = base64.b64decode(message.get('payload', ''), validate=True)
                    structure = shape(json.loads(raw))
                except (ValueError, UnicodeError, RecursionError):
                    structure = '<binary, non-JSON, or truncated payload>'
                signature = json.dumps(structure, sort_keys=True)
                key = (exchange, signature)
                if key not in shapes and len(shapes) < 40:
                    print(json.dumps({'exchange': exchange, 'fields': structure}), flush=True)
                if key in shapes or len(shapes) < 40:
                    shapes[key] += 1
            time.sleep(min(1, max(0, deadline - time.monotonic())))
    finally:
        print('Message counts:', json.dumps(dict(counts)), flush=True)
        print('Counts describe this bounded sample, not total broker traffic.', flush=True)
        if created:
            try:
                client.request('DELETE', path)
                print('Temporary probe queue removed.', flush=True)
            except Exception:
                print('Cleanup not confirmed; the probe queue expires after five idle minutes.', flush=True)


def private_file(path):
    return os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w', encoding='utf-8')


class Tee:
    def __init__(self, *targets):
        self.targets = targets
    def write(self, text):
        for target in self.targets:
            target.write(text)
        return len(text)
    def flush(self):
        for target in self.targets:
            target.flush()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--discover', action='store_true', help='Inventory vhost / and sample gameplay exchanges')
    parser.add_argument('--seconds', type=int, default=120, choices=range(10, 601), metavar='10..600')
    parser.add_argument('--report', help='New sanitized report file; existing files are never overwritten')
    parser.add_argument('--raw-file', help='Optional PRIVATE payload file, including chat and identifiers; do not share')
    args = parser.parse_args()
    user = input('RabbitMQ management username [guest]: ').strip() or 'guest'
    password = getpass.getpass('RabbitMQ password (not displayed): ')
    try:
        with contextlib.ExitStack() as stack:
            raw = stack.enter_context(private_file(args.raw_file)) if args.raw_file else None
            if args.report:
                report = stack.enter_context(private_file(args.report))
                stack.enter_context(contextlib.redirect_stdout(Tee(sys.stdout, report)))
            capture(Client(user, password), duration=args.seconds, discovery=args.discover, raw_file=raw)
    except urllib.error.HTTPError as error:
        print('Management HTTP error:', error.code, '(check broker credentials and permissions)')
        return 1
    except KeyboardInterrupt:
        print('Capture stopped.')
    except Exception as error:
        print('Capture failed:', type(error).__name__, '(no credentials or payloads printed)')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())


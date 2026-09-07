#!/usr/bin/env python3
"""Bounded RabbitMQ schema discovery. Standard library only; no game-message publishing."""
import base64
import collections
import getpass
import json
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


def capture(client, duration=120, message_limit=1000):
    queue = 'arrakis.probe.' + uuid.uuid4().hex
    path = '/queues/%2F/' + queue
    counts = collections.Counter()
    shapes = collections.Counter()
    created = False
    received = 0
    try:
        verified = []
        for exchange, expected_type, routing in BINDINGS:
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
        print('Observing up to 120 seconds / 1000 messages. Only field structures are printed.', flush=True)
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


def main():
    user = input('RabbitMQ management username [guest]: ').strip() or 'guest'
    password = getpass.getpass('RabbitMQ password (not displayed): ')
    try:
        capture(Client(user, password))
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


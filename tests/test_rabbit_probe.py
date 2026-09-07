import base64
import contextlib
import importlib.util
import io
import json
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('rabbit_probe', pathlib.Path(__file__).resolve().parents[1] / 'scripts/dune-rabbit-probe.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)

class FakeClient:
    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail
    def request(self, method, path, body=None):
        self.calls.append((method, path, body))
        if method == 'GET':
            exchange = path.split('/')[-1]
            return {'type': next(kind for name, kind, _ in probe.BINDINGS if name == exchange)}
        if path.endswith('/get'):
            if self.fail:
                raise RuntimeError('Disconnected')
            return [{'exchange': 'chat.intercept', 'payload': base64.b64encode(json.dumps({'Type': 'TextChat', 'content': json.dumps({'m_Message': 'private message', 'accountId': 'private-id'})}).encode()).decode()}]

class ProbeTests(unittest.TestCase):
    def test_discovery_binds_topics_and_exact_direct_keys_without_auth_traffic(self):
        class Inventory:
            def request(self, method, path):
                if path.startswith('/exchanges'):
                    return [{'name': 'chat.map', 'type': 'direct'}, {'name': 'notifications', 'type': 'topic'},
                            {'name': 'status.test', 'type': 'fanout'}, {'name': 'login_request', 'type': 'direct'},
                            {'name': 'rpc', 'type': 'direct'}, {'name': '', 'type': 'direct'}]
                return [{'source': 'chat.map', 'routing_key': 'HaggaBasin.0'},
                        {'source': 'login_request', 'routing_key': 'secret-route'}]
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            found = probe.discover(Inventory())
        self.assertEqual(found, [('chat.map', 'direct', 'HaggaBasin.0'),
                                 ('notifications', 'topic', '#'), ('status.test', 'fanout', '')])
        self.assertNotIn('secret-route', output.getvalue())

    def test_raw_payload_requires_separate_file_and_stays_out_of_report(self):
        raw, report = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(report), patch.object(probe.time, 'sleep'):
            probe.capture(FakeClient(), message_limit=1, raw_file=raw)
        payload = json.loads(raw.getvalue())['message']['payload']
        self.assertIn('private message', base64.b64decode(payload).decode())
        self.assertNotIn(payload, report.getvalue())

    def test_nested_payload_values_are_not_printed(self):
        result = probe.shape({'content': json.dumps({'message': 'private', 'online': True}), 'FEE168EC4DE4F158': 'id'})
        self.assertNotIn('private', json.dumps(result))
        self.assertNotIn('FEE168EC4DE4F158', json.dumps(result))
        self.assertEqual(result['content']['encoded_json']['online'], 'boolean')

    def test_only_own_queue_is_consumed_and_deleted(self):
        client = FakeClient()
        output = io.StringIO()
        with contextlib.redirect_stdout(output), patch.object(probe.time, 'sleep'):
            probe.capture(client, message_limit=1)
        own = next(path for method, path, _ in client.calls if method == 'PUT')
        self.assertTrue(own.startswith('/queues/%2F/arrakis.probe.'))
        self.assertEqual([path for method, path, _ in client.calls if method == 'DELETE'], [own])
        self.assertEqual([path for _, path, _ in client.calls if path.endswith('/get')], [own + '/get'])
        self.assertNotIn('private message', output.getvalue())
        self.assertNotIn('private-id', output.getvalue())
        self.assertIn('encoded_json', output.getvalue())

    def test_disconnect_still_cleans_up(self):
        client = FakeClient(fail=True)
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(RuntimeError):
            probe.capture(client, message_limit=1)
        self.assertEqual(client.calls[-1][0], 'DELETE')

if __name__ == '__main__':
    unittest.main()

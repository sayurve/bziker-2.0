"""Bounded HTTP benchmark: 100 active profiles, eight request workers, disposable DB."""
import concurrent.futures
import http.client
import json
import re
from collections import Counter
from pathlib import Path
import statistics
import sys
import tempfile
import threading
import time
sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[1]))
from server import make_server

with tempfile.TemporaryDirectory(prefix='bziker-backend-load-') as directory:
    server = make_server('127.0.0.1', 0, Path(directory) / 'load.db')
    server.world.clock = lambda: 1000
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    def request(client, path='/api/world', data=None):
        conn = http.client.HTTPConnection(*server.server_address, timeout=15)
        headers = {'Content-Type': 'application/json'}
        if client.get('cookie'): headers['Cookie'] = client['cookie']
        if client.get('csrf'): headers['X-CSRF-Token'] = client['csrf']
        begin = time.perf_counter()
        try:
            conn.request('GET' if data is None else 'POST', path,
                         None if data is None else json.dumps(data), headers)
            response = conn.getresponse()
            result = json.loads(response.read())
            if response.getheader('Set-Cookie'): client['cookie'] = response.getheader('Set-Cookie').split(';')[0]
            if 'csrf_token' in result: client['csrf'] = result['csrf_token']
            return response.status, result, (time.perf_counter() - begin) * 1000
        except Exception as error:
            return 0, {'transport_error': type(error).__name__, 'message': str(error)}, (time.perf_counter() - begin) * 1000
        finally: conn.close()
    clients = [{} for _ in range(100)]
    try:
        for i, client in enumerate(clients):
            assert request(client, '/api/bootstrap')[0] == 200
            assert request(client, '/api/profile', {'name': 'Load profile ' + str(i)})[0] == 200
            assert request(client)[0] == 200
        statements = []
        # Inspect one service request's SQL separately from timed HTTP requests.
        original_transaction = server.game.transaction
        from contextlib import contextmanager
        @contextmanager
        def traced_transaction():
            with original_transaction() as db:
                db.set_trace_callback(statements.append)
                yield db
        with server.game.transaction() as db:
            uid = db.execute('SELECT id FROM accounts ORDER BY rowid LIMIT 1').fetchone()['id']
        server.game.transaction = traced_transaction
        server.world.snapshot(uid)
        server.game.transaction = original_transaction
        started = time.perf_counter()
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda client: request(client), clients * 2))
        elapsed = time.perf_counter() - started
        latency = sorted(result[2] for result in results)
        final = request(clients[0])[1]
        statement_shapes = Counter(re.sub(r"'(?:''|[^'])*'|\b\d+(?:\.\d+)?\b", '?', ' '.join(sql.split()))
                                   for sql in statements)
        print(json.dumps({'profiles': 100, 'concurrent_workers': 8, 'requests': len(results),
            'success': sum(result[0] == 200 for result in results),
            'errors': [{'status': result[0], 'result': result[1]} for result in results if result[0] != 200],
            'elapsed_s': round(elapsed, 3), 'requests_per_s': round(len(results) / elapsed, 2),
            'mean_ms': round(statistics.mean(latency), 2), 'p50_ms': round(latency[99], 2),
            'p95_ms': round(latency[189], 2), 'p99_ms': round(latency[197], 2), 'max_ms': round(latency[-1], 2),
            'online_count': final['online_count'], 'visible_players': len(final['players']),
            'service_snapshot_sql_statements': len(statements),
            'service_snapshot_position_writes': sum(sql.startswith('INSERT INTO world_positions') for sql in statements),
            'top_service_sql': [{'count': count, 'statement': statement}
                                for statement, count in statement_shapes.most_common(15)],
            'uses_live_db': False, 'opens_browser': False}, ensure_ascii=False))
        assert sum(sql.startswith('INSERT INTO world_positions') for sql in statements) <= 1, 'Stationary snapshot must not rewrite every other player position'
        assert len(statements) <= 80, 'Stationary 100-profile snapshot must use bounded batched reads'
        assert sum(result[0] == 200 for result in results) == 200, 'All 200 HTTP requests must complete without transport errors'
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=5)

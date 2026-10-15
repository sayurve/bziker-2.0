#!/usr/bin/env python3
"""Verify full server initialization on a disposable, read-only-source clone."""
import argparse
import hashlib
import json
import re
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RUNTIME_TABLES = frozenset(('presence', 'world_positions', 'world_boats', 'world_metadata'))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot(db):
    """Capture complete multisets of rows without retaining their plaintext."""
    result = {}
    for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        quoted = '"' + name.replace('"', '""') + '"'
        rows = [json.dumps(list(row), ensure_ascii=False, separators=(',', ':'),
                           default=lambda value: {'bytes': value.hex()})
                for row in db.execute('SELECT * FROM ' + quoted)]
        rows.sort()
        result[name] = {'rows': len(rows),
                        'sha256': hashlib.sha256(('\n'.join(rows) + '\n').encode()).hexdigest(),
                        'columns': [row[1] for row in db.execute('PRAGMA table_info(' + quoted + ')')]}
    return result


def compare_snapshots(before, after):
    business, runtime, unexpected = [], [], []
    for name in sorted(set(before) | set(after)):
        old, new = before.get(name), after.get(name)
        same = old == new
        item = {'table': name, 'rows_before': old['rows'] if old else None,
                'rows_after': new['rows'] if new else None, 'unchanged': same}
        if name in RUNTIME_TABLES:
            runtime.append(item)
        else:
            business.append(item)
            if not same:
                unexpected.append(name)
    return business, runtime, unexpected


def expected_sha(value):
    if not re.fullmatch(r'[0-9a-fA-F]{64}', value):
        raise argparse.ArgumentTypeError('Expected map SHA256 must contain 64 hexadecimal characters')
    return value.lower()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-map-sha', required=True, type=expected_sha,
                        help='Exact raw world-map.json SHA from the agreed geometry freeze')
    parser.add_argument('--source', type=Path,
                        default=ROOT / 'data/backups/before-design-v17-20261011-002700.db')
    parser.add_argument('--report', type=Path,
                        default=ROOT / 'docs/source-design-v19/migration-preservation.json')
    parser.add_argument('--final-geometry', action='store_true',
                        help='Mark this verified snapshot as the jointly frozen final geometry')
    args = parser.parse_args(argv)
    map_path, collision_path = ROOT / 'web/world-map.json', ROOT / 'web/city-collisions.json'
    map_hash, collision_hash = sha(map_path), sha(collision_path)
    collision = json.loads(collision_path.read_text())
    if map_hash != args.expected_map_sha or collision['map_sha256'] != map_hash:
        parser.error('Map/collision data do not match the explicitly expected frozen SHA; no migration was run')
    source = args.source.resolve()
    if args.report.resolve() == source:
        parser.error('Report output cannot overwrite the read-only source; no migration was run')
    source_hash_before = sha(source)
    with tempfile.TemporaryDirectory(prefix='bziker-preservation-') as directory:
        clone = Path(directory) / 'migration.db'
        with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as original:
            original.execute('PRAGMA query_only=ON')
            integrity_before = original.execute('PRAGMA integrity_check').fetchone()[0]
            source_version = original.execute("SELECT value FROM world_metadata WHERE key='map_version'").fetchone()[0]
            before = snapshot(original)
            with sqlite3.connect(clone) as target:
                original.backup(target)
        sys.path.insert(0, str(ROOT))
        from server import make_server
        server = make_server('127.0.0.1', 0, clone)
        server.server_close()
        with sqlite3.connect(clone) as migrated:
            integrity_after = migrated.execute('PRAGMA integrity_check').fetchone()[0]
            target_version = migrated.execute("SELECT value FROM world_metadata WHERE key='map_version'").fetchone()[0]
            after = snapshot(migrated)
    business, runtime, unexpected = compare_snapshots(before, after)
    source_hash_after = sha(source)
    geometry_stable = map_hash == sha(map_path) and collision_hash == sha(collision_path)
    passed = not unexpected and source_hash_before == source_hash_after and geometry_stable and integrity_before == integrity_after == 'ok'
    try:
        source_label = source.relative_to(ROOT).as_posix()
    except ValueError:
        source_label = 'external_read_only_backup'
    final_verified = passed and args.final_geometry
    report = {'schema_version': 1, 'generated_utc': datetime.now(timezone.utc).isoformat(),
              'scope': 'Only the explicitly chosen source backup is opened read-only; full server initialization operates solely on a disposable clone.',
              'source_backup': source_label,
              'source_design_release': 'before-design-v17' if source.name.startswith('before-design-v17-') else None,
              'source_saved_map_version': int(source_version), 'target_map_version': int(target_version),
              'target_map_sha256': map_hash, 'target_collision_count': len(collision['obstacles']),
              'source_sha256_before': source_hash_before, 'source_sha256_after': source_hash_after,
              'source_bytes_unchanged': source_hash_before == source_hash_after,
              'source_integrity_check': integrity_before, 'clone_integrity_check': integrity_after,
              'geometry_unchanged_during_check': geometry_stable,
              'comparison': 'All columns and all rows compared through sorted canonical row digests, preserving duplicates; no row values disclosed.',
              'business_tables_checked': len(business), 'business_rows_checked': sum(item['rows_before'] or 0 for item in business),
              'all_business_tables_unchanged': not unexpected, 'unexpected_changes': unexpected,
              'business_tables': business, 'allowed_runtime_tables': runtime,
              'privacy': 'No account IDs, names, credentials, session tokens, message content, or database row values included.',
              'geometry_verification_status': 'verified_final_snapshot' if final_verified else 'verified_snapshot' if passed else 'failed_verification',
              'requires_final_geometry_reverification': not final_verified,
              'final_geometry_sha256': map_hash if final_verified else None}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ('target_map_sha256', 'target_collision_count',
                     'source_saved_map_version', 'target_map_version', 'business_tables_checked',
                     'business_rows_checked', 'all_business_tables_unchanged', 'source_bytes_unchanged',
                     'source_integrity_check', 'clone_integrity_check', 'geometry_unchanged_during_check',
                     'unexpected_changes', 'geometry_verification_status')}))
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())

#!/usr/bin/env python3
"""Create a consistent SQLite backup without writing to the source database."""
import argparse
import sqlite3
from contextlib import closing
from pathlib import Path


def backup(source, output):
    source=Path(source).resolve(strict=True)
    output=Path(output).resolve()
    output.parent.mkdir(parents=True,exist_ok=True)
    # Reserve the destination atomically and never overwrite an older backup.
    output.touch(exist_ok=False)
    try:
        with closing(sqlite3.connect(source.as_uri()+'?mode=ro',uri=True)) as original:
            with closing(sqlite3.connect(output)) as copy:
                original.backup(copy)
                if copy.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
                    raise RuntimeError('Backup integrity check failed')
    except BaseException:
        output.unlink(missing_ok=True)
        raise
    return output


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',required=True)
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    backup(args.source,args.output)
    print('SQLite backup created; integrity_check: ok')

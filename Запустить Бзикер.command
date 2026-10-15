#!/bin/zsh
set -e
cd "$(dirname "$0")"
exec python3 tools/run.py --demo --port 8796

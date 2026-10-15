"""Disposable render fixture: one browser and 99 stationary test peers.

Run: python3 tests/preview_render_load.py .
Open localhost:8792/?diagnostics=1 in the existing tab, then interrupt this
script after returning to the working game. No live DB or credentials used.
This fixture is not a 100-client network or physical-device load test.
"""
import sys,tempfile,json
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from server import make_server
from world import WORLD_MAP
with tempfile.TemporaryDirectory(prefix="bziker-render-audit-") as directory:
 server=make_server("127.0.0.1",8792,Path(directory)/"fixture.db")
 server.world.clock=lambda:1000
 for index in range(99):
  uid=server.game.create_account()
  server.game.profile(uid,{"name":f"Тест{index:02d}","avatar":{"hairStyle":index%12,"hairColor":index%6,"shirtColor":index%8}})
  server.world.move(uid,{"scene":"city","x":WORLD_MAP["spawn"]["x"],"y":WORLD_MAP["spawn"]["y"]})
 original=server.RequestHandlerClass._bootstrap
 def bootstrap(handler,session):
  value=original(handler,session)
  if value.get("authenticated") and not value.get("profile"):
   server.game.profile(session["account_id"],{"name":"АудитКадров"})
   value=original(handler,session)
  return value
 server.RequestHandlerClass._bootstrap=bootstrap
 print(json.dumps({"url":"http://localhost:8792/?diagnostics=1","test_peers":99,"live_db":False}),flush=True)
 try:server.serve_forever()
 except KeyboardInterrupt:pass
 finally:server.server_close()

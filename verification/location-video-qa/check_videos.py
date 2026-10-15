#!/usr/bin/env python3
"""Decode three selected archive clips completely and make 0.5s storyboards.
Analysis artefacts only: source videos and production art are never modified.
"""
import json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
SELECTION=[('male-basic','materials/Bziker/02_Персонажи/Мужчина/Видео_основных_движений.mp4'),('female-basic','materials/Bziker/02_Персонажи/Женщина/Видео_основных_движений.mp4'),('water-overview','materials/Bziker/01_Окружение/Водоём/08_Анимации/03_Общий_ролик/Водоём_рыбалка_и_лодка.mp4')]
results=[]
for key,rel in SELECTION:
 source=ROOT/rel
 probe=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-show_entries','stream=index,codec_type,width,height,r_frame_rate','-of','json',str(source)],capture_output=True,text=True,check=True)
 d=json.loads(probe.stdout)
 decode=subprocess.run(['ffmpeg','-nostdin','-v','error','-xerror','-progress','pipe:1','-i',str(source),'-map','0:v:0','-f','null','-'],capture_output=True,text=True)
 (OUT/(key+'-decode.log')).write_text(decode.stdout+'\nSTDERR:\n'+decode.stderr)
 frames=[int(line.split('=')[1]) for line in decode.stdout.splitlines() if line.startswith('frame=')]
 filt="fps=2,scale=320:240:force_original_aspect_ratio=decrease,pad=320:260:(ow-iw)/2:0:color=black,tile=4x6:nb_frames=24:padding=3:margin=3:color=gray"
 board=subprocess.run(['ffmpeg','-nostdin','-y','-v','error','-i',str(source),'-vf',filt,'-fps_mode','vfr',str(OUT/(key+'-%02d.png'))],capture_output=True,text=True)
 if board.returncode:raise RuntimeError(board.stderr)
 results.append(dict(id=key,source=rel,probe=d,decode_exit_code=decode.returncode,decode_error=decode.stderr,decoded_video_frames=frames[-1] if frames else None,storyboard_interval_seconds=.5,storyboard_pages=[str(p.relative_to(ROOT)) for p in sorted(OUT.glob(key+'-[0-9][0-9].png'))],visual_inspection='pending'))
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print(json.dumps([{k:r[k] for k in ('id','decode_exit_code','decoded_video_frames','storyboard_pages')} for r in results],ensure_ascii=False))
assert all(r['decode_exit_code']==0 for r in results)

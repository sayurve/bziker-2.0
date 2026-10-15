import json,math,hashlib,collections
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path('.');OUT=ROOT/'art/drafts/action-identity-v29/daily'; groups=json.load(open(OUT/'family-inventory.json')); daily=json.load(open(ROOT/'materials/Bziker/06_Повседневные_действия/сцены.json')); actors={a['id']:a for a in daily['actors']}; male=json.load(open(ROOT/'art/drafts/locomotion-v27/shared-head-style-proposal/proposal-evidence.json'));female=json.load(open(ROOT/'art/drafts/canonical-face-v29/female-heads-v1/export-evidence.json'));entries=[];rows=collections.defaultdict(list)
def inside(x,y,p):
 hit=False
 for a,b in zip(p,p[1:]+p[:1]):
  if(a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:hit=not hit
 return hit
def neutral(p):
 r,g,b,a=p;return a>127 and max(r,g,b)>=55 and max(r,g,b)-min(r,g,b)<22

def candidate_neck(im,f,gender,dir):
 h=f['head']; t=h['top']*2
 # Draft flesh-component guide. Review is still required; this does not grant art approval.
 points={(x,y) for y in range(max(0,t+16),min(112,t+68)) for x in range(9,87) if (lambda p:p[3]>127 and p[0]>=180 and p[1]>=90 and p[0]-p[1]>24 and p[1]-p[2]>13)(im.getpixel((x,y)))}
 components=[]
 while points:
  start=points.pop(); stack=[start];comp=[start]
  while stack:
   x,y=stack.pop()
   for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
    p=(x+dx,y+dy)
    if p in points:points.remove(p);stack.append(p);comp.append(p)
  components.append(comp)
 if dir!='up' and components:
  comp=max(components,key=len);hist=collections.Counter(y for x,y in comp);last=max(y for y,n in hist.items()if n>=2)
  low=[x for x,y in comp if y>=last-1]
  if low:return[round(sum(low)/len(low)),last]
 cx=48
 for y in range(t+38,min(t+76,114)):
  vals=[x for x in range(43,54)if neutral(im.getpixel((x,y)))];nxt=[x for x in range(43,54)if neutral(im.getpixel((x,y+1)))]
  if len(vals)>=4 and len(nxt)>=4:return[round(sum(vals)/len(vals)),y-1]
 return[cx,h['bottom']*2+3]

# Authored neckline registrations from the reviewed native source/body joins.
# The standing table is reused with the source renderer's exact seated upperY=30.
ORDER=[('pocket',3),('pocket',2),('pocket',1),('cigarette_puff',0),('cigarette_light',0),('cigarette_light',1),('cigarette_light',2),('cigarette_light',3),('cigarette_puff',1),('cigarette_puff',2),('give',0),('give',1),('give',3)]
REG={
 'male-down':[[48,64],[48,64],[48,64],[48,63],[48,62],[50,62],[50,62],[48,62],[49,62],[49,62],[49,63],[46,64],[46,64]],
 'female-down':[[47,64],[48,65],[48,64],[48,67],[48,62],[49,63],[49,63],[49,63],[49,66],[49,66],[48,66],[49,66],[46,66]],
 'male-right':[[50,60],[53,61],[53,61],[54,62],[54,61],[54,62],[54,62],[54,63],[53,62],[53,62],[54,60],[41,62],[52,60]],
 'female-right':[[52,60],[54,64],[52,60],[50,63],[50,63],[50,63],[50,63],[50,64],[50,64],[50,64],[52,60],[44,61],[53,60]],
 'male-left':[[43,60],[42,61],[43,60],[45,61],[42,62],[44,62],[44,62],[43,62],[43,61],[43,61],[42,60],[48,62],[43,60]],
 'female-left':[[47,65],[46,66],[47,67],[47,66],[47,65],[47,66],[47,66],[47,67],[47,66],[47,66],[45,66],[49,66],[47,67]],
 'male-up':[[48,58],[48,57],[47,56],[48,57],[48,60],[49,58],[49,58],[48,60],[48,57],[48,57],[50,57],[49,58],[48,58]],
 'female-up':[[48,69],[49,67],[48,67],[48,64],[48,65],[48,65],[48,65],[48,65],[48,65],[48,65],[48,70],[48,72],[47,70]]
}
def authored_neck(group,gender,dir):
 p=REG[gender+'-'+dir][ORDER.index((group['pose'],group['phase']))].copy()
 if group['representative']['context']=='seated':p[1]+=19 if gender=='male'else 18
 return p

for group in groups:
 f=group['representative'];sid=f['id'];gender=sid.split('-')[0];dir=f['facing'];r=f['rect']['detail'];page=Image.open(ROOT/'game'/r['path']).convert('RGBA');before=page.crop((r['x'],r['y'],r['x']+96,r['y']+128));neck=authored_neck(group,gender,dir);cx,ny=neck;top=0
 # Authored removal contours follow the native curved jaw/neck silhouette.
 if gender=='male':
  if dir=='down':poly=[[cx-34,top],[cx+34,top],[cx+34,ny-18],[cx+25,ny-9],[cx+17,ny-4],[cx+8,ny+2],[cx-8,ny+2],[cx-17,ny-3],[cx-27,ny-10],[cx-34,ny-18]]
  elif dir=='up':poly=[[cx-32,top],[cx+32,top],[cx+32,ny-9],[cx+24,ny-3],[cx+12,ny+1],[cx-12,ny+1],[cx-25,ny-4],[cx-32,ny-12]]
  elif dir=='right':poly=[[cx-33,top],[cx+37,top],[cx+37,ny-6],[cx+22,ny+1],[cx+7,ny+2],[cx-2,ny-2],[cx-14,ny-6],[cx-30,ny-10]]
  else:poly=[[cx-37,top],[cx+33,top],[cx+30,ny-10],[cx+14,ny-6],[cx+2,ny-2],[cx-7,ny+2],[cx-22,ny+1],[cx-37,ny-6]]
 else:
  poly=[[cx-36,top],[cx+36,top],[cx+36,ny+4],[cx+27,ny+10],[cx+17,ny+9],[cx+8,ny+2],[cx-8,ny+2],[cx-18,ny+9],[cx-29,ny+9],[cx-36,ny+2]]
 base=before.copy();px=base.load();preserve=[]
 for y in range(128):
  for x in range(96):
   if inside(x+.5,y+.5,poly):
    if y>=ny-4 and px[x,y][3]>127 and max(px[x,y][:3])-min(px[x,y][:3])<14 and max(px[x,y][:3])>=25:preserve.append([x,y]);continue
    px[x,y]=(0,0,0,0)
 donor=next(p for p in male['sources']if p['gender']=='male' and p['dir']==dir)if gender=='male' else female['poses'][dir];dp=Path(donor.get('file',donor.get('fine','')));head=Image.open(dp).convert('RGBA');dn=[v*2 for v in donor['head']['neckAnchor']];delta=[round(neck[i]-dn[i])for i in range(2)];base.alpha_composite(head,tuple(delta))
 # Source-authored foreground hand patches transformed through the exact saved
 # source context/normalization. Native contacts must approve each family.
 actor=actors[gender];pose=group['pose'];phase=group['phase'];source_phase=1 if pose=='cigarette_light'and phase==2 or pose=='cigarette_puff'and phase==2 else phase
 old=actor['gestures'].get(pose)or actor['old_gestures'].get(pose);sd={'down':'front','up':'back'}.get(dir,dir);rec=old['directions'][sd]['frames'][source_phase];s=f['rect']['sourceScale']*2;ox=round(48-128*s);oy=round(126-224*s);upper=30 if f['context']=='seated'else 0
 polygons=[]
 # Real palm/prop contours authored on the pixel-grid guides, because the
 # historical hand_patches include demonstrably incorrect scalp/face boxes.
 palms={
  'male-down':{'light':[[29,54],[33,51],[40,51],[45,54],[46,60],[43,65],[35,65],[30,62]],'puff':[[33,56],[36,54],[42,54],[46,57],[46,62],[42,66],[35,65],[33,62]]},
  'female-down':{'light':[[33,56],[37,54],[43,54],[47,57],[47,62],[43,66],[36,66],[33,62]],'puff':[[34,60],[38,57],[44,58],[48,61],[47,66],[42,69],[36,68],[33,64]]},
  'male-right':{'light':[[60,54],[64,52],[69,53],[72,56],[72,62],[68,66],[62,65],[60,61]],'puff':[[59,57],[63,54],[68,54],[72,57],[72,62],[68,66],[62,66],[59,62]]},
  'female-right':{'light':[[59,55],[62,53],[67,53],[70,56],[70,61],[67,65],[62,65],[59,61]],'puff':[[59,54],[63,52],[68,53],[71,56],[71,61],[68,64],[62,63],[59,60]]},
  'male-left':{'light':[[23,62],[27,59],[32,59],[36,62],[36,69],[32,73],[25,72],[23,68]],'puff':[[29,58],[32,55],[37,55],[40,58],[40,64],[36,68],[30,67],[28,63]]},
  'female-left':{'light':[[29,55],[32,53],[36,53],[39,56],[39,61],[36,65],[31,64],[29,60]],'puff':[[25,60],[29,56],[33,53],[37,54],[40,57],[39,62],[35,65],[28,66],[24,64]]},
  'male-up':{'light':[[61,51],[66,49],[71,51],[72,56],[69,60],[63,60],[60,56]],'puff':[]},
  'female-up':{'light':[],'puff':[]}
 }
 if pose=='cigarette_puff' and phase in (1,2):polygons=[palms[gender+'-'+dir]['puff']]
 elif pose=='cigarette_light' and phase in (0,1,2):
  if not(dir=='left' and phase in (1,2)):polygons=[palms[gender+'-'+dir]['light']]
 polygons=[[[x,y+(19 if gender=='male'else 18)if f['context']=='seated'else y] for x,y in pol]for pol in polygons if pol]
 for pol in polygons:
  for y in range(128):
   for x in range(96):
    if inside(x+.5,y+.5,pol) and before.getpixel((x,y))[3]:base.putpixel((x,y),before.getpixel((x,y)))
 name=f'{sid}-{pose}-{phase}-candidate.png';base.save(OUT/name)
 meta=dict(sequenceId=sid,frameIndex=f['frameIndex'],actorId=f['actorId'],facing=dir,targetNeck=neck,removeHeadPolygon=poly,foregroundPolygons=polygons,sourceFine=r,headDonor=str(dp),headMetadata=donor['head'],translation=delta,draftFine=str(OUT/name),preserveCollar=True,notes='DRAFT initial neckline candidate; actual cloth gray retained; true source authored hands restored; needs native visual review',family=dict(pose=pose,phase=phase,frames=group['frames'],sourceTimelineIndex=group['sourceTimelineIndex']))
 entries.append(meta);rows[sid].append((group,neck,before,base))
for sid,rs in rows.items():
 c=Image.new('RGB',(8*204,4*292+30),'#202a36');q=ImageDraw.Draw(c);q.text((8,7),sid+' / DRAFT pairs source -> canonical (hand patch rectangles still under review)',fill='white')
 for n,(group,neck,before,after)in enumerate(rs):
  x=n%4*408+6;y=n//4*292+30
  for z,im in enumerate([before,after]):large=im.resize((192,256),Image.Resampling.NEAREST);c.paste(large,(x+z*200,y),large)
  q.text((x,y+257),f'{group["pose"]}/{group["phase"]} neck {neck}',fill='white')
 c.save(OUT/f'{sid}-draft-pairs.png')
json.dump(dict(version=1,status='draft',frames=entries),open(ROOT/'verification/action-head-annotations-daily-v29.json','w'),ensure_ascii=False,indent=2)
print(len(entries),'family drafts; nothing installed')

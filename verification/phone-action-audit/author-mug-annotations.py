"""Authored draft mug neck/head/foreground annotations from 16 inspected source contact sheets."""
from pathlib import Path
import json,hashlib
ROOT=Path(__file__).resolve().parents[2]
inv=json.loads((ROOT/'verification/world-action-inventory-v29.json').read_text())['frames'];frames=[r for r in inv if '-mug-'in r['id']]
N={
'male-front':[[48,62],[46,64],[48,62],[54,61],[47,61],[50,62],[47,63]],
'male-right':[[50,61],[40,65],[50,61],[54,58],[54,58],[51,62],[51,62]],
'male-back':[[46,57],[46,57],[46,57],[52,57],[50,57],[50,57],[46,58]],
'male-left':[[46,61],[55,64],[46,61],[42,60],[40,57],[45,62],[44,62]],
'female-front':[[48,65],[48,66],[48,65],[50,65],[48,64],[48,68],[48,66]],
'female-right':[[50,63],[44,64],[50,63],[51,62],[52,61],[53,64],[53,64]],
'female-back':[[48,70],[48,72],[48,70],[50,68],[49,68],[49,68],[48,72]],
'female-left':[[43,65],[45,68],[43,65],[48,65],[45,64],[46,64],[42,67]]}
# Curved underside profiles in source fine pixels, relative to the manually
# observed collar attachment. The broad top contains only the old head region.
P={
'male-front':[[-45,-10],[-19,-10],[-16,-7],[-12,-3],[-7,0],[7,0],[13,-3],[18,-8],[45,-10]],
'male-right':[[-45,-10],[-24,-10],[-19,-8],[-14,-3],[-8,-2],[-5,0],[5,0],[12,-3],[20,-7],[45,-8]],
'male-back':[[-45,-5],[-26,-5],[-19,-3],[-12,0],[12,0],[18,-3],[27,-5],[45,-5]],
'male-left':[[-45,-9],[-20,-6],[-13,-2],[-7,0],[4,0],[9,-4],[17,-7],[28,-9],[45,-10]],
'female-front':[[-46,-7],[-30,-1],[-24,1],[-17,0],[-12,-3],[-8,0],[8,0],[13,-3],[20,1],[28,0],[46,-7]],
'female-right':[[-46,-6],[-34,0],[-26,3],[-19,2],[-13,-2],[-8,-2],[-5,0],[5,0],[12,-5],[19,-7],[46,-7]],
'female-back':[[-46,-8],[-33,-6],[-28,-1],[-18,0],[17,0],[26,-2],[34,-6],[46,-8]],
'female-left':[[-46,-8],[-18,-7],[-13,-4],[-7,0],[3,0],[9,-2],[17,1],[24,2],[32,0],[46,-6]]}
# Visible mug/hand silhouettes that can cross the replacement-head area.
# Source RGBA is restored inside these polygons; transparent source remains transparent.
F={
'male-front':{3:[[[29,63],[41,62],[47,66],[54,68],[55,77],[49,82],[35,82],[29,78]]],4:[[[22,49],[33,49],[38,52],[42,54],[47,57],[47,64],[42,68],[29,68],[22,64]]]},
'male-right':{1:[[[54,63],[65,63],[68,67],[78,68],[83,72],[82,77],[75,80],[57,79],[54,75]]],3:[[[52,59],[63,59],[67,63],[74,64],[77,69],[76,76],[69,79],[53,77]]],4:[[[54,40],[67,40],[70,43],[77,44],[79,49],[77,55],[69,58],[56,59]]]},
'male-back':{4:[[[64,46],[70,47],[72,52],[70,57],[65,59],[62,56],[63,51]]]},
'male-left':{0:[[[7,63],[21,62],[25,66],[31,68],[30,74],[24,77],[21,82],[8,81]]],1:[[[8,65],[20,64],[24,68],[33,68],[39,72],[39,77],[31,80],[10,80]]],3:[[[18,61],[31,60],[37,64],[41,65],[42,72],[36,77],[20,78]]],4:[[[1,39],[14,39],[18,42],[23,43],[25,48],[23,55],[17,58],[2,57]]]},
'female-front':{4:[[[21,53],[32,53],[36,56],[41,57],[44,61],[43,66],[37,70],[22,69]]]},
'female-right':{1:[[[55,64],[66,64],[69,68],[76,69],[81,72],[80,77],[72,80],[56,79]]],3:[[[51,58],[63,58],[67,62],[72,63],[75,68],[74,74],[67,77],[52,76]]],4:[[[54,44],[65,44],[68,46],[73,47],[75,52],[73,58],[66,62],[54,62]]]},
'female-back':{},
'female-left':{3:[[[20,68],[31,67],[35,70],[40,72],[40,78],[35,83],[20,83]]],4:[[[8,48],[20,48],[23,51],[28,52],[30,57],[28,62],[21,66],[9,65]]]}}
standing={(r['id'],r['frameIndex']):r for r in frames if '-standing-'in r['id']}
records=[]
for r in frames:
 g='female'if r['actorId'].endswith('female')else'male';direction=r['id'].split('-')[-1];key=g+'-'+direction;i=r['frameIndex'];nx,ny=N[key][i]
 dy=0
 if '-seated-'in r['id']:
  st=standing[(r['id'].replace('-seated-','-standing-'),i)]
  dy=round((r['head']['top']-st['head']['top'])*2)
 ny+=dy
 boundary=[[max(0,min(96,nx+x)),ny+y]for x,y in P[key]]
 polygon=[[0,0],[96,0],[96,boundary[-1][1]],*reversed(boundary),[0,boundary[0][1]]]
 foreground=[[[x,y+dy]for x,y in poly]for poly in F[key].get(i,[])]
 detail={k:r['rect']['detail'][k]for k in ['path','x','y','w','h']}
 records.append({'sequenceId':r['id'],'frameIndex':i,'actorId':r['actorId'],'facing':r['facing'],'targetNeck':[nx,ny],'removeHeadPolygon':polygon,'foregroundPolygons':foreground,'sourceFine':detail,'sourceAtlasSha256':hashlib.sha256((ROOT/'game'/detail['path']).read_bytes()).hexdigest(),'notes':f'Draft authored after raw fine source contact inspection; collar position entered per pose; curved removal underside is gender/direction specific. Seated vertical registration {dy}px verified against matching standing source pose. Foreground restores only actual PNG pixels. Female shoulder source occluded by old hair must be checked on composite; no invented cloth or body warp.'})
result={'version':1,'status':'draft','scope':'mug112; 16 native sequences ×7 frames, all raw contacts visually inspected','coordinateSpace':'fine96x128; polygon coordinates are pixel-edge coordinates; targetNeck is a pixel-space point','review':'Source contact inspection completed. Composite/neck joins and foreground ownership require actual overlay review before activation.','frames':records}
(ROOT/'verification/action-head-annotations-mug-v29.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('authored',len(records),'foreground frames',sum(bool(r['foregroundPolygons'])for r in records))

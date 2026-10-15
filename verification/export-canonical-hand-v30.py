"""Export authored HAND whole-body sheets. No drawing, warping or bbox fitting.

Body: one uniform scalar per model + explicit authored sole-root translations.
Head: exact C opaque RGBA through the reviewed donor's real alpha shape.
Foreground: only the actual drawn mouth hand and its authored contour.
Outputs are staged drafts until contact-sheet / body / alpha review.
"""
import hashlib,json,math
from collections import deque
from pathlib import Path
from PIL import Image,ImageDraw
BASE=Path('.');ART=BASE/'art/drafts/canonical-actions-v30/hand';VER=BASE/'verification'
META=json.loads((VER/'canonical-master-heads-v30.json').read_text())
POSES=['waist','chest','mouth','extended']
PELVIS={'male-down':[48,91],'male-right':[47,91],'male-up':[48,90],'male-left':[44,91],'female-down':[47,94],'female-right':[47,94],'female-up':[48,91],'female-left':[42,93]}
# Explicit source pixel landmarks, observed on the supplied 543x724 cells.
# Column root changes compensate the whole figure's generated cell placement;
# they do not normalize figure bboxes or change body proportions.
CONFIG={
 'male-right': {'roots':[[288,666],[272,666],[288,666],[272,666]],'palms':[[42,87],[51,72],[66,59],[72,74]]},
 'male-down': {'roots':[[288,666],[198,666],[288,666],[198,666]],'palms':[[36,85],[45,73],[44,61],[34,79]]},
 'male-left': {'roots':[[288,666]]*4,'palms':[[42,87],[42,73],[29,65],[17,74]]},
 'male-up': {'roots':[[288,666],[252,666],[288,666],[252,666]],'palms':[[39,81],[36,61],[37,56],[25,69]]},
 'female-right': {'roots':[[288,666],[229,666],[288,666],[229,666]],'palms':[[47,90],[55,78],[67,65],[72,78]]},
 'female-down': {'roots':[[288,666],[229,666],[288,666],[229,666]],'palms':[[41,88],[47,77],[46,69],[38,83]]},
 'female-left': {'roots':[[288,666]]*4,'palms':[[40,84],[40,73],[29,64],[22,78]]},
 'female-up': {'roots':[[288,666],[194,666],[288,666],[194,666]],'palms':[[42,85],[35,64],[41,63],[30,79]]},
}
# Refined authored registration: sole-plane row shifts are whole-cell placement
# differences, while source neck / torso landmarks register the C head join.
# The scalar remains unchanged; no figure is stretched or bbox-fit.
REFINED={
 'male-right':[[288,666],[272,666],[288,661],[272,661]],
 'male-down':[[299,672],[209,672],[299,672],[209,672]],
 'male-left':[[327,666]]*4,
 'male-up':[[299,670],[263,670],[299,670],[263,670]],
 'female-right':[[306,679],[247,679],[306,664],[247,664]],
 'female-down':[[312,662],[253,662],[312,662],[253,662]],
 'female-left':[[323,672],[323,671],[323,671],[323,671]],
 'female-up':[[312,672],[218,672],[312,672],[218,672]],
}
for name,roots in REFINED.items():
 scalar=.181 if name.startswith('male-')else .170;cfg=CONFIG[name]
 cfg['palms']=[[round(p[0]+(old[0]-new[0])*scalar),round(p[1]+(old[1]-new[1])*scalar)]for p,old,new in zip(cfg['palms'],cfg['roots'],roots)]
 cfg['roots']=roots

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def inside(x,y,p):
 hit=False
 for a,b in zip(p,p[1:]+p[:1]):
  if(a[1]>y)!=(b[1]>y)and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:hit=not hit
 return hit

def cloth_mask(im,neck_y):
 """Protect only source neutral coat components connected to the actual body."""
 px=im.load();pending=set();out=set()
 for y in range(128):
  for x in range(96):
   r,g,b,a=px[x,y]
   if a>127 and max(r,g,b)-min(r,g,b)<=18 and max(r,g,b)>=25:pending.add((x,y))
 while pending:
  z=pending.pop();q=[z];comp=[];body=False
  while q:
   x,y=q.pop();comp.append((x,y));body|=y>neck_y+5
   for v in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
    if v in pending:pending.remove(v);q.append(v)
  if body:
   out.update(comp)
   # Retain existing dark cloth contour, not newly painted pixels.
   for x,y in comp:
    for yy in range(max(0,y-1),min(128,y+2)):
     for xx in range(max(0,x-1),min(96,x+2)):
      r,g,b,a=px[xx,yy]
      if a>127 and max(r,g,b)<=35 and max(r,g,b)-min(r,g,b)<=18:out.add((xx,yy))
 return out

def palm_mask(im,point,limit):
 """Actual warm palm component, plus its one-pixel source contour, inside authored domain."""
 px=im.load();warm=set()
 for y in range(128):
  for x in range(96):
   r,g,b,a=px[x,y]
   if a>127 and r>=150 and r-g>35 and g-b>13 and inside(x+.5,y+.5,limit):warm.add((x,y))
 start=min(warm,key=lambda q:(q[0]-point[0])**2+(q[1]-point[1])**2);q=[start];warm.remove(start);comp={start}
 while q:
  x,y=q.pop()
  for v in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
   if v in warm:warm.remove(v);q.append(v);comp.add(v)
 out=set(comp)
 for x,y in comp:
  for yy in range(max(0,y-1),min(128,y+2)):
   for xx in range(max(0,x-1),min(96,x+2)):
    r,g,b,a=px[xx,yy]
    if a>127 and inside(xx+.5,yy+.5,limit):out.add((xx,yy))
 return out

# Later root-reviewed literal-source neck repairs remain reproducible. They
# never authorize a new painted pixel or overwrite visible canonical art.
canonical_text=(BASE/'game/web/canonical-actors-data.js').read_text()
CURRENT_C=json.loads(canonical_text.split('=',1)[1].strip().removesuffix(';'))
neck_manifest_path=None;neck_repairs=[]
for candidate in [VER/'neck-retention-v30/combined-candidates-v1/approved-repair-manifest.json',VER/'neck-retention-v30/candidates-v4/approved-repair-manifest.json']:
 if candidate.exists():
  data=json.loads(candidate.read_text())
  if data.get('status')=='approved'and data.get('artReview',{}).get('checked'):
   neck_manifest_path=candidate;neck_repairs=[r for r in data['repairs']if r['family']=='hand'];break
families={};all_metrics=[];replayed_assets={}

for name,config in CONFIG.items():
 gender,direction=name.split('-');folder=ART/name;raw=Image.open(folder/'sheet.png').convert('RGBA');assert raw.size==(1086,1448)
 scalar=.181 if gender=='male'else .170;meta={**META['human-'+name],'head':CURRENT_C['actors']['human-'+gender]['idle'][direction]['frames'][0]['head']};C=Image.open(BASE/'game'/meta['detail']['path']).convert('RGBA')
 donor_path=Path('art/drafts/locomotion-v27/shared-head-style-proposal')/f'male-{direction}-native-run0-head-fine.png'if gender=='male'else Path('art/drafts/canonical-face-v29/female-heads-v1')/f'{direction}-fine.png'
 donor=Image.open(donor_path).convert('RGBA');delta=meta['headTranslation'];neck_y=meta['head']['neckAnchor'][1]*2
 # The polygon contains the generated head only. Connected gray coat and its
 # dark contour survive even where loose source head geometry overlaps them.
 nx,ny=[v*2 for v in meta['head']['neckAnchor']]
 neck_domain=[[nx-5,ny-1],[nx+4,ny-1],[nx+5,ny+7],[nx-5,ny+7]]
 bottom=70 if gender=='male'else 77
 remove=[[8,0],[88,0],[88,bottom-14],[80,bottom-5],[65,bottom],[39,bottom],[23,bottom-5],[8,bottom-14]]
 images=[];details=[];frames=[];metrics=[];contact=Image.new('RGB',(5*216,360),'#dce5e1');draw=ImageDraw.Draw(contact)
 def paste(im,col,label):
  enlarged=im.resize((192,256),Image.Resampling.NEAREST);contact.paste(enlarged,(216*col+8,44),enlarged);draw.text((216*col+8,12),label,fill='#142027')
 paste(C,0,name+' C idle')
 for n in range(4):
  rect=[n%2*543,n//2*724,543,724];cell=raw.crop((rect[0],rect[1],rect[0]+543,rect[1]+724));cell.save(folder/f'pose-{n}-master.png')
  root=config['roots'][n];offset=[48-root[0]*scalar,126-root[1]*scalar]
  body=cell.transform((96,128),Image.Transform.AFFINE,(1/scalar,0,-offset[0]/scalar,0,1/scalar,-offset[1]/scalar),Image.Resampling.NEAREST);before=body.copy();keep=cloth_mask(body,neck_y);pixels=body.load();removed=0
  for y in range(128):
   for x in range(96):
    if inside(x+.5,y+.5,remove)and(x,y)not in keep and not inside(x+.5,y+.5,neck_domain):
     removed+=pixels[x,y][3]>127;pixels[x,y]=(0,0,0,0)
  repair=next((r for r in neck_repairs if r['actorId']=='human-'+gender and r['direction']==direction and r['frameIndex']==n),None)
  if repair:
   assert sha(repair['sourceRegistered'])==repair['sourceRegisteredSHA256']
   for point in repair['fine']['restoredPixels']:
    xy=point['x'],point['y'];assert before.getpixel(xy)==tuple(point['sourceRGBA'])
    assert pixels[xy][3]<=127,'neck replay must not overwrite existing visible body'
    pixels[xy]=before.getpixel(xy)
  body.save(folder/f'pose-{n}-body-fine.png')
  head_points=[]
  for y in range(128):
   for x in range(96):
    sx,sy=x-delta[0],y-delta[1]
    if 0<=sx<96 and 0<=sy<128 and donor.getpixel((sx,sy))[3]>127:
     # Exact current canonical head RGBA, never generated substitute face.
     pixels[x,y]=C.getpixel((x,y));head_points.append((x,y))
  foreground=set();fg_poly=[];palm=config['palms'][n]
  if direction!='up'or n in[0,3]:
   x,y=palm;fg_poly=[[x-6,y-7],[x+4,y-7],[x+7,y-2],[x+6,y+6],[x-5,y+7],[x-7,y+1]];foreground=palm_mask(before,palm,fg_poly)
   for x,y in foreground:pixels[x,y]=before.getpixel((x,y))
  fine=folder/f'pose-{n}-fine.png';coarse=folder/f'pose-{n}.png';body.save(fine);body.resize((48,64),Image.Resampling.NEAREST).save(coarse)
  if repair:
   for path,kind in[(fine,'fine'),(coarse,'coarse')]:
    approved_image=Path(repair[kind]['candidate']);assert sha(approved_image)==repair[kind]['candidateSHA256']
    assert Image.open(path).convert('RGBA').tobytes()==Image.open(approved_image).convert('RGBA').tobytes(),'approved literal-source replay RGBA differs'
    replayed_assets[str(path)]=sha(path)
  page=len(images);images.append({'path':str(coarse),'width':48,'height':64,'sha256':sha(coarse)});details.append({'path':str(fine),'width':96,'height':128,'sha256':sha(fine)})
  source_palm=[(palm[0]-offset[0])/scalar,(palm[1]-offset[1])/scalar]
  frame={'page':page,'x':0,'y':0,'w':48,'h':64,'head':meta['head'],'hand':[palm[0]/2,palm[1]/2],'pelvis':[v/2 for v in PELVIS[name]],'detail':{'path':str(fine),'x':0,'y':0,'w':96,'h':128,'factor':2},'poseKey':POSES[n], 'provenance':{'sourceCell':rect,'sourceScale':scalar,'sourceRoot':root,'nativeOffset':offset,'sourcePalm':source_palm,'nativePalm':palm,'headDonor':str(donor_path),'headTranslation':delta,'canonicalHead':meta['detail']['path'],'canonicalHeadSHA256':sha(BASE/'game'/meta['detail']['path']),'removeGeneratedHeadPolygon':remove,'retainedActualBodyNeckPolygon':neck_domain,'foregroundPalmDomain':fg_poly,'foregroundSourcePixelCount':len(foreground),'foregroundSourcePixels':[list(v)for v in sorted(foreground)],'sourcePelvis':[(PELVIS[name][0]-offset[0])/scalar,(PELVIS[name][1]-offset[1])/scalar],'nativePelvis':PELVIS[name]}}
  if repair:frame['provenance']['approvedSourceNeckRetention']={'manifest':str(neck_manifest_path),'manifestSHA256':sha(neck_manifest_path),'sourceRegistered':repair['sourceRegistered'],'restoredFinePoints':[[p['x'],p['y']]for p in repair['fine']['restoredPixels']]}
  if direction=='up'and n in[1,2]:frame.update({'propLayer':'behind-body','handVisibility':'occluded-by-head'if n==2 else'occluded-by-body'});frame['provenance']['palmIsOccluded']=True;frame['provenance']['sourcePalmKind']='authored-occluded-anatomical-point'
  else:frame['provenance']['sourcePalmKind']='actual-source-palm'
  frames.append(frame)
  opaque=[(x,y)for y in range(128)for x in range(96)if pixels[x,y][3]>127]
  mismatch=[(x,y)for x,y in head_points if(x,y)not in foreground and pixels[x,y]!=C.getpixel((x,y))]
  lost_cloth=[(x,y)for x,y in keep if(x,y)not in foreground and(x,y)not in head_points and pixels[x,y]!=before.getpixel((x,y))]
  metric={'family':name,'pose':n,'opaqueBounds':[min(x for x,y in opaque),min(y for x,y in opaque),max(x for x,y in opaque),max(y for x,y in opaque)],'sourceScale':scalar,'headCompared':len(head_points)-len(set(head_points)&foreground),'headMismatch':len(mismatch),'keptClothPixelChanges':len(lost_cloth),'removedGeneratedHead':removed,'foregroundPixels':len(foreground),'palmRGBA':list(before.getpixel(tuple(palm))), 'edgeAlpha':sum(pixels[x,y][3]>127 for x,y in opaque if x in [0,95]or y in [0,127])}
  metrics.append(metric);all_metrics.append(metric);paste(body,n+1,POSES[n])
 draw.text((8,322),'DRAFT: same C head; newly drawn body; uniform family scalar; authored source roots. Review before activation.',fill='#142027');contact.save(VER/f'canonical-hand-{name}-v30-draft.png')
 seq={'id':'canonical-hand-'+name,'status':'draft','artReview':{'checked':False,'evidence':[]},'images':images,'detail_images':details,'frames':frames,'anchor':[24,63],'sprite_size':[48,64],'loop':False,'fps':4,'duration':1,'timeline':[0,1,2,3],'sourceKey':str(folder/'sheet.png'),'provenance':{'sourceSHA256':sha(folder/'sheet.png'),'prompt':str(folder/'prompt-info.json'),'sourceScale':scalar,'canonicalHeadMetadata':'verification/canonical-master-heads-v30.json','currentHeadMetadataAuthority':'game/web/canonical-actors-data.js','currentHeadMetadataSHA256':sha(BASE/'game/web/canonical-actors-data.js'),'exportScript':'verification/export-canonical-hand-v30.py','contact':f'verification/canonical-hand-{name}-v30-draft.png','generatedBody':True,'oldLegacyBodyUsed':False}}
 receipt_path=VER/'canonical-hand-root-receipt-v30.json'
 if receipt_path.exists():
  receipt=json.loads(receipt_path.read_text())
  approved=receipt.get('sources',{}).get(seq['sourceKey'])==seq['provenance']['sourceSHA256']and all((receipt.get('assets',{}).get(v['path'])==v['sha256']or replayed_assets.get(v['path'])==v['sha256'])for v in images+details)
  if approved:seq['status']='approved';seq['artReview']={'checked':True,'evidence':['verification/canonical-hand-art-review-v30.md','verification/canonical-hand-root-receipt-v30.json']+([str(neck_manifest_path)]if any(f.get('provenance',{}).get('approvedSourceNeckRetention')for f in frames)else[])}
 families.setdefault('human-'+gender,{'families':{'hand':{}}})['families']['hand'][direction]=seq
 (folder/'export-evidence.json').write_text(json.dumps({'status':seq['status'],'sequence':seq,'metrics':metrics},indent=2)+'\n')
(VER/'canonical-hand-staged-v30.json').write_text(json.dumps({'schema':'bziker-canonical-hand-staging/v1','actors':families},indent=2)+'\n')
approved_count=sum(seq['status']=='approved' for actor in families.values() for seq in actor['families']['hand'].values())
review_status='limited-native-art-approved; runtime wardrobe/props pending' if approved_count==8 else 'draft; native visual review required'
(VER/'canonical-hand-metrics-v30.json').write_text(json.dumps({'status':review_status,'approvedFamilies':approved_count,'frames':all_metrics},indent=2)+'\n')
print(json.dumps({'frames':len(all_metrics),'headMismatch':sum(x['headMismatch']for x in all_metrics),'keptClothChanges':sum(x['keptClothPixelChanges']for x in all_metrics),'edgeAlpha':sum(x['edgeAlpha']for x in all_metrics),'status':review_status,'approvedFamilies':approved_count}))

if replayed_assets:(VER/'canonical-hand-neck-replay-v30.json').write_text(json.dumps({'status':'exact root-approved literal-source replay','manifest':str(neck_manifest_path),'assets':replayed_assets},indent=2)+'\n')

"""Literal-source draft repair only. No production or previously approved file writes."""
import json,hashlib,pathlib
from PIL import Image,ImageDraw
ROOT=pathlib.Path('.');OUT=ROOT/'verification/neck-retention-v30/candidates-v4';OUT.parent.mkdir(exist_ok=True);assert not OUT.exists() or not any(OUT.iterdir()),'Fresh empty candidate directory required';OUT.mkdir(exist_ok=True)
AUDIT=ROOT/'verification/phone-action-audit/source-c8-a104-v30';records=json.load(open(AUDIT/'records.json'))
comparisons=[*json.load(open(AUDIT/'hand-original-comparison.json')),*json.load(open(AUDIT/'lower-original-comparison.json'))]
selected=[('hand','left',2,17),('hand','left',3,18),('lowerReach','down',1,16),('lowerReach','right',1,7),('lowerReach','right',2,10),('lowerReach','left',1,21),('lowerReach','left',2,12)]
H=json.load(open(ROOT/'art/drafts/canonical-face-v29/female-heads-v1/export-evidence.json'))
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
manifest={'schema':'bziker-literal-neck-repair/v1','status':'draft','productionWrites':False,'scope':'7 female A source frames; source-backed transparent collar pixels only; no floodfill','repairs':[]}
contact=Image.new('RGB',(1100,4*360),'#ed8d74');g=ImageDraw.Draw(contact)
for n,(family,direction,index,area) in enumerate(selected):
 r=next(v for v in comparisons if v['actorId']=='human-female' and v['family']==family and v['dir']==direction and v['index']==index)
 audit=next(v for v in records if v['collection']=='A' and v['actorId']=='human-female' and v['family']==family and v['dir']==direction and v['index']==index)
 hole=next(h for h in r['holes'] if h['area']==area and h['erasedOpaqueSourcePixels']==area)
 fine=ROOT/r['target'];coarse=fine.with_name(fine.name.replace('-fine.png','.png'));assert sha(fine)==audit['sha256'],'Audited target changed'
 before=Image.open(fine).convert('RGBA');after=before.copy();bc=Image.open(coarse).convert('RGBA');ac=bc.copy();source=Image.open(r['source']).convert('RGBA')
 points=[];fine_existing_nonzero_skips=[];coarse_points=[];coarse_existing_nonzero_skips=[];head=H['poses'][direction];donor=Image.open(ROOT/head['fine']).convert('RGBA');delta=[int(audit['head']['neckAnchor'][i]*2-head['head']['neckAnchor'][i]*2) for i in range(2)]
 for point in hole['actualErasedPixels']:
  x,y=point['point'];rgba=tuple(point['sourceRGBA']);assert rgba[3]>127 and source.getpixel((x,y))==rgba,'Actual source mismatch'
  if before.getpixel((x,y))[3]>127:
   fine_existing_nonzero_skips.append({'point':[x,y],'originalRGBA':list(before.getpixel((x,y))),'sourceRGBA':list(rgba)});continue
  dx,dy=x-delta[0],y-delta[1];assert not(0<=dx<96 and 0<=dy<128 and donor.getpixel((dx,dy))[3]>127),'Would alter canonical donor opaque location'
  after.putpixel((x,y),rgba);points.append({'x':x,'y':y,'sourceRGBA':list(rgba),'previousRGBA':list(before.getpixel((x,y))),'restoredLowAlpha':0<before.getpixel((x,y))[3]<=127})
 for y in range(64):
  for x in range(48):
   sx,sy=2*x+1,2*y+1
   if after.getpixel((sx,sy))!=before.getpixel((sx,sy)):
    if bc.getpixel((x,y))[3]>127:
     coarse_existing_nonzero_skips.append({'point':[x,y],'originalRGBA':list(bc.getpixel((x,y))),'fineSample':[sx,sy]});continue
    rgba=source.getpixel((sx,sy));assert rgba[3]>127
    ac.putpixel((x,y),rgba);coarse_points.append({'x':x,'y':y,'sourceFine':[sx,sy],'sourceRGBA':list(rgba),'previousRGBA':list(bc.getpixel((x,y))),'restoredLowAlpha':0<bc.getpixel((x,y))[3]<=127})
 fine_unchanged=sum(before.getpixel((x,y))[3]>127 and before.getpixel((x,y))!=after.getpixel((x,y)) for y in range(128) for x in range(96));coarse_unchanged=sum(bc.getpixel((x,y))[3]>127 and bc.getpixel((x,y))!=ac.getpixel((x,y)) for y in range(64) for x in range(48));assert fine_unchanged==coarse_unchanged==0
 donor_touched=0
 for yy in range(128):
  for xx in range(96):
   if donor.getpixel((xx,yy))[3]>127:
    x,y=xx+delta[0],yy+delta[1]
    if 0<=x<96 and 0<=y<128 and before.getpixel((x,y))!=after.getpixel((x,y)):donor_touched+=1
 assert donor_touched==0
 name=f'female-{family}-{direction}-{index}';candidate=OUT/(name+'-fine.png');candidate_coarse=OUT/(name+'.png');after.save(candidate);ac.save(candidate_coarse)
 change_points={(p['x'],p['y']) for p in points};assert all(before.getpixel((x,y))==after.getpixel((x,y)) or (x,y) in change_points for y in range(128) for x in range(96))
 entry={'actorId':'human-female','family':family,'direction':direction,'frameIndex':index,'status':'draft','fine':{'target':str(fine),'beforeSHA256':sha(fine),'candidate':str(candidate),'candidateSHA256':sha(candidate),'restoredPixels':points,'existingNonzeroPixelsPreserved':fine_existing_nonzero_skips},'coarse':{'target':str(coarse),'beforeSHA256':sha(coarse),'candidate':str(candidate_coarse),'candidateSHA256':sha(candidate_coarse),'restoredPixels':coarse_points,'existingNonzeroSamplesPreserved':coarse_existing_nonzero_skips},'sourceRegistered':r['source'],'sourceRegisteredSHA256':sha(r['source']),'canonicalDonor':head['fine'],'canonicalDonorSHA256':sha(ROOT/head['fine']),'invariants':{'originalVisibleFineRGBAChanges':fine_unchanged,'originalVisibleCoarseRGBAChanges':coarse_unchanged,'canonicalDonorOpaqueRGBAChanges':donor_touched,'allRestoredSourceAlphaAbove127':True,'allTargetsOriginallyRuntimeTransparent':True,'noAddedNonSourceRGBA':True,'noChangeOutsideAuthoredPoints':True,'rootAndFrameMetadataUnchanged':True}}
 manifest['repairs'].append(entry)
 px=(n%2)*550;py=(n//2)*360;g.text((px+8,py+8),f'{family} {direction} {index}: BEFORE / AFTER; +{len(points)} source pixels ({sum(p['restoredLowAlpha'] for p in points)} low-alpha)',fill='#111111')
 nx,ny=r['neck']
 for j,im in enumerate([before,after]):
  tile=im.crop((nx-17,ny-10,nx+17,ny+24)).resize((272,272),Image.Resampling.NEAREST);contact.paste(tile,(px+j*275,py+42),tile)
manifest['totals']={'frames':len(manifest['repairs']),'restoredFinePixels':sum(len(r['fine']['restoredPixels']) for r in manifest['repairs']),'restoredLowAlphaFinePixels':sum(p['restoredLowAlpha'] for r in manifest['repairs'] for p in r['fine']['restoredPixels']),'restoredLowAlphaCoarsePixels':sum(p['restoredLowAlpha'] for r in manifest['repairs'] for p in r['coarse']['restoredPixels']),'preservedNonzeroFineCandidates':sum(len(r['fine']['existingNonzeroPixelsPreserved']) for r in manifest['repairs']),'restoredCoarsePixels':sum(len(r['coarse']['restoredPixels']) for r in manifest['repairs']),'donorOpaqueRGBAChanges':0,'originalVisibleRGBAChanges':0,'productionWrites':0}
contact.save(OUT/'before-after-contact.png');(OUT/'repair-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');print(json.dumps(manifest['totals']))

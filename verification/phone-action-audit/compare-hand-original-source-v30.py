import json,pathlib
from PIL import Image
out=pathlib.Path('verification/phone-action-audit/source-c8-a104-v30')
rows=json.load(open(out/'records.json'));results=[]
for r in rows:
 if r['family']!='hand' or not r['neckHoles']:continue
 folder=pathlib.Path('art/drafts/canonical-actions-v30/hand')/(r['actorId'][6:]+'-'+r['dir'])
 ev=json.load(open(folder/'export-evidence.json'));f=ev['sequence']['frames'][r['index']];p=f['provenance'];s=p['sourceScale'];offset=p['nativeOffset']
 cell=Image.open(folder/f"pose-{r['index']}-master.png").convert('RGBA')
 im=cell.transform((96,128),Image.Transform.AFFINE,(1/s,0,-offset[0]/s,0,1/s,-offset[1]/s),Image.Resampling.NEAREST)
 file=out/f"registered-source-hand-{r['actorId'][6:]}-{r['dir']}-{r['index']}.png";im.save(file)
 hs=[]
 for h in r['neckHoles']:
  pixels=[{'point':[x,y],'sourceRGBA':list(im.getpixel((x,y)))} for x,y in h['pixels'] if im.getpixel((x,y))[3]>127]
  hs.append({'area':h['area'],'bounds':h['bounds'],'erasedOpaqueSourcePixels':len(pixels),'actualErasedPixels':pixels})
 results.append({'actorId':r['actorId'],'family':r['family'],'dir':r['dir'],'index':r['index'],'source':str(file),'target':r['path'],'neck':r['neck'],'holes':hs})
(out/'hand-original-comparison.json').write_text(json.dumps(results,indent=2)+'\n')
print([(r['actorId'],r['dir'],r['index'],[(h['area'],h['erasedOpaqueSourcePixels']) for h in r['holes']]) for r in results])

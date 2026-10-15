"""Read-only checks for staged whole-body HAND exports and authored registration."""
import hashlib,json,unittest
from pathlib import Path
from PIL import Image
ROOT=Path('.');DATA=json.loads(Path('verification/canonical-hand-staged-v30.json').read_text());META=json.loads(Path('verification/canonical-master-heads-v30.json').read_text())
canonical_text=Path('game/web/canonical-actors-data.js').read_text()
CURRENT_C=json.loads(canonical_text.split('=',1)[1].strip().removesuffix(';'))
def frames():
 for actor,a in DATA['actors'].items():
  for dr,s in a['families']['hand'].items():
   for n,f in enumerate(s['frames']):yield actor,dr,s,n,f

def rgb(path):return Image.open(path).convert('RGBA')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
class HandExport(unittest.TestCase):
 def test_all_32_resources_and_unchanged_source_hashes(self):
  self.assertEqual(len(list(frames())),32)
  for actor,dr,s,n,f in frames():
   self.assertEqual(sha(s['sourceKey']),s['provenance']['sourceSHA256']);self.assertFalse(s['provenance']['oldLegacyBodyUsed'])
   self.assertEqual(rgb(f['detail']['path']).size,(96,128));self.assertEqual(rgb(s['images'][n]['path']).size,(48,64))
   self.assertEqual(sha(f['detail']['path']),s['detail_images'][n]['sha256']);self.assertEqual(sha(s['images'][n]['path']),s['images'][n]['sha256'])
 def test_one_uniform_scalar_and_fixed_canvas_authored_root(self):
  for actor,dr,s,n,f in frames():
   p=f['provenance'];sc=p['sourceScale'];self.assertEqual(sc,.181 if actor=='human-male'else .170)
   self.assertEqual(sc,s['provenance']['sourceScale']);self.assertAlmostEqual(p['nativeOffset'][0]+p['sourceRoot'][0]*sc,48);self.assertAlmostEqual(p['nativeOffset'][1]+p['sourceRoot'][1]*sc,126)
   for k in range(2):self.assertAlmostEqual((p['sourcePalm'][k]*sc+p['nativeOffset'][k])/2,f['hand'][k]);self.assertAlmostEqual((p['sourcePelvis'][k]*sc+p['nativeOffset'][k])/2,f['pelvis'][k])
 def test_exact_canonical_head_except_actual_foreground_palm(self):
  count=0
  for actor,dr,s,n,f in frames():
   p=f['provenance'];out=rgb(f['detail']['path']);C=rgb('game/'+p['canonicalHead']);donor=rgb(p['headDonor']);dx,dy=p['headTranslation'];fg={tuple(v)for v in p['foregroundSourcePixels']}
   self.assertEqual(f['head'],CURRENT_C['actors'][actor]['idle'][dr]['frames'][0]['head'])
   for y in range(128):
    for x in range(96):
     sx,sy=x-dx,y-dy
     if 0<=sx<96 and 0<=sy<128 and donor.getpixel((sx,sy))[3]>127 and(x,y)not in fg:self.assertEqual(out.getpixel((x,y)),C.getpixel((x,y)),(actor,dr,n,x,y));count+=1
  self.assertGreater(count,40000)
 def test_foreground_contains_only_original_pose_rgba(self):
  for actor,dr,s,n,f in frames():
   p=f['provenance'];cell=rgb(Path(s['sourceKey']).parent/f'pose-{n}-master.png');sc=p['sourceScale'];ox,oy=p['nativeOffset'];src=cell.transform((96,128),Image.Transform.AFFINE,(1/sc,0,-ox/sc,0,1/sc,-oy/sc),Image.Resampling.NEAREST);out=rgb(f['detail']['path'])
   for x,y in p['foregroundSourcePixels']:self.assertGreater(src.getpixel((x,y))[3],127);self.assertEqual(out.getpixel((x,y)),src.getpixel((x,y)),(actor,dr,n,x,y))
   if f.get('handVisibility','visible')=='visible':self.assertGreater(src.getpixel(tuple(p['nativePalm']))[3],127,(actor,dr,n,p['nativePalm']))
   else:self.assertEqual(dr,'up');self.assertIn(n,[1,2]);self.assertEqual(f['propLayer'],'behind-body');self.assertTrue(p['palmIsOccluded'])
 def test_safety_edge_same_ground_and_canonical_height(self):
  for actor,dr,s,n,f in frames():
   a=rgb(f['detail']['path']);C=rgb('game/'+f['provenance']['canonicalHead']);pts=[(x,y)for y in range(128)for x in range(96)if a.getpixel((x,y))[3]>127];cp=[(x,y)for y in range(128)for x in range(96)if C.getpixel((x,y))[3]>127]
   self.assertFalse(any(x in[0,95]or y in[0,127]for x,y in pts),(actor,dr,n));self.assertEqual(max(y for x,y in pts),125);self.assertEqual(min(y for x,y in pts),min(y for x,y in cp))
 def test_body_and_head_are_physically_connected(self):
  for actor,dr,s,n,f in frames():
   a=rgb(f['detail']['path']);pending={(x,y)for y in range(128)for x in range(96)if a.getpixel((x,y))[3]>127};components=[]
   while pending:
    z=pending.pop();q=[z];component=[]
    while q:
     x,y=q.pop();component.append((x,y))
     for dy in[-1,0,1]:
      for dx in[-1,0,1]:
       v=x+dx,y+dy
       if v in pending:pending.remove(v);q.append(v)
    if len(component)>4:components.append(component)
   self.assertEqual(len(components),1,(actor,dr,n));self.assertLess(min(y for x,y in components[0]),25);self.assertGreater(max(y for x,y in components[0]),120)
 def test_coarse_is_whole_uniform_native_derivative(self):
  for actor,dr,s,n,f in frames():self.assertEqual(rgb(f['detail']['path']).resize((48,64),Image.Resampling.NEAREST).tobytes(),rgb(s['images'][n]['path']).tobytes())
if __name__=='__main__':unittest.main(verbosity=2)

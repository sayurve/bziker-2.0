"""Prepare a single-block patch and isolated candidate; never edits runtime."""
from pathlib import Path
import difflib,hashlib
ROOT=Path(__file__).resolve().parents[3]
p=ROOT/'game/web/actor-sprite.js';s=p.read_text()
old=" if(a.pantsStyle===2){for(let y=44;y<54;y++)for(let x=12-(y-44>>2);x<=27+(y-44>>2);x++){const c=at(originals,Math.max(14,Math.min(25,x)),44+(y-44)%6);if(c)set(g,x,y,shade(c,catalog.pantsColor.colors[a.pantsColor],'pants'));}}"
new=""" if(a.pantsStyle===2){
  // Build one continuous cloth support from actual dark trouser pixels.
  // Wrapping source rows also wrapped their alpha gaps and bright shirt hems.
  const cloth=[],waist=[];
  for(let y=44;y<54;y++)for(let x=12;x<=27;x++){
   const c=at(originals,x,y);if(!c||skin(c)||Math.max(...rgb(c))>=115)continue;
   cloth.push({x,y,c});if(y<47)waist.push(x);
  }
  if(cloth.length){
   const left=waist.length?Math.min(...waist):14,right=waist.length?Math.max(...waist):25;
   for(let y=44;y<54;y++)for(let x=left-((y-44)>>2);x<=right+((y-44)>>2);x++){
    const c=at(originals,x,y);
    // Retain authored hands, skin contours and long hair above the garment.
    if(c&&(skin(c)||faceMaterial[index(x,y)]||hairMask[index(x,y)]))continue;
    let nearest=cloth[0],distance=Infinity;
    for(const sample of cloth){const d=Math.abs(sample.x-x)+Math.abs(sample.y-y);if(d<distance){nearest=sample;distance=d;}}
    set(g,x,y,shade(nearest.c,catalog.pantsColor.colors[a.pantsColor],'pants'));
   }
  }
 }"""
assert s.count(old)==1,'The agreed pants block changed; re-review before patching'
changed=s.replace(old,new)
out=Path(__file__).resolve().parent
(out/'pants-style2.patch').write_text(''.join(difflib.unified_diff(s.splitlines(keepends=True),changed.splitlines(keepends=True),fromfile='a/game/web/actor-sprite.js',tofile='b/game/web/actor-sprite.js')))
# Candidate uses the live native data through absolute imports, only inside QA.
for module in ['actor-atlas-data.js','actor-custom-data.js','actor-hair-data.js','action-effects.js']:
 changed=changed.replace("'./"+module+"'",repr((ROOT/'game/web'/module).as_uri()))
(out/'candidate.mjs').write_text(changed)
(out/'patch-base-sha256.txt').write_text(hashlib.sha256(p.read_bytes()).hexdigest()+'\n')
print(out/'pants-style2.patch')
import re

def imports(text,overrides):
 def replacement(m):
  rel=m.group(2)
  target=overrides.get(rel,(ROOT/'game/web'/rel).resolve().as_uri())
  return 'from '+repr(target)
 return re.sub(r"from (['\"])(\./[^'\"]+)\1",replacement,text)

for name,text in [('before',s),('after',s.replace(old,new))]:
 sprite=out/(name+'-sprite.mjs');sprite.write_text(imports(text,{}))
 actors=out/(name+'-source-actors.mjs');actors.write_text(imports((ROOT/'game/web/source-actors.js').read_text(),{'./actor-sprite.js':sprite.as_uri()}))
 avatar=out/(name+'-avatar.mjs');avatar.write_text(imports((ROOT/'game/web/avatar.js').read_text(),{'./actor-sprite.js':sprite.as_uri(),'./source-actors.js':actors.as_uri()}))

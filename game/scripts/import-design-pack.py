"""Export saved Bziker PNGs without repainting artwork; retain source provenance."""
import hashlib
import json
import shutil
import os
from pathlib import Path
from PIL import Image

SOURCE=Path(os.environ.get('BZIKER_SOURCE_DIR',str(Path(__file__).resolve().parents[1]/'source-reference')))
ROOT=Path(__file__).resolve().parents[1]
manifest=ROOT/'docs/design-source-v17.json'
# Preserve independently registered native subassets and their measurements.
# The source catalogue only enumerates primary artwork; later importers add
# vehicles, road materials and other runtime pieces to the same registry.
assets=json.loads(manifest.read_text()).get('assets',{}) if manifest.is_file() else {}
files={}
missing=[]

def export(path,limit=768,status='saved'):
    source=SOURCE/path
    if not source.is_file():
        missing.append(path)
        return None
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    key=(digest,limit)
    if key not in files:
        image=Image.open(source).convert('RGBA')
        bbox=image.getchannel('A').getbbox() or (0,0,*image.size)
        image=image.crop(bbox)
        scale=min(1,limit/max(image.size))
        if scale<1:image=image.resize(tuple(max(1,round(n*scale)) for n in image.size),Image.Resampling.NEAREST)
        name=f'design-{digest[:20]}-{limit}.png'
        image.save(ROOT/'assets'/name,optimize=True)
        solid=image.getchannel('A').point(lambda a:255 if a>=128 else 0).getbbox() or (0,0,*image.size)
        files[key]={'url':'/assets/'+name,'width':image.width,'height':image.height,'solid_bbox':list(solid),'source':path,'source_sha256':digest,'source_bbox':list(bbox),'status':status,'resampling':'nearest-neighbour'}
    return dict(files[key],source=path,status=status)

def export_texture(item):
    path=item.get('texture')
    if not isinstance(path,str) or not path.lower().endswith('.png'):return
    source=SOURCE/path
    if not source.is_file():missing.append(path);return
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    name=f'design-texture-{digest[:20]}.png'
    # These are authored flat, repeating materials. Keep the entire original
    # PNG byte-for-byte rather than cropping a perspective surface module.
    shutil.copyfile(source,ROOT/'assets'/name)
    with Image.open(source) as image:
        width,height=image.size
        solid=image.convert('RGBA').getchannel('A').point(lambda a:255 if a>=128 else 0).getbbox() or (0,0,width,height)
    identifier=item['id']+'-texture'
    assets[identifier]={'url':'/assets/'+name,'width':width,'height':height,
        'source':path,'source_sha256':digest,'source_bbox':[0,0,width,height],
        'solid_bbox':list(solid),'status':item.get('status','saved'),
        'resampling':'none','native':True,'representation':'flat-texture',
        'texture_for':item['id'],'tile_world_size':[192,192]}
    if item['id'] in assets:assets[item['id']]['texture_asset']=identifier

catalog=json.loads((SOURCE/'каталог.json').read_text())
for item in catalog['assets']:
    path=item.get('primary','')
    if not path.lower().endswith('.png'):continue
    # Cats/dogs have a compact animation importer; location mascots and the
    # approved cashier are independent native environment sprites.
    if item.get('kind') in ('cat','dog'):continue
    limit=1024 if 'Карта_' in path or 'Интерьер/основной' in path else 768
    value=export(path,limit,item.get('status','saved'))
    if value:assets[item['id']]=value
    export_texture(item)

rotations=json.loads((SOURCE/'КАТАЛОГ_МЕБЕЛИ_С_РАКУРСАМИ.json').read_text())
for item in rotations['items']:
    overview=export(item['overview'],512,item.get('review_status','draft'))
    if not overview:continue
    overview['views']={}
    for side,view in item['views'].items():
        artwork=export(view['primary'],512,item.get('review_status','draft'))
        if artwork:overview['views'][side]=artwork
    overview['label']=item['name'];overview['location']=item['location']
    assets[item['id']]=overview

# Original map remains a reference/full-map asset, not a flattened game scene.
for identifier,path,limit in [
 ('city-source-map','01_Окружение/Карта_города/Квадраты_карты/Карта_исходная.png',1536),
 ('welcome-source-sign','09_Интерфейс_игры/11_Вкладки_и_вход/Указатели/Приветственная_вывеска.png',512),
]:
    if (SOURCE/path).is_file():assets[identifier]=export(path,limit,'saved')

data={'version':17,'source_root_name':'Bziker','assets':assets,'files':len(files),'missing':missing,'rules':{'independent_furniture_sides':True,'repainted':False,'lazy_loading':True,'camera_elevation_degrees':20}}
(ROOT/'web/design-data.js').write_text('export const designData='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
(ROOT/'docs/design-source-v17.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'assets':len(assets),'files':len(files),'missing':missing,'bytes':sum((ROOT/v['url'][1:]).stat().st_size for v in files.values())},ensure_ascii=False))

# Extract reusable pieces after updating the full catalog.
import runpy
runpy.run_path(str(ROOT/'scripts/import-city-subassets.py'),run_name='__main__')
runpy.run_path(str(ROOT/'scripts/import-source-vehicles.py'),run_name='__main__')
runpy.run_path(str(ROOT/'scripts/measure-design-bounds.py'),run_name='__main__')

# Report the final merged registry, including its independently authored views.
final=json.loads(manifest.read_text())
urls={record['url'] for asset in final['assets'].values() for record in [asset,*asset.get('views',{}).values()]}
final['files']=len(urls)
(ROOT/'web/design-data.js').write_text('export const designData='+json.dumps(final,ensure_ascii=False,separators=(',',':'))+';\n')
manifest.write_text(json.dumps(final,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'merged_assets':len(final['assets']),'merged_files':len(urls)}))

#!/usr/bin/env python3
"""Read live data; write a small, reproducible location catalogue only."""
import datetime,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'game/web'
read=lambda p:json.loads(p.read_text())
world=read(WEB/'world-map.json');interiors=read(WEB/'interiors-map.json')
assets=json.loads((WEB/'design-data.js').read_text().split('=',1)[1].strip().removesuffix(';'))['assets']
source=ROOT/'materials/Bziker/01_Окружение/Здания'
folders=sorted(p.name for p in source.iterdir() if p.is_dir() and not p.name.startswith('.'))
buildings={b['id']:b for b in world['buildings']}
rooms=[]
for r in interiors['rooms']:
 b=buildings[r['id']];a=assets[b['design']['assetId']]
 rooms.append(dict(runtime_id=r['id'],current_label=r['label'],city_label=b['name'],room_kind=r['kind'],source_family=r.get('source_family'),source_reference=r.get('source_reference'),exterior_asset_id=b['design']['assetId'],exterior_source='materials/Bziker/'+a['source'],exterior_source_folder=a['source'].split('/')[2],door=b['door'],feature_action=r['action']['id'],feature_label=r['action']['label'],props=len(r['props']),seats=len(r['seats']),plan_version=r.get('plan_version'),bounds=r['bounds'],status='runtime room and action binding present; not blanket art approval'))
folder_map=[]
for f in folders:
 public=[r['runtime_id'] for r in rooms if r['exterior_source_folder']==f]
 entry=dict(source_folder=f,public_runtime_ids_using_exterior=public)
 if f=='Строительная_площадка':entry.update(other_runtime_use='unbuilt base-1..base-8 exteriors')
 if f=='Жилые_дома':entry.update(other_runtime_use='30 background city buildings; not 30 enterable public interiors')
 if f=='Клановые_базы':entry.update(other_runtime_use='clan building style references; private base scene is access-controlled')
 folder_map.append(entry)
refs=read(ROOT/'art/references/canonical-run/manifest.json')
for ref in refs['references']:
 ref['sha256_verified']=hashlib.sha256((ROOT/ref['path']).read_bytes()).hexdigest()==ref['sha256']
review=read(ROOT/'verification/location-video-qa/results.json')
result=dict(generated_at_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),profile='В — Владислав',source_files=[dict(path=str(p.relative_to(ROOT)),sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in [WEB/'world-map.json',WEB/'interiors-map.json',WEB/'design-data.js',WEB/'house-catalog.json']],counts=dict(public_rooms=len(rooms),source_building_folders=len(folders),base_plots=len(world['district']['buildings']),background_residential_buildings=len(world['background_buildings']),outdoor_landmarks=len(world['landmarks']),boats=len(world['boats']),shore_fishing_spots=sum(a['action']=='fishing' for a in world['activities']),outdoor_bench_groups=len(world['bench_groups']),outdoor_seats=len(world['benches'])),public_rooms=rooms,source_building_folder_mapping=folder_map,outdoor_landmarks=world['landmarks'],landmark_semantics={'station':'arrival point outside railway public room','welcome':'visible sign, no dedicated interaction','plaza':'outdoor travel point','district':'outdoor clan neighbourhood, not separate map','park':'outdoor travel point and seats/pet actions','dock':'waterfront travel point; boarding requires boat-specific point','archive':'results action alias outside; not a twelfth room','smoking':'designated smoking area, item-based action','fountain':'visible object, no standalone feature action','gazebo':'visible object and approach, no standalone feature action'},base_plots=[dict(id=b['id'],label=b['name'],door=b['door']) for b in world['district']['buildings']],private_base=dict(scene='base',bounds=world['base']['bounds'],entry='clan member or invited guest; constructed building required',construction_minimum_members=world['district']['construction']['minimum_members'],style_catalog=read(WEB/'house-catalog.json')['styles']),water=dict(lake_outline_points=len(world['lake']['outline']),islands=world['lake']['islands'],walkways=world['lake']['walkways'],boats=world['boats'],shore_fishing_spots=[a for a in world['activities'] if a['action']=='fishing'],boat_fishing='existing economy API accepts occupied boat spot; rod required'),smoking=world['smoking'],outdoor_activities=world['activities'],label_mismatches=[dict(runtime_id='messages',current_label='Кафе БЗИКЕР',source_name='Бар «Пивковый туз»',renamed_in_code=False),dict(runtime_id='arena',current_label='Зал «Своей игры»',source_name='ТЦ «Бзик хаб» exterior and hub interior'),dict(runtime_id='results',current_label='Галерея результатов',source_name='Клановая база: Каменный особняк exterior; hub interior')],animation_canon=refs,video_qa=dict(selected_clips=review,full_decode_frames=sum(r['decoded_video_frames'] for r in review),storyboard_samples=sum(round(float(r['probe']['format']['duration'])*2) for r in review),storyboard_pages=sum(len(r['storyboard_pages']) for r in review),candidate_list='verification/location-video-paths.json',location_candidates_in_list=len(read(ROOT/'verification/location-video-paths.json')),main_user_video_unidentified=True,all_library_videos_visually_reviewed=False,scope='Three clips only, full video decode; complete storyboard sheets at 0.5 seconds; not real-time playback or every-frame visual review'),limits=['Reference copies do not create interactive features','No new artwork, game changes, browser session or physical-device review in this catalogue task','Existing draft art is not promoted to approved','No dedicated city tour identified among the inspected overview/candidate lists; not an exhaustive claim about all video contents'])
assert len(rooms)==11 and len(folders)==10
assert {r['runtime_id'] for r in rooms}==set(buildings)
assert all((ROOT/r['exterior_source']).exists() for r in rooms)
assert all(r['sha256_verified'] for r in refs['references'])
(ROOT/'verification/location-catalog.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result['counts'],ensure_ascii=False))

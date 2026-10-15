import os
from pathlib import Path
import json,hashlib,shutil,copy
root=Path(__file__).resolve().parents[1]
source=Path(os.environ.get('BZIKER_SOURCE_DIR',str(Path(__file__).resolve().parents[1]/'source-reference')))
D=json.loads((root/'web/interiors-map.json').read_text())
scenes={
 'station':('station-interior','ЖД_вокзал',True),
 'casino':('casino-interior','Казино',True),
 'clothing':('clothing-shop-interior','Магазин_одежды',True),
 'bar':('bar-pivkovy-tuz-interior','Бар_Пивковый_туз',False),
 'hub':('bzik-hub-interior','ТЦ_Бзик_хаб',True),
}
meta={}
for key,(aid,b,baked) in scenes.items():
 rel=Path('01_Окружение/Здания')/b/'Интерьер/основной.png'; f=source/rel; sha=hashlib.sha256(f.read_bytes()).hexdigest(); name=f'design-exact-interior-{sha[:20]}.png';shutil.copyfile(f,root/'assets'/name)
 meta[key]={'asset_id':aid,'url':'/assets/'+name,'source_file':str(rel),'sha256':sha,'native_size':[1536,1024],'scale':.5,'baked_staff':baked,'import':'byte-for-byte; no crop, recolour, resampling or rearrangement','source_status':'approved' if key=='station' else 'draft'}
# All geometry below is annotated on the current full-scene source pixels.
# It describes physical supports, never a new arrangement of furniture.
def box(x,y,w,h):return {'x':x*.5,'y':y*.5,'width':w*.5,'height':h*.5}
def rectpoly(b):
 x,y,w,h=b;return [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]
def prop(i,t,b,foot=None,poly=None,**more):
 return {'id':i,'type':t,**box(*(foot or b)),'solid':True,'color':'#b9b4a9','source_pixel_bbox':b,'occlusion_polygons':[poly or rectpoly(b)],**more}
def obstacle(i,x,y,w,h):return prop(i,'wall',[x,y,w,h],solid=True,structural=True,occlusion_polygons=[])
def seat(props,seats,pid,x,y,approach,facing='down',table=None):
 p=next(p for p in props if p['id']==pid);group=p.get('seat_group') or pid;p['seat_group']=group
 seats.append({'id':pid,'group_id':group,'prop_id':pid,**{k:p[k] for k in ['x','y','width','height']},'seat':{'x':x*.5,'y':y*.5},'approach':{'x':approach[0]*.5,'y':approach[1]*.5},'facing':facing,**({'table_id':table} if table else {})})
def sidewalls(props,lefttop,righttop,leftbottom,rightbottom,top,bottom):
 # Eight horizontal physical strips follow the authored perspective walls.
 for n in range(8):
  y=top+(bottom-top)*n/8;h=(bottom-top)/8
  left=lefttop+(leftbottom-lefttop)*n/8;right=righttop+(rightbottom-righttop)*n/8
  props.extend([obstacle('source-wall-left-'+str(n),0,y,left,h),obstacle('source-wall-right-'+str(n),right,y,1536-right,h)])

def layout(key):
 p=[];s=[]
 if key=='station':
  p=[prop('service','cashier',[210,295,400,294],[214,546,396,42]),prop('platform-door','door',[955,358,365,227],[955,562,365,22],occlusion_polygons=[]),prop('plant-left','plant',[144,487,84,162],[148,608,74,40]),prop('plant-right','plant',[1290,488,90,160],[1295,608,80,40]),prop('sofa-1','sofa',[250,673,312,139],[250,746,312,44],seat_group='bench-1'),prop('sofa-2','sofa',[811,673,305,140],[811,746,305,44],seat_group='bench-2'),prop('bin','bin',[178,707,75,109],[184,770,64,42]),prop('luggage','luggage',[1120,690,69,141],[1120,785,69,42]),prop('terminal','kiosk',[1371,596,100,220],[1380,775,78,40])]
  for group,xs in [(1,[314,412,509]),(2,[863,966,1065])]:
   for n,x in enumerate(xs):
    # Native three-seat sections remain one physical object.
    p0=next(q for q in p if q['id']=='sofa-'+str(group));s.append({'id':f'interior:railway:bench-{group}:seat-{n+1}','group_id':f'interior:railway:bench-{group}','prop_id':p0['id'],**{k:p0[k] for k in ['x','y','width','height']},'seat':{'x':x*.5,'y':395},'approach':{'x':x*.5,'y':426},'facing':'down'})
  sidewalls(p,180,1354,28,1510,556,880)
  return p,s,{'left':14,'right':755,'top':278,'bottom':440},{'x':384,'y':419},{'x':384,'y':423},[414,650]
 if key=='clothing':
  p=[prop('service','cashier',[316,312,329,210],[315,481,326,39]),prop('plant-left','plant',[260,334,64,148],[263,444,61,39]),prop('plant-middle','plant',[673,335,65,149],[677,445,60,39]),prop('rack-1','rack',[110,545,259,255],[110,746,259,54]),prop('rack-2','rack',[449,545,247,259],[449,750,247,54]),prop('shoe-shelf-1','shelf',[1048,566,181,243],[1048,752,181,57]),prop('shoe-shelf-2','shelf',[1254,559,175,250],[1254,752,175,57]),prop('fitting-1','fitting',[839,291,172,214],[839,463,172,42]),prop('fitting-2','fitting',[1014,291,173,214],[1014,463,173,42]),prop('mirror','mirror',[1205,319,108,214],[1208,499,102,34])]
  sidewalls(p,205,1327,48,1488,470,850)
  p += [obstacle('source-rim-left',25,850,565,94),obstacle('source-rim-right',965,850,546,94)]
  return p,s,{'left':14,'right':754,'top':235,'bottom':471},{'x':384,'y':415},{'x':384,'y':450},[484,580]
 if key=='casino':
  p=[prop('service','cashier',[256,256,259,221],[260,421,250,53]),prop('slot-0','slot',[665,311,92,147],[666,404,88,52]),prop('slot-1','slot',[776,311,92,148],[777,404,88,52]),prop('guest-service','bar',[1028,378,251,116],[1034,444,238,50]),prop('plant','plant',[1296,350,72,129],[1298,440,68,39]),prop('roulette','roulette-table',[219,597,420,153],[229,663,400,75]),prop('poker-one','poker-table',[904,605,405,150],[914,670,385,75],category='poker')]
  for table,xs in [('roulette',[317,433,552]),('poker-one',[988,1104,1217])]:
   for n,x in enumerate(xs):
    rear=f'{table}:north-{n+1}';front=f'{table}:south-{n+1}'
    p.append(prop(rear,'chair',[x-35,562,67,101],[x-28,573,56,32],facing='down',table_id=table,seat_group=table))
    seat(p,s,rear,x,605,(x,539),'down',table)
    p.append(prop(front,'chair',[x-53,686,95,105],[x-40,736,78,46],facing='up',table_id=table,seat_group=table))
    seat(p,s,front,x,782,(x,844),'up',table)
  for n,x in enumerate([710,819]):
   i='slots:seat-'+str(n+1);p.append(prop(i,'chair',[x-35,414,66,74],[x-26,462,52,22],facing='up',seat_group='slots'));seat(p,s,i,x,484,(x,550),'up')
  for n,x in enumerate([1098,1213]):
   i='bar:seat-'+str(n+1);p.append(prop(i,'chair',[x-28,432,57,73],[x-23,480,46,23],facing='up',seat_group='bar'));seat(p,s,i,x,503,((960,527) if n==0 else (1304,527)),'up')
  sidewalls(p,184,1350,29,1510,452,872)
  return p,s,{'left':14,'right':755,'top':224,'bottom':436},{'x':105,'y':270},{'x':88,'y':307},[386,532]
 if key=='bar':
  p=[prop('service','bar',[175,403,593,205],[180,498,584,105]),prop('table-1','table',[442,657,139,164],[456,738,111,79]),prop('table-2','table',[826,657,133,165],[839,741,108,80]),prop('table-3','table',[995,425,139,151],[1009,500,111,74])]
  for n,x in enumerate([320,475,628]):
   i='bar-stool-'+str(n+1);p.append(prop(i,'chair',[x-40,518,81,131],[x-31,610,62,38],seat_group='bar'));seat(p,s,i,x,648,(x,710),'up')
  for table,pairs in [('table-1',[(414,818,352,818,'right'),(606,818,668,818,'left')]),('table-2',[(796,818,734,818,'right'),(991,818,1053,818,'left')]),('table-3',[(973,574,905,574,'right'),(1162,574,1224,574,'left')])]:
   for n,(x,y,ax,ay,face) in enumerate(pairs):
    i=f'{table}:chair-{n+1}';p.append(prop(i,'chair',[x-47,y-167,88,168],[x-33,y-47,65,47],facing=face,table_id=table,seat_group=table));seat(p,s,i,x,y,(ax,ay),face,table)
  sidewalls(p,219,1248,115,1439,470,846)
  return p,s,{'left':45,'right':744,'top':228,'bottom':424},{'x':635,'y':362},{'x':650,'y':360},[560,660]
 if key=='hub':
  p=[prop('service','trophy',[594,294,332,301],[597,546,328,51]),prop('battle-blue','display-case',[259,358,268,218],[252,513,280,63]),prop('battle-violet','display-case',[1018,346,260,233],[1016,515,262,65])]
  for n,(x,y,w,h) in enumerate([(50,555,83,81),(155,488,55,98),(218,488,54,95),(535,441,55,122),(945,442,53,123),(1281,489,58,108),(1350,493,57,109),(1399,559,61,87),(428,807,59,111)]):p.append(prop(f'plant-{n}','plant',[x,y,w,h],[x,y+h-31,w,31]))
  sidewalls(p,199,1330,108,1425,590,740)
  p += [obstacle('source-front-left',0,852,592,110),obstacle('source-front-right',980,852,556,110)]
  return p,s,{'left':32,'right':736,'top':294,'bottom':475},{'x':384,'y':416},{'x':384,'y':450},[768,645.12]

mapping={'railway':'station','casino':'casino','shop-clothes':'clothing','profile':'clothing','messages':'bar','terrace':'bar','shop-food':'bar','shop-furniture':'bar','arena':'hub','results':'hub','clans':'hub'}
for r in D['rooms']:
 key=mapping[r['id']];p,s,b,spawn,exit,action=layout(key)
 primary=r['id'] in ['railway','casino','shop-clothes','messages','arena']
 r.update(width=768,height=512,bounds=b,spawn=spawn,exit=exit,exact_source=True,source_scene={**meta[key],'reused':not primary,'binding':'native-source-coordinate-annotations'},props=p,seats=s,cutouts=[],zones=[],layout_version=19,visual_version=19)
 r['action'].update(x=action[0]*.5,y=action[1]*.5,prop_id='service',radius=70)
 service=next(q for q in p if q['id']=='service');r['counter']={'prop_id':'service',**{k:service[k] for k in ['x','y','width','height']}}
 r['staff']={'x':r['action']['x'],'y':service['y']-25,'facing':'down','baked':meta[key]['baked_staff']}
 for q in p:
  if q.get('seat_group'):q['seat_group']=f"interior:{r['id']}:{q['seat_group']}"
 for q in s:
  if not q['id'].startswith('interior:'):q['id']=f"interior:{r['id']}:{q['id']}"
  q['group_id']=f"interior:{r['id']}:{q['group_id']}" if not q['group_id'].startswith('interior:') else q['group_id'].replace('railway',r['id'])
 r['solids']=[{'prop_id':q['id'],**{k:q[k] for k in ['x','y','width','height']}} for q in p if q['solid']]
D['schema_version']=19
for r in D['rooms']:
 key=mapping[r['id']]
 foreground={'station':[[[5,861],[1530,861],[1530,900],[5,900]]],'clothing':[[[16,854],[550,854],[550,916],[16,916]],[[984,854],[1518,854],[1518,916],[984,916]]],'casino':[[[5,873],[1530,873],[1530,910],[5,910]]],'bar':[], 'hub':[[[21,671],[75,688],[181,767],[443,823],[475,807],[528,805],[569,951],[475,953],[185,882],[48,803],[16,758]],[[966,795],[1010,807],[1290,755],[1452,654],[1506,684],[1514,775],[1343,882],[1054,954],[979,956]]]}[key]
 r['source_scene']['foreground_polygons']=foreground
(root/'web/interiors-map.json').write_text(json.dumps(D,ensure_ascii=False,indent=2)+'\n')
(root/'docs/source-design-v19/exact-interior-scenes.json').write_text(json.dumps({'source_root':str(source),'scenes':meta,'room_mapping':mapping},ensure_ascii=False,indent=2)+'\n')

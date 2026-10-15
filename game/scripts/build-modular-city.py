"""Build an interactive city from independent native object PNGs.

The reference map supplies neighbourhood composition only. No reference pixel,
scene crop, or foreground mask is loaded. Six retained standalone supplemental
objects may fill documented gaps in the native folder; no new art is generated.
Every upright image and physical support is an explicit scene instance.
"""
import builtins, copy, hashlib, heapq, json, math, random
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1];WEB=ROOT/'web';S=5;P=8
# Artwork and physical traffic widths retain their native human scale. Only
# neighbourhood coordinates expand to make room for full-size housing.
WORLD_WIDTH=1536*P;WORLD_HEIGHT=1024*P
source22=json.loads((WEB/'world-landmarks-v22.json').read_text())
snapshot=WEB/'world-layout-v19.json'
if not snapshot.exists():
 current=json.loads((WEB/'world-map.json').read_text())
 if current['schema_version']!=19:raise ValueError('The v19 migration snapshot must be preserved first')
 snapshot.write_text(json.dumps(current,ensure_ascii=False,indent=2)+'\n')
previous=json.loads(snapshot.read_text());m=copy.deepcopy(previous)
landmarks20=WEB/'world-landmarks-v20.json'
if not landmarks20.exists():
 current=json.loads((WEB/'world-map.json').read_text())
 if current['schema_version']!=20:raise ValueError('Preserve city20 landmarks before rebuilding21')
 landmarks20.write_text(json.dumps({'schema_version':20,'landmarks':current['landmarks']},ensure_ascii=False,indent=2)+'\n')
landmarks21=WEB/'world-landmarks-v21.json'
if not landmarks21.exists():
 current=json.loads((WEB/'world-map.json').read_text())
 if current['schema_version']!=21:raise ValueError('Preserve city21 landmarks before rebuilding22')
 landmarks21.write_text(json.dumps({'schema_version':21,'landmarks':current['landmarks']},ensure_ascii=False,indent=2)+'\n')
assets=json.loads((ROOT/'docs/design-source-v17.json').read_text())['assets']
for supplemental in json.loads((ROOT/'assets/generated-environment-v17-manifest.json').read_text())['assets']:
 box=supplemental['contentBounds'];assets.setdefault(supplemental['id'],{**supplemental,'solid_bbox':[box['x'],box['y'],box['x']+box['w'],box['y']+box['h']]})
xy=lambda x,y:{'x':round(x*P),'y':round(y*P)}
rect=lambda x,y,w,h:{'x':round(x*P),'y':round(y*P),'width':round(w*S),'height':round(h*S)}
area_rect=lambda x,y,w,h:{'x':round(x*P),'y':round(y*P),'width':round(w*P),'height':round(h*P)}
def support_rect(cx,bottom,w,h):
 return {'x':round(cx*P-w*S/2),'y':round(bottom*P-h*S),'width':round(w*S),'height':round(h*S)}
def design(asset,x,y,w,direction='front',anchorX=.5,anchorY=1):
 a=assets[asset].get('views',{}).get(direction,assets[asset]);box=a['solid_bbox'];ratio=(box[3]-box[1])/(box[2]-box[0])
 return {'assetId':asset,**xy(x,y),'width':round(w*S),'height':round(round(w*S)*ratio,6),'anchorX':anchorX,'anchorY':anchorY,'crop':'solid','direction':direction,'baked_scene':False}
def bounds(d):return {'x':d['x']-d['width']*d['anchorX'],'y':d['y']-d['height']*d['anchorY'],'width':d['width'],'height':d['height']}
def overlap(a,b,pad=0):return a['x']<b['x']+b['width']+pad and a['x']+a['width']>b['x']-pad and a['y']<b['y']+b['height']+pad and a['y']+a['height']>b['y']-pad
def project(p,a,b):
 dx=b[0]-a[0];dy=b[1]-a[1];t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy or 1)))
 q=[a[0]+dx*t,a[1]+dy*t];return math.dist(p,q),q
def boxdistance(a,b,r):
 lo,hi=0.,1.
 for k,key,span in [(0,'x','width'),(1,'y','height')]:
  delta=b[k]-a[k]
  if not delta:
   if a[k]<r[key]or a[k]>r[key]+r[span]:lo=2;break
  else:
   u,v=(r[key]-a[k])/delta,(r[key]+r[span]-a[k])/delta;lo=max(lo,min(u,v));hi=min(hi,max(u,v))
 if lo<=hi:return 0
 def dist(p):return math.hypot(max(r['x']-p[0],0,p[0]-r['x']-r['width']),max(r['y']-p[1],0,p[1]-r['y']-r['height']))
 corners=[[r['x'],r['y']],[r['x']+r['width'],r['y']],[r['x'],r['y']+r['height']],[r['x']+r['width'],r['y']+r['height']]]
 return min(dist(a),dist(b),*(project(p,a,b)[0]for p in corners))
def pointpoly(x,y,poly):
 inside=False
 for i,a in enumerate(poly):
  b=poly[i-1]
  if(a[1]>y)!=(b[1]>y)and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:inside=not inside
 return inside

m.update(schema_version=23,width=WORLD_WIDTH,height=WORLD_HEIGHT,walkable={'left':20,'right':WORLD_WIDTH-20,'top':20,'bottom':WORLD_HEIGHT-20})
m['previous_landmarks_v19']=copy.deepcopy(previous['landmarks'])
m['previous_landmarks_v20']=json.loads(landmarks20.read_text())['landmarks']
m['previous_landmarks_v21']=json.loads(landmarks21.read_text())['landmarks']
m['previous_landmarks_v22']=copy.deepcopy(source22['landmarks'])
m['design_source']={'version':17,'composition_revision':23,'scene_mode':'modular-independent-assets','modular_scene':True,'exact_scene':False,'native_size':[1536,1024],'scale':S,'layout_scale':P,'previous_layout_scale':S,'reference_file':'01_Окружение/Карта_города/Квадраты_карты/Карта_исходная.png','reference_sha256':'70dd7a15e86a16f486c7a181200607cb4b96ab5e63a3914b6af57d5864beb179','live_background_asset':None,'geometry_policy':'one-instance-one-ground-support','sidewalk_width':60,'physical_welcome_sign_only':True}
m['scene_objects']=[];m['solids']=[];m['background_buildings']=[];m['bench_groups']=[];m['benches']=[];m['activities']=[]
m['decor']={'trees':[],'lamps':[],'street_details':[],'plaza':rect(661,401,126,66),'crosswalks':[]}
m['architecture']={'version':23,'frontages':[],'districts':[{'id':'park',**area_rect(555,172,345,305)},{'id':'clan-quarter',**area_rect(20,50,515,570)},{'id':'shopping-quarter',**area_rect(390,677,805,291)}],'block_paving':[],'bike_racks':[],'props':[]}
m['design_areas']=[]
l=copy.deepcopy(json.loads((WEB/'world-layout-v18.json').read_text())['lake']);l.pop('exact_scene',None)
# Water geometry remains authored, while the live water is animated native
# texture and independently placed shoreline objects, not the full lake scene.
for key in ['x','y','radius_x','radius_y']:
 l[key]*=P/S
for point in l['outline']:
 point[0]*=P/S;point[1]*=P/S
for island in l['islands']:
 for key in ['x','y','radius_x','radius_y']:island[key]*=P/S
l['walkways']=[{'id':'island-bridge','points':[[1237*P,611*P],[1148*P,549*P]],'width':70}];m['lake']=l
lake_bbox=(min(p[0]for p in l['outline']),min(p[1]for p in l['outline']),max(p[0]for p in l['outline']),max(p[1]for p in l['outline']))
def inwater(x,y,pad=0):
 if x<lake_bbox[0]-pad or x>lake_bbox[2]+pad or y<lake_bbox[1]-pad or y>lake_bbox[3]+pad:return False
 if any(project([x,y],a,b)[0]<=r['width']/2-pad for r in l['walkways']for a,b in zip(r['points'],r['points'][1:])):return False
 if any(((x-i['x'])/max(1,i['radius_x']-pad))**2+((y-i['y'])/max(1,i['radius_y']-pad))**2<1 for i in l['islands']):return False
 return pointpoly(x,y,l['outline'])or(pad>0 and any(project([x,y],a,l['outline'][i-1])[0]<pad for i,a in enumerate(l['outline'])))

def road(id,points,width=160,kind='road'):
 return {'id':id,'points':[[max(34,min(WORLD_WIDTH-34,round(x*P))),max(34,min(WORLD_HEIGHT-34,round(y*P)))]for x,y in points],'width':width,'kind':kind}
m['roads']=[
 road('avenue',[(-25,307),(485,449),(855,565),(900,640),(950,740),(1380,850),(1536,801)],160),
 road('shopping-avenue',[(-25,484),(605,699),(1280,930),(1536,1018)],280),
 road('south-avenue',[(-25,782),(654,1018)],150),
 road('west-boulevard',[(612,-15),(540,260),(450,615),(300,1024)],170),
 road('clan-west',[(124,-15),(42,222),(-25,420)],150),
 road('clan-middle',[(285,-15),(285,240),(190,560),(100,800),(25,1024)],145),
 road('east-boulevard',[(1320,-15),(1237,294),(1379,390),(1380,630),(1280,930),(1245,1024)],160),
 road('north-link',[(48,200),(285,200),(470,200),(562,200)],145),
 road('east-link',[(1280,930),(1510,1009)],145),
 road('north-residential-link',[(587,90),(790,90),(1080,70),(1301,70)],280),
 road('south-residential-link',[(620,1006),(870,980),(1100,980),(1340,950)],280),
 road('park-loop',[(637,226),(737,231),(845,291),(878,358),(847,414),(737,458),(630,415),(582,336),(601,262),(637,226)],65,'walkway'),
 road('park-centre',[(737,231),(760,330),(760,410),(737,458)],60,'walkway'),
 road('station-promenade',[(601,262),(819,316),(965,321),(1176,332),(1288,356)],75,'walkway'),
 road('lake-ring',[(958,326),(1047,322),(1184,338),(1288,381),(1360,481),(1372,609),(1273,716),(1150,751),(1013,716),(934,649),(878,552),(884,437),(958,326)],65,'walkway'),
]
for r in m['roads']:
 if r['kind']=='road':r.update(width=280,sidewalk_width=60)
mainsegments=[(a,b,r)for r in m['roads']if r['kind']=='road'for a,b in zip(r['points'],r['points'][1:])]
streetsegments=[(a,b,r)for r in m['roads']for a,b in zip(r['points'],r['points'][1:])]
rail_placement_reservation=area_rect(732,132,555,45)
def roadclear(r,extra=0):return not any(boxdistance(a,b,r)<q['width']/2+(60 if q['kind']=='road'else q.get('sidewalk_width',18))+extra for a,b,q in streetsegments)
# Parking is an authored ground parcel. One bay fits one human-scale vehicle;
# the old complete ten-space PNG is never shrunk or stretched to make a yard.
parking_reservations=[];driveway_reservations=[];parking_drafts=[]
def parking_candidate(cx,bottom,rows=3,banks=2):
 height=48+120*rows;width=48+240*banks+180;r={'x':round(cx*P)-width/2,'y':round(bottom*P)-height,'width':width,'height':height}
 if r['x']<34 or r['y']<34 or r['x']+r['width']>WORLD_WIDTH-34 or r['y']+r['height']>WORLD_HEIGHT-34:return None
 if not roadclear(r,8)or overlap(r,rail_placement_reservation,20)or any(overlap(r,p,40)for p in parking_reservations):return None
 if any(overlap(r,d,8)for d in m['architecture']['districts']if d['id']=='park'):return None
 if any(overlap(r,v,32)for v in visuals+reserved_parcel_visuals):return None
 if any(overlap(r,v,15)for v in reserved_aprons):return None
 if any(overlap(r,{'x':b['door']['x']-70,'y':b['design']['doorTarget']['y'],'width':140,'height':150},15)for b in allbuildings):return None
 if any(inwater(x,y,10)for x in [r['x']+i*r['width']/12 for i in range(13)]for y in [r['y']+i*r['height']/9 for i in range(10)]):return None
 choices=[]
 for edge,sign in [('bottom',1),('top',-1)]:
  entry=[r['x']+354,r['y']+(height if edge=='bottom'else 0)]
  for a,b,q in mainsegments:
   for reach in [0,120,240]:
    search=[entry[0],entry[1]+sign*reach]
    dist,centre=project(search,a,b)
    if dist<q['width']/2+70 or dist>820:continue
    length=math.dist(a,b);vx=-(b[1]-a[1])/length;vy=(b[0]-a[0])/length
    side=1 if (entry[0]-centre[0])*vx+(entry[1]-centre[1])*vy>0 else -1;vx*=side;vy*=side
    end=[centre[0]+vx*(q['width']/2-2),centre[1]+vy*(q['width']/2-2)]
    # The floor is geometry, so its mouth may face the nearest street. Native
    # cars remain upright genuine left/right views in horizontal parking bays.
    if sign*(end[1]-entry[1])<110:continue
    landing=[entry[0],entry[1]+sign*110]
    # Keep the first section square to the parking mouth. Even a shallow
    # diagonal can paint one raster pixel onto a curb at its entrance.
    path=[entry,end]if abs(end[0]-entry[0])<.01 else[entry,landing,end]
    path_length=sum(math.dist(aa,bb)for aa,bb in zip(path,path[1:]))
    if path_length>=650:continue
    if any(p[0]<110 or p[1]<110 or p[0]>WORLD_WIDTH-110 or p[1]>WORLD_HEIGHT-110 for p in path):continue
    if any(boxdistance(aa,bb,r)<90 and aa is not entry for aa,bb in zip(path,path[1:])):continue
    if any(any(boxdistance(aa,bb,old)<94 for old in parking_reservations)for aa,bb in zip(path,path[1:])):continue
    if any(overlap({'x':min(aa[0],bb[0])-90,'y':min(aa[1],bb[1])-90,'width':abs(aa[0]-bb[0])+180,'height':abs(aa[1]-bb[1])+180},old,10)for aa,bb in zip(path,path[1:])for old in driveway_reservations):continue
    if any(boxdistance(aa,bb,v)<104 for aa,bb in zip(path,path[1:])for v in visuals+reserved_parcel_visuals):continue
    if any(boxdistance(aa,bb,v)<100 for aa,bb in zip(path,path[1:])for v in reserved_aprons):continue
    if any(boxdistance(aa,bb,rail_placement_reservation)<98 for aa,bb in zip(path,path[1:])):continue
    if any(inwater(aa[0]+(bb[0]-aa[0])*j/50,aa[1]+(bb[1]-aa[1])*j/50,90)for aa,bb in zip(path,path[1:])for j in range(51)):continue
    choices.append((path_length,path,q['id'],edge,entry))
 if not choices:return None
 _,path,rid,edge,entry=min(choices,key=lambda c:c[0]);return r,entry,path,rid,rows,banks,edge
def add_parking_parcels():
 global streetsegments
 seeds=[(420,145),(263,785),(1425,110),(370,350),(700,960),(1450,318),(168,382),(365,680),(910,700),(960,122),(1168,968),(1460,595),(1160,90),(1460,750)]
 seeds += [(x,y)for y in range(100,1000,140)for x in range(100,1500,140)]
 for cx,bottom in seeds:
  if len(parking_drafts)>=12:break
  found=None
  for banks,rows in [(2,3),(2,2),(1,3),(1,2)]:
   for radius in [0,8,16,24,32,40,55,70,85,100,120,145,170]:
    offsets=[(0,0)]if radius==0 else[(dx,dy)for dx in range(-radius,radius+1,8)for dy in range(-radius,radius+1,8)if max(abs(dx),abs(dy))>=radius-7]
    for dx,dy in sorted(offsets,key=lambda v:v[0]**2+v[1]**2):
     found=parking_candidate(cx+dx,bottom+dy,rows,banks)
     if found:break
    if found:break
   if found:break
  if not found:
   print('No clear parking block near',cx,bottom,flush=True);continue
  r,entry,path,rid,rows,banks,edge=found;pid=f'parking-block-{len(parking_drafts)+1}'
  parking_reservations.append(r)
  for aa,bb in zip(path,path[1:]):driveway_reservations.append({'x':min(aa[0],bb[0])-90,'y':min(aa[1],bb[1])-90,'width':abs(aa[0]-bb[0])+180,'height':abs(aa[1]-bb[1])+180})
  slots=[{'id':f'{pid}:bay-{col*rows+row+1}','bounds':{'x':r['x']+24+420*col,'y':r['y']+24+120*row,'width':240,'height':120}}for col in range(banks)for row in range(rows)]
  parking_drafts.append({'id':pid,'kind':'parking','parking_layout':'modular',**r,'depth':-1,'footprint':None,'entry':{'point':{'x':entry[0],'y':entry[1]},'width':180,'edge':edge},'driveway_id':f'driveway-{pid}','native_slots':slots,'slots':copy.deepcopy(slots),'ground':{'border':24,'bay_width':240,'bay_height':120,'aisle_width':180,'rows':rows,'banks':banks}})
  m['roads'].append({'id':f'driveway-{pid}','kind':'driveway','parking_id':pid,'width':164,'sidewalk_width':8,'points':path,'connection':{'road_id':rid}})
  print('Parking parcel',pid,round((r['x']+r['width']/2)/P,1),round((r['y']+r['height'])/P,1),'bays',banks*rows,'connection',rid,'drive',round(sum(math.dist(a,b)for a,b in zip(path,path[1:]))),flush=True)
 if len(parking_drafts)<6:raise ValueError(f'Only {len(parking_drafts)} safe compact parking blocks')
 streetsegments=[(a,b,r)for r in m['roads']for a,b in zip(r['points'],r['points'][1:])]

def building(b,cx,bottom,w,asset,direction='front',door_fraction=.5):
 d=design(asset,cx,bottom,w,direction);depth=min(d['height']*.28,round(34*S));fw=d['width']*.87
 footprint={'x':round(d['x']-fw/2),'y':round(d['y']-depth),'width':round(fw),'height':round(depth)}
 b={**b,**footprint,'footprint':dict(footprint),'depth':footprint['y']+footprint['height'],'design':d,'door':{'x':math.floor(d['x']+(door_fraction-.5)*d['width']+.5),'y':d['y']+24}}
 b['design']['doorAnchor']={'x':door_fraction,'y':1};b['design']['doorOffsetY']=24;b['design']['doorTarget']={'x':b['door']['x'],'y':d['y']}
 return b
locations={
 'railway':(1017,308,255,'railway-station',.48),
 'clans':(180,148,135,'clan-base-modern-clubhouse',.465),
 'casino':(605,620,170,'casino-modern',.45),
 'shop-food':(835,681,95,'food-kiosk',.50),
 'shop-clothes':(480,829,160,'clothing-shop',.46),
 'shop-furniture':(655,824,170,'furniture-store',.45),
 'messages':(870,925,175,'bar-pivkovy-tuz',.45),
 'arena':(1090,943,205,'shopping-mall-bzik-hub',.50),
 'profile':(733,670,72,'clothing-shop',.46),
 'results':(210,310,48,'clan-base-stone-mansion',.45),
 'terrace':(1450,401,85,'clan-base-wood-clubhouse',.50),
}
# Keep the reference neighbourhood centres. Move a facade only a few source
# pixels if its ground base crosses a carriageway; images stay upright.
allbuildings=[];visuals=[]
clan_models=[('clan-base-modern-clubhouse',.465),('clan-base-brick-loft',.458),('clan-base-tech-headquarters',.433),('clan-base-wood-clubhouse',.453),('clan-base-stone-mansion',.45),('ordinary-house-red-brick-view-front',.60)]
privatepositions=[(300,520,70),(145,468,55),(387,550,65),(54,75,45),(290,832,55),(70,665,70),(250,970,55),(120,280,50)]
def private_envelopes(q):
 result=[]
 for asset,fraction in clan_models:
  d=design(asset,0,0,q['design']['width']/S);d['x']=q['design']['doorTarget']['x']-(fraction-.5)*d['width'];d['y']=q['design']['doorTarget']['y'];result.append(bounds(d))
 return result
def fit(b,cx,bottom,w,asset,direction='front',door_fraction=.5):
 for radius in [0,8,16,24,32,40,55,70,85,100,120,145,170,200,240,280,320,360,*range(384,1561,24)]:
  offsets=[(0,0)]if not radius else[(dx,dy)for dx in range(-radius,radius+1,8)for dy in range(-radius,radius+1,8)if max(abs(dx),abs(dy))>=radius-7]
  offsets.sort(key=lambda offset:offset[0]**2+offset[1]**2)
  for dx,dy in offsets:
   q=building(b,cx+dx,bottom+dy,w,asset,direction,door_fraction);r=bounds(q['design'])
   if r['x']<15 or r['y']<5 or r['x']+r['width']>m['width']-15 or r['y']+r['height']>m['height']-15:continue
   if q['door']['y']+70>WORLD_HEIGHT-40:continue
   apron={'x':q['door']['x']-100,'y':q['design']['doorTarget']['y'],'width':200,'height':134}
   if any(overlap(apron,p,15)for p in parking_reservations):continue
   if any(overlap(q['footprint'],{'x':z['door']['x']-50,'y':z['door']['y'],'width':100,'height':110},18)for z in allbuildings):continue
   if any(overlap(apron,z['footprint'],18)for z in allbuildings):continue
   if overlap(q['footprint'],rail_placement_reservation,10):continue
   if not roadclear(q['footprint'],5)or not roadclear(r,2):continue
   if b.get('kind')=='apartment'and any(overlap(r,d,24)for d in m['architecture']['districts']if d['id']=='park'):continue
   envelopes=private_envelopes(q)if asset=='construction-site-compact'else[r]
   if any(v['x']<15 or v['y']<5 or v['x']+v['width']>m['width']-15 or(asset=='construction-site-compact'and not roadclear(v,2))or any(overlap(v,a,18)for a in visuals)or any(overlap(v,a,8)for a in parking_reservations)or any(overlap(v,a,8)for a in driveway_reservations)for v in envelopes):continue
   if any(overlap(v,c,32)for v in envelopes for c in reserved_aprons):continue
   nearby=[c for c in court_reservations if math.hypot(max(c['x']-q['door']['x'],0,q['door']['x']-c['x']-468),max(c['y']-q['door']['y'],0,q['door']['y']-c['y']-168))<=500]
   court=min(nearby,key=lambda c:math.dist([q['door']['x'],q['door']['y']],[c['x']+354,c['y']+84]))if nearby else None
   court_exit=court_exits[builtins.id(court)]if court is not None else None
   left=min(v['x']for v in envelopes);right=max(v['x']+v['width']for v in envelopes)
   court_offsets=[(-354,200),(110,60),(-578,60),(-354,240),(110,200),(-578,200)]
   court_offsets.extend([(right+32-q['door']['x'],-120),(left-500-q['door']['x'],-120),(right+32-q['door']['x'],-240),(left-500-q['door']['x'],-240)])
   for ox,oy in court_offsets:
    if court is not None:break
    candidate={'x':q['door']['x']+ox,'y':q['door']['y']+oy,'width':468,'height':168}
    direct=math.hypot(max(candidate['x']-q['door']['x'],0,q['door']['x']-candidate['x']-468),max(candidate['y']-q['door']['y'],0,q['door']['y']-candidate['y']-168))
    if direct>500:continue
    if candidate['x']<110 or candidate['x']+468>WORLD_WIDTH-110 or candidate['y']+168>WORLD_HEIGHT-110:continue
    if not roadclear(candidate,8)or overlap(candidate,rail_placement_reservation,20):continue
    if any(overlap(candidate,v,32)for v in visuals+reserved_aprons+envelopes):continue
    if any(overlap(candidate,d,32)for d in m['architecture']['districts']if d['id']=='park'):continue
    if any(inwater(candidate['x']+i*78,candidate['y']+j*42,20)for i in range(7)for j in range(5)):continue
    for edge,sign in [('bottom',1),('top',-1)]:
     entry=[candidate['x']+354,candidate['y']+(168 if edge=='bottom'else 0)];landing=[entry[0],entry[1]+sign*110]
     if min(project(landing,a,c)[0]for a,c,_ in mainsegments)>590:continue
     exit_rect={'x':entry[0]-98,'y':min(entry[1],landing[1])-98,'width':196,'height':306}
     if exit_rect['x']<20 or exit_rect['x']+196>WORLD_WIDTH-20 or exit_rect['y']<20 or exit_rect['y']+306>WORLD_HEIGHT-20:continue
     if any(boxdistance(entry,landing,v)<98 for v in visuals+reserved_aprons+envelopes+[rail_placement_reservation]):continue
     if any(overlap(exit_rect,d,20)for d in m['architecture']['districts']if d['id']=='park'):continue
     if any(inwater(entry[0],entry[1]+sign*i,98)for i in range(0,111,10)):continue
     court=candidate;court_exit=exit_rect;break
    if court is not None:break
   if court is None:continue
   if any(inwater(x,y,25)for x,y in [[q['x'],q['y']],[q['x']+q['width'],q['y']],[q['x'],q['y']+q['height']],[q['x']+q['width'],q['y']+q['height']]]):continue
   q['parking_court']=court;q['parking_court_exit']=court_exit
   if not any(court is c for c in court_reservations):
    reserved_aprons.extend([court,court_exit]);court_reservations.append(court);court_exits[builtins.id(court)]=court_exit
   allbuildings.append(q);visuals.extend(envelopes);return q
 raise ValueError(f'No modular parcel at reference centre {b["id"]} {(cx,bottom,w)}')
# Preserve the actual accepted v22 addresses and native views. Nearest free
# parcel fitting never silently deletes a dwelling or a clan plot.
reserved_parcel_visuals=[];reserved_aprons=[];court_reservations=[];court_exits={}
public_targets={'results':700,'profile':650,'terrace':675}
locations={b['id']:(b['design']['x']/S,b['design']['y']/S,public_targets.get(b['id'],b['design']['width'])/S,b['design']['assetId'],b['design']['doorAnchor']['x'])for b in source22['buildings']}
privatepositions=[(b['design']['x']/S,b['design']['y']/S,680/S)for b in source22['district_buildings']]
m['buildings']=[fit({k:v for k,v in b.items()if k in ['id','name']},*locations[b['id']][:4],door_fraction=locations[b['id']][4])for b in source22['buildings']]
m['district']['buildings']=[fit({'id':b['id'],'name':b['name']},x,y,w,'construction-site-compact',door_fraction=.533)for b,(x,y,w)in zip(source22['district_buildings'],privatepositions)]
residential_door_fractions={'ordinary-house-grey-panel-view-front':.366,'ordinary-house-red-brick-view-front':.60,'ordinary-house-beige-panel-view-front':.50}
def dwelling_priority(b):
 d=b['design'];target=max(440,min(600,d['width']*1.8));available=0
 for dx in range(-200,201,20):
  for dy in range(-200,201,20):
   q=building({'id':b['id']},d['x']/S+dx,d['y']/S+dy,target/S,d['assetId'],d['direction']);r=bounds(q['design'])
   if r['x']<15 or r['y']<5 or r['x']+r['width']>WORLD_WIDTH-15 or q['door']['y']+70>WORLD_HEIGHT-40:continue
   if not roadclear(r,2)or overlap(r,rail_placement_reservation,10):continue
   if any(overlap(r,a,18)for a in visuals):continue
   if any(overlap(r,a,24)for a in m['architecture']['districts']if a['id']=='park'):continue
   if any(inwater(x,y,25)for x,y in [[r['x'],r['y']],[r['x']+r['width'],r['y']],[r['x'],r['y']+r['height']],[r['x']+r['width'],r['y']+r['height']]]):continue
   available+=1
 return available,-target*d['height']/d['width']
# Fit the fewest-option parcels first, so an unconstrained house cannot occupy
# the only sensible roadside pocket of a tall dwelling near the map edge.
for b in sorted(source22['background_buildings'],key=dwelling_priority):
 d=b['design'];target=max(440,min(600,d['width']*1.8));fraction=residential_door_fractions.get(d['assetId'],d['doorAnchor']['x'])
 q=fit({'id':b['id'],'kind':'apartment'},d['x']/S,d['y']/S,target/S,d['assetId'],d['direction'],fraction)
 m['background_buildings'].append(q)
by_id={b['id']:b for b in m['background_buildings']}
m['background_buildings']=[by_id[b['id']]for b in source22['background_buildings']]
assert {b['id']for b in m['background_buildings']}=={b['id']for b in source22['background_buildings']}
# Parking is packed against the finished facade envelopes, not against a
# hopeful draft that later houses can overlap. Physical bay sizes stay v22.
add_parking_parcels()

obstacles=[b['footprint']for b in allbuildings]
_bucket_count=-1;_buckets={}
def clear(p,pad=14):
 global _bucket_count,_buckets
 x,y=p['x'],p['y']
 if x<20+pad or y<20+pad or x>WORLD_WIDTH-20-pad or y>WORLD_HEIGHT-20-pad or inwater(x,y,pad):return False
 if _bucket_count!=len(obstacles):
  _buckets={}
  for b in obstacles:
   for bx in range(math.floor(b['x']/100),math.floor((b['x']+b['width'])/100)+1):
    for by in range(math.floor(b['y']/100),math.floor((b['y']+b['height'])/100)+1):_buckets.setdefault((bx,by),[]).append(b)
  _bucket_count=len(obstacles)
 return not any(math.hypot(max(b['x']-x,0,x-b['x']-b['width']),max(b['y']-y,0,y-b['y']-b['height']))<pad+1 for bx in range(math.floor((x-pad-1)/100),math.floor((x+pad+1)/100)+1)for by in range(math.floor((y-pad-1)/100),math.floor((y+pad+1)/100)+1)for b in _buckets.get((bx,by),[]))
def safe(p,maxdist=240,pad=14):
 if clear(p,pad):return dict(p)
 for r in range(10,maxdist+1,10):
  for dx,dy in sorted(((dx,dy)for dx in range(-r,r+1,10)for dy in range(-r,r+1,10)if max(abs(dx),abs(dy))==r),key=lambda q:q[0]**2+q[1]**2):
   q={'x':p['x']+dx,'y':p['y']+dy}
   if clear(q,pad):return q
 raise ValueError(f'No clear modular passage at {p}')

def segmentclear(a,b,pad=18):
 n=max(1,math.ceil(math.dist(a,b)/8))
 return all(clear({'x':a[0]+(b[0]-a[0])*i/n,'y':a[1]+(b[1]-a[1])*i/n},pad)for i in range(n+1))
class Navigator:
 """Walk real clear grid edges; preserve exact endpoints before smoothing."""
 step=25
 def __init__(self,paved=False):
  self.free={};self.edges={};self.paved=paved;self.paving_buckets={}
  for r in m['roads']:
   reach=r['width']/2+(r.get('sidewalk_width',60)if r['kind']=='road'else r.get('sidewalk_width',8 if r['kind']=='driveway'else 4))-3
   for a,b in zip(r['points'],r['points'][1:]):
    for bx in range(math.floor((min(a[0],b[0])-reach)/100),math.floor((max(a[0],b[0])+reach)/100)+1):
     for by in range(math.floor((min(a[1],b[1])-reach)/100),math.floor((max(a[1],b[1])+reach)/100)+1):self.paving_buckets.setdefault((bx,by),[]).append((a,b,reach))
 def onpaving(self,p):
  return any(project(p,a,b)[0]<=reach for a,b,reach in self.paving_buckets.get((math.floor(p[0]/100),math.floor(p[1]/100)),[]))or any(b['x']+3<=p[0]<=b['x']+b['width']-3 and b['y']+3<=p[1]<=b['y']+b['height']-3 for b in parking_reservations)
 def segment(self,a,b,pad=18):
  if not segmentclear(a,b,pad):return False
  if not self.paved:return True
  n=max(1,math.ceil(math.dist(a,b)/4));return all(self.onpaving([a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n])for i in range(n+1))
 def point(self,node):return[node[0]*self.step,node[1]*self.step]
 def legal(self,node):
  if node not in self.free:
   p=self.point(node);self.free[node]=clear({'x':p[0],'y':p[1]},20)and(not self.paved or self.onpaving(p))
  return self.free[node]
 def node(self,p):
  x,y=round(p[0]/self.step),round(p[1]/self.step)
  for r in range(5):
   for n in sorted(((x+dx,y+dy)for dx in range(-r,r+1)for dy in range(-r,r+1)if max(abs(dx),abs(dy))==r),key=lambda n:math.dist(self.point(n),p)):
    if self.legal(n)and self.segment(p,self.point(n),18):return n
  raise ValueError(f'No route endpoint near {p}')
 def path(self,start,end):
  if self.segment(start,end):return[start,end]
  origin,target=self.node(start),self.node(end);queue=[(0.,0.,origin)];cost={origin:0.};parents={};steps=[(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)]
  while queue:
   _,score,n=heapq.heappop(queue)
   if score>cost[n]+1e-9:continue
   if n==target:break
   for dx,dy in steps:
    q=(n[0]+dx,n[1]+dy)
    if not self.legal(q):continue
    if dx and dy and(not self.legal((n[0]+dx,n[1]))or not self.legal((n[0],n[1]+dy))):continue
    # Grid cells cannot tunnel through the tight support of a lamp or bin.
    edge=(n,q)
    if edge not in self.edges:
     self.edges[edge]=self.edges[(q,n)]=self.segment(self.point(n),self.point(q),18)
    if not self.edges[edge]:continue
    new=score+(math.sqrt(2)if dx and dy else 1)
    if new*self.step>getattr(self,'max_length',math.inf):continue
    if new>=cost.get(q,math.inf):continue
    cost[q]=new;parents[q]=n;heapq.heappush(queue,(new+math.dist(q,target),new,q))
  else:raise ValueError(f'Unreachable authored target {end} from {start}')
  route=[target]
  while route[-1]!=origin:route.append(parents[route[-1]])
  raw=[start]+[self.point(n)for n in reversed(route)]+[end];smoothed=[raw[0]];i=0
  while i<len(raw)-1:
   j=len(raw)-1
   while j>i+1 and not self.segment(raw[i],raw[j]):j-=1
   if not self.segment(raw[i],raw[j]):raise ValueError(f'Blocked authored route edge {raw[i:j+1]}')
   smoothed.append(raw[j]);i=j
  return smoothed

class DoorstepNavigator(Navigator):
 """Short pedestrian landings follow physical supports, with 24-unit clearance.

 A roof projects above its ground support; a pedestrian may walk behind that
 projection, just as on the existing frontage. Closed parking floors still
 remain obstacles until the final curb-opening pass.
 """
 def grasspark(self,p):
  return any(d['x']<=p[0]<=d['x']+d['width']and d['y']<=p[1]<=d['y']+d['height']for d in m['architecture']['districts']if d['id']=='park')and not self.onpaving(p)
 def segment(self,a,b,pad=24):
  if not super().segment(a,b,24):return False
  n=max(1,math.ceil(math.dist(a,b)/10));return not any(self.grasspark([a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n])for i in range(n+1))
 def legal(self,node):
  p=self.point(node)
  return clear({'x':p[0],'y':p[1]},24)and not self.grasspark(p)
def prop(id,kind,asset,x,y,w,fw=0,fh=0,direction='front',anchorX=.5,anchorY=1,depth=None):
 d=design(asset,x,y,w,direction,anchorX,anchorY);p={'id':id,'kind':kind,**xy(x,y),'design':d}
 if fw and fh:
  p['footprint']=support_rect(x,y,fw,fh);p['depth']=p['footprint']['y']+p['footprint']['height'];obstacles.append(p['footprint'])
 else:p['depth']=-1 if depth is None else depth
 return p

# Small private courtyards supplement the shared blocks. A nearby parking
# space must be near the actual door, not merely reachable on the city graph.
# The connecting vehicle lanes route around complete native facade envelopes.
class CourtyardDriveNavigator(Navigator):
 step=50
 def __init__(self):super().__init__();self.full_obstacles=visuals+parking_reservations+[rail_placement_reservation];self.max_length=1100
 def segment(self,a,b,pad=98):
  if any(boxdistance(a,b,v)<98 for v in self.full_obstacles):return False
  n=max(1,math.ceil(math.dist(a,b)/20))
  return all(110<=a[0]+(b[0]-a[0])*j/n<=WORLD_WIDTH-110 and 110<=a[1]+(b[1]-a[1])*j/n<=WORLD_HEIGHT-110 and not inwater(a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n,98)and not any(d['x']-98<a[0]+(b[0]-a[0])*j/n<d['x']+d['width']+98 and d['y']-98<a[1]+(b[1]-a[1])*j/n<d['y']+d['height']+98 for d in m['architecture']['districts']if d['id']=='park')for j in range(n+1))
 def legal(self,node):
  if node not in self.free:
   p=self.point(node);self.free[node]=self.segment(p,p)
  return self.free[node]

def door_lot_distance(b,r):
 p=b['door'];return math.hypot(max(r['x']-p['x'],0,p['x']-r['x']-r['width']),max(r['y']-p['y'],0,p['y']-r['y']-r['height']))

def add_local_parking():
 global streetsegments
 for b in sorted(allbuildings,key=lambda q:min(door_lot_distance(q,r)for r in parking_reservations),reverse=True):
  if min(door_lot_distance(b,r)for r in parking_reservations)<=500:continue
  door=b['door'];options=[(0,b['parking_court'])]
  for dx in range(-600,601,40):
   for dy in range(-440,561,40):
    r={'x':door['x']-354+dx,'y':door['y']+80+dy,'width':468,'height':168}
    direct=door_lot_distance(b,r)
    if direct>500 or r['x']<110 or r['y']<110 or r['x']+468>WORLD_WIDTH-110 or r['y']+168>WORLD_HEIGHT-110:continue
    if not roadclear(r,8)or overlap(r,rail_placement_reservation,20):continue
    if any(overlap(r,v,32)for v in visuals+parking_reservations):continue
    if any(overlap(r,v,32)for v in reserved_aprons if v is not b['parking_court']and v is not b['parking_court_exit']):continue
    if any(overlap(r,{'x':z['door']['x']-70,'y':z['design']['doorTarget']['y'],'width':140,'height':150},15)for z in allbuildings):continue
    if any(overlap(r,d,32)for d in m['architecture']['districts']if d['id']=='park'):continue
    if any(inwater(r['x']+i*78,r['y']+j*42,20)for i in range(7)for j in range(5)):continue
    options.append((direct+abs(dx)*.08+max(0,-dy)*.08,r))
  selected=None;nav=CourtyardDriveNavigator()
  lane_limit=900 if b['id']in ['terrace','apartment-3']else 650
  links=[(a,c,r)for r in m['roads']if r['kind']in ['road','driveway']for a,c in zip(r['points'],r['points'][1:])]
  for _,r in sorted(options,key=lambda q:q[0])[:36]:
   choices=[]
   for edge,sign in [('bottom',1),('top',-1)]:
    entry=[r['x']+354,r['y']+(168 if edge=='bottom'else 0)];landing=[entry[0],entry[1]+sign*110]
    nav.full_obstacles=visuals+parking_reservations+[rail_placement_reservation]+[c for c in reserved_aprons if c is not b['parking_court']and c is not b['parking_court_exit']]
    if not nav.segment(entry,landing):continue
    nav.full_obstacles=nav.full_obstacles+[r];nav.free={};nav.edges={}
    targets=[]
    for a,c,link in links:
     distance,centre=project(landing,a,c);end=centre
     if distance<80:continue
     targets.append((math.dist(landing,end),end,link))
    for direct,end,link in sorted(targets,key=lambda q:q[0])[:6]:
     if direct+110>=lane_limit:continue
     if choices and direct+110>=min(c[0]for c in choices):continue
     try:path=[entry,*nav.path(landing,end)]
     except ValueError:continue
     # Route the entire width around its own courtyard after the square mouth.
     if any(boxdistance(a,c,r)<94 for a,c in zip(path[1:],path[2:])):continue
     length=sum(math.dist(a,c)for a,c in zip(path,path[1:]))
     if length>=lane_limit:continue
     choices.append((length,path,link['id'],edge,entry))
   if choices:
    selected=r,min(choices,key=lambda q:q[0]);break
  if not selected:
   print('No clear local parking near',b['id'],'direct',round(min(door_lot_distance(b,r)for r in parking_reservations)),flush=True);continue
  r,(_,path,rid,edge,entry)=selected;pid=f'parking-local-{b["id"]}'
  slots=[{'id':f'{pid}:bay-1','bounds':{'x':r['x']+24,'y':r['y']+24,'width':240,'height':120}}]
  owners=[z['id']for z in allbuildings if door_lot_distance(z,r)<=500]
  parking_reservations.append(r);parking_drafts.append({'id':pid,'kind':'parking','parking_layout':'modular',**r,'depth':-1,'footprint':None,'address_id':b['id'],'courtyard_for':owners,'residential_courtyard':True,'entry':{'point':{'x':entry[0],'y':entry[1]},'width':180,'edge':edge},'driveway_id':f'driveway-{pid}','native_slots':slots,'slots':copy.deepcopy(slots),'ground':{'border':24,'bay_width':240,'bay_height':120,'aisle_width':180,'rows':1,'banks':1}})
  m['roads'].append({'id':f'driveway-{pid}','kind':'driveway','parking_id':pid,'width':164,'sidewalk_width':8,'points':path,'connection':{'road_id':rid}})
  streetsegments=[(a,c,r)for r in m['roads']for a,c in zip(r['points'],r['points'][1:])]
  print('Local parking',b['id'],'door distance',round(door_lot_distance(b,r)),'vehicle lane',round(sum(math.dist(a,c)for a,c in zip(path,path[1:]))),flush=True)
add_local_parking()

# Flat parking ground is geometry; only its raised curb and bumpers are solid.
m['scene_objects'].extend(parking_drafts)
for i,lot in enumerate(parking_drafts):
 r=parking_reservations[i];lot['borders']=[];lot['bumpers']=[];rows=lot['ground']['rows'];banks=lot['ground']['banks'];h=r['height'];w=r['width']
 edge=lot['entry']['edge'];closed='top'if edge=='bottom'else'bottom';closed_y=0 if closed=='top'else h-12;opening_y=h-12 if edge=='bottom'else 0
 components=[(f'{closed}-curb',0,closed_y,w,12),('left-curb',0,12,12,h-24),('right-curb',w-12,12,12,h-24),(f'{edge}-curb-left',12,opening_y,252,12),(f'{edge}-curb-right',444,opening_y,w-456,12)]
 components += [(f'bumper-{col}-{row}',26 if col==0 else 667,24+120*row+38,12,44)for col in range(banks)for row in range(rows)]
 for name,x,y,w,h in components:
  foot={'x':r['x']+x,'y':r['y']+y,'width':w,'height':h};component={'id':f'{lot['id']}-{name}',**foot}
  lot['bumpers'if name.startswith('bumper')else'borders'].append(component)
  m['solids'].append({**component,'kind':'parking-component','source_kind':name,'parking_id':lot['id'],'footprint':dict(foot)});obstacles.append(foot)

for id,asset,x,y,w in [('basketball','city-basketball-court',50,965,80),('tennis','city-tennis-court',1490,649,80)]:
 m['scene_objects'].append(prop(id,'court',asset,x,y,w))

# These standalone PNGs fill explicitly documented native-resource gaps.
# They are retained v17 objects, never crops of the reference map.
for id,asset,x,y,w,fw,fh in [('park-fountain','generated-environment-fountain',713,384,70,61,30),('park-gazebo','generated-environment-gazebo',675,269,55,32,16)]:
 p=prop(id,'fountain'if id.endswith('fountain')else'gazebo',asset,x,y,w,fw,fh)
 p['provenance']='retained-v17-standalone-supplemental';m['scene_objects'].append(p)

# The native pack has no independent train/rail/platform resource. Existing
# supplemental objects supply a north rail band without a baked city picture.
# Tile the complete reserved northern corridor, not sparse point samples.
# Uniform scaling preserves native aspect; exact shared edges also work when
# neighbourhood scale P differs from artwork scale S.
rail_count=math.ceil(rail_placement_reservation['width']/(115*S))
rail_width=rail_placement_reservation['width']/rail_count
rail_bottom=rail_placement_reservation['y']+rail_placement_reservation['height']
m['architecture']['rail_corridor']={**rail_placement_reservation,'id':'north-rail-corridor','baseline_y':rail_bottom,'segment_count':rail_count,'segment_width':rail_width}
for i in range(rail_count):
 cx=rail_placement_reservation['x']+(i+.5)*rail_width
 p=prop(f'rail-track-{i+1}','rail','generated-environment-railway-track',cx/P,rail_bottom/P,rail_width/S)
 # Half-pixel centres are intentional for odd-width tiles: rounding one centre
 # up and its neighbour down would reopen a seam.
 p['x']=p['design']['x']=cx
 p['provenance']='retained-v17-standalone-supplemental';m['scene_objects'].append(p)
for i,x in enumerate([v/P for v in range(round(805*P),round(1230*P)-480,515)]):
 d=design('generated-environment-passenger-coach',x,170,103);f=support_rect(x,170,94,17)
 if not roadclear(f,8)or any(overlap(bounds(d),v,10)for v in visuals)or any(overlap(f,{'x':z['door']['x']-80,'y':z['door']['y']-30,'width':160,'height':160},10)for z in allbuildings):continue
 p=prop(f'parked-coach-{i+1}','coach','generated-environment-passenger-coach',x,170,103,94,17)
 p['provenance']='retained-v17-standalone-supplemental';m['scene_objects'].append(p)
for i,x in enumerate([865,1185]):
 d=design('generated-environment-platform-canopy',x,198,95);f=support_rect(x,198,70,6)
 if not roadclear(f,8)or any(overlap(f,o,8)for o in obstacles)or any(overlap(f,{'x':z['door']['x']-80,'y':z['door']['y']-30,'width':160,'height':160},10)for z in allbuildings):continue
 p=prop(f'platform-canopy-{i+1}','canopy','generated-environment-platform-canopy',x,198,95,70,6)
 p['provenance']='retained-v17-standalone-supplemental';m['scene_objects'].append(p)

# Short walks join front steps to a street. This gives each building a coherent
# frontage without drawing a huge disconnected platform behind it.
frontage_nav=Navigator()
for b in allbuildings:
 print('Frontage',b['id'],flush=True)
 door=[b['door']['x'],b['door']['y']];origin=[door[0],door[1]+70];choices=[];destinations=[]
 for a,c,r in mainsegments:
  for slide in [0,-250,250,-500,500,-750,750]:
   dist,q=project([origin[0]+slide,origin[1]],a,c)
   if dist<r['width']/2+40 or dist>2200:continue
   length=math.dist(a,c);vx=-(c[1]-a[1])/length;vy=(c[0]-a[0])/length
   side=1 if (origin[0]-q[0])*vx+(origin[1]-q[1])*vy>0 else -1;vx*=side;vy*=side
   end=[q[0]+vx*(r['width']/2+30),q[1]+vy*(r['width']/2+30)]
   destinations.append((math.dist(door,end),end,r))
   paths_to_try=[[door,origin,end],[door,end],[door,origin,[end[0],origin[1]],end]]
   for path in paths_to_try:
    if len(path)==2 and(end[1]<door[1]+60 or abs(end[0]-door[0])>300):continue
    if any(math.dist(aa,bb)<45 for aa,bb in zip(path,path[1:])):continue
    if not all(segmentclear(aa,bb,20)for aa,bb in zip(path,path[1:])):continue
    choices.append((sum(math.dist(aa,bb)for aa,bb in zip(path,path[1:])),path,r));break
 if not choices:
  for _,end,r in sorted(destinations,key=lambda c:c[0])[:30]:
   try:path=frontage_nav.path(door,end)
   except ValueError:continue
   if len(path)>4 or any(math.dist(aa,bb)<45 for aa,bb in zip(path,path[1:])):continue
   choices.append((sum(math.dist(aa,bb)for aa,bb in zip(path,path[1:])),path,r));break
 if not choices:raise ValueError(f'No clean sidewalk landing for {b["id"]}')
 _,path,r=min(choices,key=lambda z:z[0]);target=b['design']['doorTarget'];frontage={'id':f'frontage-{b["id"]}','building_id':b['id'],'path':path,'width':60,'connection':{'road_id':r['id']},'forecourt':{'x':door[0]-100,'y':target['y'],'width':200,'height':104,'building_id':b['id'],'function':'entrance-apron'}}
 m['architecture']['frontages'].append(frontage);m['roads'].append({'id':f'access-{b["id"]}','kind':'walkway','width':60,'points':path})


protected=[{'x':b['door']['x']-70,'y':b['door']['y']-90,'width':140,'height':200}for b in allbuildings]
paths=[(a,b,r)for r in m['roads']for a,b in zip(r['points'],r['points'][1:])]+[(a,b,{**r,'kind':'walkway'})for r in l['walkways']for a,b in zip(r['points'],r['points'][1:])]
def propclear(r,pad=10):return roadclear(r,3)and pathclear(r,18)and not overlap(r,rail_placement_reservation,8)and not any(overlap(r,o,pad)for o in obstacles)and not any(overlap(r,p,pad)for p in parking_reservations)and not any(overlap(r,z,pad)for z in protected)and not any(inwater(x,y,20)for x,y in [[r['x'],r['y']],[r['x']+r['width'],r['y']+r['height']]])
def pathclear(r,margin=15):return not any(boxdistance(a,b,r)<q['width']/2+(60 if q['kind']=='road' else q.get('sidewalk_width',margin))for a,b,q in paths)

# An individual bench image defines two exact seats, with a clear front exit.
benchpositions=[(645,300),(748,300),(828,331),(788,258),(662,390),(783,422),(887,535),(938,663),(1052,309),(1140,325),(340,219),(274,313),(730,566),(630,888),(865,938),(1165,948)]
for i,(x,y)in enumerate(benchpositions):
 asset=['bench-long-wood','bench-medium-metal','bench-short-backless'][i%3];w=[34,30,27][i%3]
 found=False
 bench_offsets=[(0,0),(0,-12),(0,12),(-12,0),(12,0),(0,-24),(0,24),(-24,0),(24,0),(-24,-24),(24,-24),(-24,24),(24,24)]
 if i in [8,9]:
  # Preserve the station bench ID after enlarging the genuine station facade.
  # Search its nearest dry flank instead of dropping an existing seat.
  for radius in [32,40,55,70,85,100,120]:
   ring=[(dx,dy)for dx in range(-radius,radius+1,8)for dy in range(-radius,radius+1,8)if max(abs(dx),abs(dy))>=radius-7]
   bench_offsets.extend(sorted(ring,key=lambda v:v[0]**2+v[1]**2))
 for dx,dy in bench_offsets:
  xx=x+dx;yy=y+dy;d=design(asset,xx,yy,w);f=support_rect(xx,yy,w*.86,6)
  if propclear(f)and clear(xy(xx,yy+15)):x,y=xx,yy;found=True;break
 if not found:
  if i in [8,9]:raise ValueError(f'Existing city-bench-{i+1} needs a clear station footing')
  continue
 p=prop(f'city-bench-{i+1}','bench',asset,x,y,w,w*.86,6);p.update(width=round(w*S),height=30)
 if 555<x<900 and 172<y<477:p['zone']='park'
 m['bench_groups'].append(p)
 for j in range(2):
  seat={'x':round(p['design']['x']+(-.21 if j==0 else .21)*p['design']['width']),'y':p['design']['y']-2}
  m['benches'].append({'id':f'{p["id"]}:seat-{j+1}','group_id':p['id'],'x':p['x'],'y':p['y'],'width':p['width'],'height':p['height'],'seat':seat,'visual':{'x':seat['x'],'y':p['design']['y']+2},**({'zone':p['zone']}if p.get('zone')else{})})

# Separate native pieces make a compact smoking pocket. Its complete native
# envelope is packed as one unit outside parking, facades and road curbs.
smoking_location=None
smoking_offsets=[(0,0)]
for radius in range(80,1601,80):
 smoking_offsets.extend(sorted(((dx,dy)for dx in range(-radius,radius+1,40)for dy in range(-radius,radius+1,40)if max(abs(dx),abs(dy))==radius),key=lambda q:q[0]**2+q[1]**2))
for dx,dy in smoking_offsets:
 cx,bottom=844*P+dx,508*P+dy
 envelope={'x':cx-170,'y':bottom-128,'width':340,'height':128}
 floor={'x':cx-170,'y':bottom-98,'width':340,'height':98}
 reserve={'x':cx-202,'y':bottom-160,'width':404,'height':200}
 own_supports=[{'x':round(cx-45-67.5),'y':bottom-86,'width':135,'height':30},{'x':cx+100,'y':bottom-50,'width':20,'height':20}]
 if not propclear(envelope,24)or any(overlap(envelope,v,24)for v in visuals):continue
 if any(overlap(envelope,bounds(p['design']),20)for p in m['bench_groups']+m['scene_objects']if p.get('design')and p['kind']not in ['ground','parking','rail']):continue
 if cx<230 or bottom<200 or cx>WORLD_WIDTH-230 or bottom>WORLD_HEIGHT-100:continue
 door=[cx,bottom+28];options=[]
 for a,b,r in mainsegments:
  distance,q=project(door,a,b);length=math.dist(a,b);nx=-(b[1]-a[1])/length;ny=(b[0]-a[0])/length;side=1 if (door[0]-q[0])*nx+(door[1]-q[1])*ny>0 else-1
  end=[q[0]+nx*side*(r['width']/2+30),q[1]+ny*side*(r['width']/2+30)]
  if math.dist(door,end)>650:continue
  if segmentclear(door,end,24)and not any(boxdistance(door,end,v)<24 for v in visuals+parking_reservations)and not any(boxdistance(door,end,v)<25 for v in own_supports):options.append((math.dist(door,end),end,r))
 if not options:continue
 _,end,street=min(options,key=lambda q:q[0]);smoking_location=(cx,bottom,reserve,door,end,street);break
if smoking_location is None:raise ValueError('No separate smoking pocket with a clear street approach')
cx,bottom,reserve,door,end,street=smoking_location
print('Separate smoking pocket',{'x':cx,'y':bottom,'street':street['id']},flush=True)
smoking_path={'id':'access-smoking','kind':'walkway','width':48,'sidewalk_width':4,'points':[door,end],'connection':{'road_id':street['id']}}
m['roads'].append(smoking_path);paths.extend((a,b,smoking_path)for a,b in zip(smoking_path['points'],smoking_path['points'][1:]))
m['smoking'].update(reserve,door={'x':door[0],'y':door[1]},access_path_id='access-smoking');m['smoking'].pop('exact_scene',None);m['smoking'].pop('design',None)
protected.append(reserve)
m['scene_objects'].append(prop('smoking-pad','ground','smoking-area-paved-pad',cx/P,bottom/P,68))
smokebench=prop('smoking-bench','bench','smoking-area-bench',(cx-45)/P,(bottom-56)/P,33,27,6);smokebench.update(width=165,height=30)
m['bench_groups'].append(smokebench)
for j in range(2):m['benches'].append({'id':f'smoking-bench:seat-{j+1}','group_id':'smoking-bench','x':smokebench['x'],'y':smokebench['y'],'width':165,'height':30,'seat':{'x':smokebench['x']+(-35 if j==0 else 35),'y':smokebench['y']-2},'visual':{'x':smokebench['x']+(-35 if j==0 else 35),'y':smokebench['y']+2}})
m['scene_objects'].append(prop('smoking-ashtray','ashtray','smoking-area-ashtray-bin',(cx+110)/P,(bottom-30)/P,7,4,4))

# The park furniture belongs to real paved pockets. Native supports, pad and
# connecting path are authored together; no bench is left isolated in grass.
m['decor']['fixture_pads']=[]
park_links=[r for r in m['roads']if r['id']in ['park-loop','park-centre','station-promenade','lake-ring']]
fixture_nav=Navigator()
for fixture in [p for p in m['bench_groups']if p.get('zone')=='park']+[p for p in m['scene_objects']if p['id']in ['park-fountain','park-gazebo']]:
 print('Park fixture',fixture['id'],flush=True)
 f=fixture['footprint'];start=[f['x']+f['width']/2,f['y']+f['height']+30];choices=[];destinations=[]
 for r in park_links:
  for a,b in zip(r['points'],r['points'][1:]):
   _,end=project(start,a,b)
   destinations.append((math.dist(start,end),end,r))
 for distance,end,r in sorted(destinations,key=lambda q:q[0]):
  if choices and distance>=choices[0][0]:break
  try:path=fixture_nav.path(start,end)
  except ValueError:continue
  choices.append((sum(math.dist(a,b)for a,b in zip(path,path[1:])),path,r))
 if not choices:raise ValueError(f'No park path for {fixture["id"]}')
 _,path,r=min(choices,key=lambda q:q[0]);path_id=f'path-{fixture["id"]}'
 pad={'id':f'pad-{fixture["id"]}','fixture_id':fixture['id'],'function':'park-fixture','x':f['x']-20,'y':f['y']-20,'width':f['width']+40,'height':f['height']+80,'path_id':path_id,'path':path,'connection':{'road_id':r['id']}}
 if any(inwater(x,y,4)for x in [pad['x'],pad['x']+pad['width']]for y in [pad['y'],pad['y']+pad['height']]):raise ValueError(f'Wet park furniture pad {fixture["id"]}')
 m['decor']['fixture_pads'].append(pad);m['roads'].append({'id':path_id,'kind':'walkway','width':40,'points':path})
 paths.extend((a,b,{'kind':'walkway','width':40})for a,b in zip(path,path[1:]))

# Requested crossings lie on different authored streets. The shared topology
# resolves each complete zebra away from carriageway and driveway junctions.
m['decor']['crosswalks']=[{'id':f'crosswalk-request-{i+1}',**xy(x,y),'orientation':orientation}for i,(x,y,orientation)in enumerate([(380,200,'horizontal'),(265,115,'vertical'),(350,425,'horizontal'),(395,760,'horizontal'),(1040,848,'horizontal'),(1380,475,'vertical'),(520,550,'vertical'),(107,615,'horizontal')])]

sign=prop('welcome-sign','sign','welcome-source-sign',906,337,50,38,5)
if not roadclear(sign['footprint'],5):raise ValueError('The native welcome sign crosses a carriageway')
m['scene_objects'].append(sign)
sign['approach']={'x':sign['footprint']['x']+sign['footprint']['width']/2,'y':sign['footprint']['y']+sign['footprint']['height']+24}

landmarkpixels={'station':(1009,319),'plaza':(718,434),'district':(251,311),'park':(706,407),'dock':(1090,347),'archive':(781,542),'smoking':(844,490),'fountain':(713,384)}
m['landmarks']={k:safe(xy(*p))for k,p in landmarkpixels.items()};m['spawn']=dict(m['landmarks']['station']);m['district'].update(width=m['width'],height=m['height'],spawn=dict(m['landmarks']['district']))
m['landmarks']['smoking']=dict(m['smoking']['door'])
m['landmarks']['welcome']=dict(sign['approach'])
if not clear(m['landmarks']['welcome']):raise ValueError('The welcome sign has no clear front landing')
# Reuse the real fixture's authored alley landing, never an independent label.
gazebo=next(p for p in m['scene_objects']if p['id']=='park-gazebo')
gazebo_pad=next(p for p in m['decor']['fixture_pads']if p['fixture_id']==gazebo['id'])
gazebo['approach']=dict(zip(('x','y'),gazebo_pad['path'][0]))
m['landmarks']['gazebo']=dict(gazebo['approach'])
if not clear(m['landmarks']['gazebo']):raise ValueError('The gazebo has no clear authored landing')
protected += [{'x':p['x']-65,'y':p['y']-90,'width':130,'height':170}for p in m['landmarks'].values()]
animal_starts=[(698,407),(762,396),(947,323),(1042,323),(651,286),(866,406),(748,435),(764,540),(260,314),(278,231),(469,838),(892,940)]
# Reserve projected bodies and their local approaches before planting crowns.
protected += [rect(x-23,y-29,46,54)for x,y in animal_starts]
protected += [{'x':s['seat']['x']-65,'y':s['seat']['y']-90,'width':130,'height':180}for s in m['benches']]
protected += [bounds(p['design'])for p in m['scene_objects']if p['kind']in['coach','canopy']]
protected += parking_reservations


# Each physical stall fits a family-specific vehicle at a human-readable scale.
parking=[p for p in m['scene_objects']if p['kind']=='parking'];models=['mercedes-cabriolet','zaporozhets','bentley','g-wagen','pickup','compact-hatchback'];colors=['white','red','black','blue','green']
vehicle_lengths={'mercedes-cabriolet':190,'zaporozhets':178,'bentley':198,'g-wagen':200,'pickup':205,'compact-hatchback':175}
def occupied_slot_indices(lot):
 if lot.get('residential_courtyard'):return []
 rows=lot['ground']['rows'];banks=lot['ground']['banks']
 return list(range(rows*banks-1))
for i,lot in enumerate(parking):
 rows=lot['ground']['rows'];banks=lot['ground']['banks']
 for j,slot_index in enumerate(occupied_slot_indices(lot)):
  slot=lot['native_slots'][slot_index];cell=slot['bounds'];model=models[(i+j)%6];asset=f'vehicle-{model}-{colors[(i+j)%5]}';direction='right'if slot_index<rows else'left';length=vehicle_lengths[model];d=design(asset,0,0,length/S,direction);actual=bounds(d)
  x=cell['x']+cell['width']/2;y=cell['y']+(cell['height']+actual['height'])/2
  p=prop(f'parked-block-{i+1}-{j+1}','car',asset,x/P,y/P,length/S,(length-16)/S,9.6,direction=direction);p.update(parking_id=lot['id'],slot_id=slot['id'],vehicle_family=model);m['scene_objects'].append(p)
  visual=bounds(p['design'])
  if visual['x']<cell['x']+6 or visual['y']<cell['y']+6 or visual['x']+visual['width']>cell['x']+cell['width']-6 or visual['y']+visual['height']>cell['y']+cell['height']-6:raise ValueError(f'Native vehicle does not fit {slot["id"]}: {asset}')

# A vehicle mouth is not necessarily the nearest way for a pedestrian to enter
# a courtyard. Cut real sixty-unit gates in the measured curb and connect them
# to nearby front walks or public pavement. Side gates use an unoccupied bay;
# its wheel stop is removed so the whole passage remains usable.
class CourtyardNavigator(Navigator):
 def grasspark(self,p):
  return any(d['x']<=p[0]<=d['x']+d['width']and d['y']<=p[1]<=d['y']+d['height']for d in m['architecture']['districts']if d['id']=='park')and not self.onpaving(p)
 def segment(self,a,b,pad=18):
  if not super().segment(a,b,pad):return False
  if any(boxdistance(a,b,v)<24 for v in visuals):return False
  n=max(1,math.ceil(math.dist(a,b)/10));return not any(self.grasspark([a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n])for i in range(n+1))
 def legal(self,node):
  p=self.point(node)
  return super().legal(node)and not self.grasspark(p)and not any(boxdistance(p,p,v)<24 for v in visuals)

def cut_parking_curb(lot,gates):
 global _bucket_count
 old=[s for s in m['solids']if s.get('parking_id')==lot['id']and s['kind']=='parking-component']
 old_rects={tuple(s[k]for k in ['x','y','width','height'])for s in old}
 obstacles[:]=[o for o in obstacles if tuple(o[k]for k in ['x','y','width','height'])not in old_rects]
 m['solids'][:]=[s for s in m['solids']if s not in old]
 # A near-corner mouth can intersect a perpendicular curb as well as its
 # nominated edge. Cut the complete swept 14-unit body, including the extra
 # physical pixel, rather than shifting the route into a native facade.
 cuts=[]
 for gate in gates:
  x,y=gate['point']['x'],gate['point']['y']
  if gate['edge']in ['top','bottom']:cuts.append({'x':x-31,'y':y-45,'width':62,'height':90})
  else:cuts.append({'x':x-45,'y':y-31,'width':90,'height':62})
 borders=[]
 for border in lot['borders']:
  pieces=[dict(border)]
  for cut in cuts:
   next_pieces=[]
   for piece in pieces:
    if not overlap(piece,cut):next_pieces.append(piece);continue
    left=max(piece['x'],cut['x']);right=min(piece['x']+piece['width'],cut['x']+cut['width'])
    top=max(piece['y'],cut['y']);bottom=min(piece['y']+piece['height'],cut['y']+cut['height'])
    rectangles=[(piece['x'],piece['y'],piece['width'],top-piece['y']),
     (piece['x'],bottom,piece['width'],piece['y']+piece['height']-bottom),
     (piece['x'],top,left-piece['x'],bottom-top),
     (right,top,piece['x']+piece['width']-right,bottom-top)]
    for x,y,w,h in rectangles:
     if w>.01 and h>.01:next_pieces.append({**piece,'x':x,'y':y,'width':w,'height':h})
   pieces=next_pieces
  for j,piece in enumerate(pieces):
   if piece!=border:piece['id']=f'{border["id"]}-part-{j+1}'
   borders.append(piece)
 # A door-specific side gate can fall between two bay rows. Clear the actual
 # inward mouth rectangle rather than assuming that it belongs to row zero.
 mouths=[]
 for gate in gates:
  x,y=gate['point']['x'],gate['point']['y']
  if gate['edge']=='left':mouths.append({'x':x,'y':y-31,'width':62,'height':62})
  elif gate['edge']=='right':mouths.append({'x':x-62,'y':y-31,'width':62,'height':62})
  elif gate['edge']=='top':mouths.append({'x':x-31,'y':y,'width':62,'height':62})
  else:mouths.append({'x':x-31,'y':y-62,'width':62,'height':62})
 omitted={p['id']for p in lot['bumpers']if any(overlap(p,mouth)for mouth in mouths)}
 lot['borders']=borders;lot['bumpers']=[p for p in lot['bumpers']if p['id']not in omitted]
 for component in lot['borders']+lot['bumpers']:
  foot={k:component[k]for k in ['x','y','width','height']}
  m['solids'].append({**component,'kind':'parking-component','source_kind':'bumper'if component in lot['bumpers']else'curb','parking_id':lot['id'],'footprint':dict(foot)});obstacles.append(foot)
 _bucket_count=-1

# Outside routing treats every parking floor as an obstacle, so a candidate
# connector cannot enter a neighbouring lot through a still-closed curb.
obstacles.extend(parking_reservations);_bucket_count=-1;court_nav=CourtyardNavigator();doorstep_nav=DoorstepNavigator();doorstep_nav.max_length=1100
shortcut_addresses={'shop-furniture','base-3','apartment-2','apartment-15','apartment-8','apartment-18'}
# Surveyed connectors follow the actual PNG silhouettes, keeping the whole
# 48-unit painted path clear even where transparent sprite bounds overlap.
native_clear_gate_paths={
 ('parking-local-apartment-67','apartment-2','top'):[[3020,1168],[3020,1136],[2980,1120],[2940,880],[2835,840],[2736,814]],
 ('parking-local-shop-furniture','shop-furniture','left'):[[5825,6744],[5785,6744],[5326,6748]],
}
for lot in parking:
 rows=lot['ground']['rows'];banks=lot['ground']['banks'];used=occupied_slot_indices(lot);candidates=[]
 owners=list(lot.get('courtyard_for',[]))
 owners.extend(z['id']for z in allbuildings if z['id']in shortcut_addresses and z['id']not in owners and door_lot_distance(z,lot)<=500)
 if owners:
  for owner_id in owners:
   owner=next(b for b in allbuildings if b['id']==owner_id);p=owner['door'];near=[]
   corner=60
   for edge,point in [('top',{'x':max(lot['x']+corner,min(lot['x']+lot['width']-corner,p['x'])),'y':lot['y']}),('bottom',{'x':max(lot['x']+corner,min(lot['x']+lot['width']-corner,p['x'])),'y':lot['y']+lot['height']}),('left',{'x':lot['x'],'y':max(lot['y']+corner,min(lot['y']+lot['height']-corner,p['y']))}),('right',{'x':lot['x']+lot['width'],'y':max(lot['y']+corner,min(lot['y']+lot['height']-corner,p['y']))})]:
    near.append((math.dist([p['x'],p['y']],[point['x'],point['y']]),edge,point))
   near=sorted(near,key=lambda q:q[0])if owner_id in shortcut_addresses else[min(near,key=lambda q:q[0])]
   for distance,edge,point in near:
    if distance>(550 if owner_id in shortcut_addresses else 200):continue
    gate={'edge':edge,'point':point,'doorstep_for':owner_id}
    if edge=='left':gate.update(bank=0,row=0)
    candidates.append(gate)
 opposite='top'if lot['entry']['edge']=='bottom'else'bottom'
 candidates.append({'edge':opposite,'point':{'x':lot['x']+354,'y':lot['y']+(lot['height']if opposite=='bottom'else 0)}})
 for edge,bank in [('left',0),('right',banks-1)]:
  if edge=='right'and banks==1:
   candidates.append({'edge':'right','point':{'x':lot['x']+lot['width'],'y':lot['y']+lot['height']/2}});continue
  for row in range(rows):
   if bank*rows+row not in used:candidates.append({'edge':edge,'bank':bank,'row':row,'point':{'x':lot['x']+(lot['width']if edge=='right'else 0),'y':lot['y']+24+120*row+60}})
 choices=[]
 for gate in candidates:
  p=gate['point'];normal={'top':(0,-1),'bottom':(0,1),'left':(-1,0),'right':(1,0)}[gate['edge']];outside=None
  for offset in [40,32,24,16]:
   proposed=[p['x']+normal[0]*offset,p['y']+normal[1]*offset]
   if clear({'x':proposed[0],'y':proposed[1]},24):outside=proposed;break
  if outside is None:continue
  targets=[]
  for f in m['architecture']['frontages']:
   if gate.get('doorstep_for')and f['building_id']!=gate['doorstep_for']:continue
   if lot.get('residential_courtyard')and f['building_id']not in lot['courtyard_for']:continue
   for segment_index,(a,b)in enumerate(zip(f['path'],f['path'][1:])):
    # The door anchor is only 24 units beyond the facade. A 40-unit
    # sidewalk joins the existing landing slightly farther from that face.
    if segment_index==0 and f['building_id']in shortcut_addresses:
     length=math.dist(a,b);fraction=min(1,36/(length or 1));a=[a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction]
    dist,end=project(outside,a,b)
    if dist<1050 and clear({'x':end[0],'y':end[1]},24):targets.append((dist,end,{'road_id':f'access-{f["building_id"]}','frontage_id':f['id']}))
  for a,b,r in mainsegments:
   if gate.get('doorstep_for')in shortcut_addresses:continue
   dist,q=project(outside,a,b);length=math.dist(a,b);vx=-(b[1]-a[1])/length;vy=(b[0]-a[0])/length
   side=1 if (outside[0]-q[0])*vx+(outside[1]-q[1])*vy>0 else -1
   end=[q[0]+vx*side*(r['width']/2+30),q[1]+vy*side*(r['width']/2+30)]
   if math.dist(outside,end)<1050 and clear({'x':end[0],'y':end[1]},24):targets.append((math.dist(outside,end),end,{'road_id':r['id']}))
  for dist,end,connection in sorted(targets,key=lambda c:c[0])[:6]:
   if dist>1050:continue
   try:route=(doorstep_nav if gate.get('doorstep_for')in shortcut_addresses else court_nav).path(outside,end)
   except ValueError:continue
   length=math.dist([p['x'],p['y']],outside)+sum(math.dist(a,b)for a,b in zip(route,route[1:]))
   if length>1250 or len(route)>4 or not all(segmentclear(a,b,24)for a,b in zip(route,route[1:])):continue
   choices.append((length,{**gate,'width':60,'path':[[p['x'],p['y']],*route],'connection':connection}));break
 selected=[]
 for length,gate in sorted(choices,key=lambda c:(c[1].get('doorstep_for')not in shortcut_addresses,c[0])):
  if any((gate['edge']==g['edge']and not(gate.get('doorstep_for')and g.get('doorstep_for')))or math.dist([gate['point']['x'],gate['point']['y']],[g['point']['x'],g['point']['y']])<100 for g in selected):continue
  selected.append(gate)
  if len(selected)==max(2,len(lot.get('courtyard_for',[])))+sum(owner in shortcut_addresses for owner in owners):break
 # This redundant northern connector projected over apartment-15. Its
 # residents already have a nearer southern gate and a separate side gate.
 if lot['id']=='parking-local-apartment-35':selected=[g for g in selected if not(g.get('doorstep_for')=='apartment-15'and g['edge']=='top')]
 for gate in selected:
  route=native_clear_gate_paths.get((lot['id'],gate.get('doorstep_for'),gate['edge']))
  if route:
   gate['point']={'x':route[0][0],'y':route[0][1]};gate['path']=route
 lot['pedestrian_entries']=selected
 if not selected:raise ValueError(f'No actual pedestrian access for {lot["id"]}')
 print('Pedestrian gates',lot['id'],[(g['edge'],round(sum(math.dist(a,b)for a,b in zip(g['path'],g['path'][1:]))))for g in selected],flush=True)
obstacles[:]=[o for o in obstacles if not any(o is r for r in parking_reservations)];_bucket_count=-1
for lot in parking:
 cut_parking_curb(lot,lot['pedestrian_entries'])
 # Sweep both sides and the full curb depth of every 60-unit mouth. The
 # centre line alone cannot detect a perpendicular corner or wheel stop.
 for gate in lot['pedestrian_entries']:
  tangent=(1,0)if gate['edge']in ['top','bottom']else(0,1)
  normal={'top':(0,1),'bottom':(0,-1),'left':(1,0),'right':(-1,0)}[gate['edge']]
  for along in [-16,0,16]:
   for across in [-30,-20,-12,0,12,20,30]:
    p={'x':gate['point']['x']+tangent[0]*along+normal[0]*across,'y':gate['point']['y']+tangent[1]*along+normal[1]*across}
    if not clear(p,14):raise ValueError(f'Blocked full pedestrian mouth {lot["id"]} {gate["edge"]} at {p}')
 for i,gate in enumerate(lot['pedestrian_entries']):
  gate['id']=f'{lot["id"]}-pedestrian-entry-{i+1}';gate['path_id']=f'walk-{gate["id"]}'
  for k in ['bank','row']:gate.pop(k,None)
  r={'id':gate['path_id'],'kind':'walkway','width':40,'sidewalk_width':4,'parking_id':lot['id'],'pedestrian_entry_id':gate['id'],'points':gate['path'],'connection':gate['connection']}
  m['roads'].append(r);paths.extend((a,b,r)for a,b in zip(r['points'],r['points'][1:]))
  if not all(segmentclear(a,b,20)for a,b in zip(r['points'],r['points'][1:])):raise ValueError(f'Blocked pedestrian gate {gate["id"]}')
class ParkingNavigator(Navigator):
 """Doorstep routing uses the authoritative 14-unit player body."""
 def segment(self,a,b,pad=14):
  if not segmentclear(a,b,14):return False
  n=max(1,math.ceil(math.dist(a,b)/4));return all(self.onpaving([a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n])for i in range(n+1))
 def legal(self,node):
  if node not in self.free:
   p=self.point(node);self.free[node]=clear({'x':p[0],'y':p[1]},14)and self.onpaving(p)
  return self.free[node]
parking_nav=ParkingNavigator(paved=True)
for frontage in m['architecture']['frontages']:
 print('Parking access',frontage['building_id'],flush=True)
 b=next(b for b in allbuildings if b['id']==frontage['building_id']);start=[b['door']['x'],b['door']['y']+24];choices=[]
 entries=[(lot,{**lot['entry'],'id':f'{lot["id"]}-vehicle-entry'},'vehicle')for lot in parking]+[(lot,entry,'pedestrian')for lot in parking for entry in lot['pedestrian_entries']]
 for lot,entry,entry_type in sorted(entries,key=lambda p:math.dist(start,[p[1]['point']['x'],p[1]['point']['y']])):
  if door_lot_distance(b,lot)>500:continue
  if lot.get('residential_courtyard')and b['id']not in lot['courtyard_for']:continue
  end=[entry['point']['x'],entry['point']['y']]
  if choices and math.dist(start,end)>min(c[0]for c in choices):continue
  try:route=parking_nav.path(start,end)
  except ValueError:continue
  length=sum(math.dist(a,c)for a,c in zip(route,route[1:]));choices.append((length,lot,route,entry,entry_type))
 if not choices:raise ValueError(f'No reachable parking for {b["id"]}')
 _,lot,route,entry,entry_type=min(choices,key=lambda q:q[0]);r=parking_reservations[parking.index(lot)]
 frontage['parking']={'scene_id':lot['id'],'shared':len(lot['courtyard_for'])>1 if lot.get('residential_courtyard')else True,**r,'spaces':len(lot['slots']),'entry_id':entry['id'],'entry_type':entry_type,'access_path':route,'walking_distance':round(sum(math.dist(a,c)for a,c in zip(route,route[1:])),3)}
 if frontage['parking']['walking_distance']>1250:raise ValueError(f'Parking walk exceeds a local approach for {b["id"]}: {frontage["parking"]["walking_distance"]}')
 paths.extend((aa,bb,{'kind':'walkway','width':32})for aa,bb in zip(route,route[1:]))

# Place native lamp feet on straight, regularly spaced sidewalk rows, never on
# the curb or in an entrance. Upright art has a genuine offset foot anchor.
for rid,(a,b,r)in enumerate(mainsegments):
 length=math.dist(a,b);dx=(b[0]-a[0])/length;dy=(b[1]-a[1])/length;nx=-dy;ny=dx
 for step in range(250,int(length)-100,700):
  for side in [-1,1]:
   px=a[0]+dx*step+nx*side*(r['width']/2+85);py=a[1]+dy*step+ny*side*(r['width']/2+85);f={'x':px-5,'y':py-8,'width':10,'height':8}
   if not propclear(f,5):continue
   lamp_design=design('streetlight-classic',px/P,py/P,7,anchorX=.79)
   if any(overlap(bounds(lamp_design),r,8)for r in parking_reservations):continue
   p=prop(f'lamp-{rid}-{step}-{side}','lamp','streetlight-classic',px/P,py/P,7,2,1.6,anchorX=.79)
   m['decor']['lamps'].append(p)

def dry_shore_point(origin):
 candidates=[]
 for a,b in zip(l['outline'],l['outline'][1:]+l['outline'][:1]):
  _,q=project([origin['x'],origin['y']],a,b);length=math.dist(a,b)
  if not length:continue
  nx=-(b[1]-a[1])/length;ny=(b[0]-a[0])/length
  for side in [-1,1]:
   for offset in [40,65,90]:
    p={'x':round(q[0]+nx*side*offset),'y':round(q[1]+ny*side*offset)}
    if clear(p,20):candidates.append((math.dist([origin['x'],origin['y']],[p['x'],p['y']]),p))
 if not candidates:raise ValueError(f'No dry fishing bank near {origin}')
 return min(candidates,key=lambda q:q[0])[1]

for id,action,label,x,y in [('bin-plaza','trash-bin','Выбросить мусор',798,552),('bin-park','trash-bin','Выбросить мусор',702,425),('litter-park-1','pick-litter','Поднять мусор',681,427),('litter-city-1','pick-litter','Поднять мусор',752,705),('fishing-west','fishing','Рыбачить',946,414),('fishing-east','fishing','Рыбачить',1189,649)]:
 p=safe(xy(x,y),pad=20)if action!='fishing'else dry_shore_point(xy(x,y))
 q={'id':id,'action':action,'label':label,**p,'radius':65}
 if action=='trash-bin':
  for radius in [0,8,16,24,32,40,55]:
   candidates=[(0,0)]if not radius else[(0,-radius),(0,radius),(-radius,0),(radius,0),(-radius,-radius),(radius,-radius),(-radius,radius),(radius,radius)]
   found=False
   for dx,dy in candidates:
    p=safe(xy(x+dx,y+dy));foot=support_rect(p['x']/P,p['y']/P-8*S/P,4,4)
    if propclear(foot,8):found=True;break
   if found:break
  if not found:raise ValueError(f'No genuine bin footing at {id}')
  q.update(p);q['kind']='bin';q['design']=design('street-bin',p['x']/P,p['y']/P-8*S/P,7);q['footprint']=foot;q['depth']=foot['y']+foot['height'];obstacles.append(foot)
  m['scene_objects'].append(copy.deepcopy(q))
 elif action=='pick-litter':
  q.update(kind='litter',design=design('actor-prop-trash',p['x']/P,p['y']/P,4),depth=-1)
 m['activities'].append(q);protected.append({'x':p['x']-50,'y':p['y']-90,'width':100,'height':150})

# Independently placed shore assets follow the actual contour. Several dry
# shoreline pockets on long edges form a readable bank rather than two isolated
# decorations. Their raised feet never occupy water or public paths.
for i,a in enumerate(l['outline']):
 b=l['outline'][(i+1)%len(l['outline'])];dx=b[0]-a[0];dy=b[1]-a[1];length=math.hypot(dx,dy)
 if length==0:continue
 for j,t in enumerate([.3,.7]if length>300 else[.5]):
  kind=['shore-grass','shore-stones','reeds','shore-pebbles','shore-boulders'][(i+j)%5];w=9 if kind=='reeds'else 13
  for offset in [50,70,90,110]:
   x=a[0]+dx*t+dy/length*offset;y=a[1]+dy*t-dx/length*offset
   d=design('bziker-water-'+kind,x/P,y/P,w);f=support_rect(x/P,y/P,8,2)
   if any(overlap(bounds(d),p,8)for p in protected)or not propclear(f,8)or not pathclear(f,8):continue
   p=prop(f'bank-{i+1}-{j+1}',kind,'bziker-water-'+kind,x/P,y/P,w,8 if kind in ['shore-boulders','shore-stones']else 0,2 if kind in ['shore-boulders','shore-stones']else 0,depth=y);m['scene_objects'].append(p);break

# A repeated top planting strip frames each parking parcel. These are individual
# native flowerbed sprites with physical basins, not flowers baked into a floor.
for i,lot in enumerate(parking):
 for j,x in enumerate([lot['x']+65,lot['x']+lot['width']/2,lot['x']+lot['width']-65]):
  y=lot['y']-32;asset=['flowerbed-tulips','flowerbed-daisies','flowerbed-petunias'][(i+j)%3];d=design(asset,x/P,y/P,18);f=support_rect(x/P,y/P,12,4)
  if not propclear(f,8)or not pathclear(f,8)or any(overlap(bounds(d),v,8)for v in visuals)or any(overlap(bounds(d),r,8)for r in parking_reservations)or any(boxdistance(a,b,bounds(d))<r['width']/2+r.get('sidewalk_width',4)+8 for a,b,r in paths if r.get('pedestrian_entry_id')):continue
  p=prop(f'parking-planter-{i+1}-{j+1}','planter',asset,x/P,y/P,18,12,4);p.update(parking_id=lot['id'],plot_planting=True);m['decor']['street_details'].append(p)

# Trees use original independent species PNGs. The crown may overlap its own
# planting bed, while the actual trunk cannot cross road, entrance, or path.
rng=random.Random(21);species=['oak','birch','maple','linden','willow','poplar','pine','spruce']
candidates=[]
for y in range(20,1024,31):
 for x in range(17,1536,31):
  park=555<x<900 and 172<y<477;edge=x<80 or x>1460 or y<40 or y>970
  if park or edge or rng.random()<.64:candidates.append((x+rng.uniform(-8,8),y+rng.uniform(-7,7),park))
for y in range(195,465,24):
 for x in range(579,887,24):candidates.append((x+rng.uniform(-4,4),y+rng.uniform(-3,3),True))
sapling_pass=len(candidates)
for y in range(195,465,16):
 for x in range(579,887,16):candidates.append((x+rng.uniform(-2,2),y+rng.uniform(-2,2),True))
for y in range(22,1020,22):
 for x in range(18,1532,22):
  if not(555<x<900 and 172<y<477):candidates.append((x+rng.uniform(-2,2),y+rng.uniform(-2,2),False))
# Small native trees form groves in the remaining park lawns. The finer search
# finds clear planting pockets; the same crown, body and 18-pixel spacing
# checks still apply, so paths and interactive approaches remain open.
park_infill_start=len(candidates)
for y in range(192,465,8):
 for x in range(578,891,8):candidates.append((x,y,True))
for i,(x,y,park)in enumerate(candidates):
 if i>=park_infill_start and sum(555*P<t['x']<900*P and 172*P<t['y']<477*P for t in m['decor']['trees'])>=45:break
 kind=species[i%8];w=rng.uniform(20,27)if i>=sapling_pass else rng.uniform(29,41)if park else rng.uniform(21,32);d=design(f'tree-{kind}',x,y,w)
 # Slender source poplars retain their ratio without towering over a block.
 if d['height']>(55 if park else 46)*S:
  w*=((55 if park else 46)*S)/d['height'];d=design(f'tree-{kind}',x,y,w)
 f=support_rect(x,y,3,2)
 if not propclear(f,12)or not pathclear(f,17):continue
 # Ground bases and lower foliage do not swallow house walls. Higher crowns
 # can naturally overlap the edge of a lawn but never the protected actor area.
 base={'x':d['x']-d['width']*.3,'y':d['y']-d['height']*.28,'width':d['width']*.6,'height':d['height']*.28}
 if any(overlap(base,r,10)for r in visuals)or any(overlap(bounds(d),r,8)for r in protected):continue
 if any(boxdistance(aa,bb,bounds(d))<q['width']/2+q.get('sidewalk_width',8)+8 for aa,bb,q in paths if q['kind']=='driveway'or q.get('pedestrian_entry_id')):continue
 if any(math.hypot(t['x']-x*P,t['y']-y*P)<90 for t in m['decor']['trees']):continue
 p=prop(f'tree-v23-{len(m["decor"]["trees"])+1}',kind,f'tree-{kind}',x,y,w,3,2);p['size']=round(w/35,3)
 m['decor']['trees'].append(p)

# Keep roughly the former planting density as the terrain expands, while
# limiting per-object bitmap caches on the primary phone client. Preserve the
# complete park grove; sample remaining trees across the whole city uniformly.
if len(m['decor']['trees'])>800:
 park_area=next(d for d in m['architecture']['districts']if d['id']=='park')
 def park_tree(t):return park_area['x']<t['x']<park_area['x']+park_area['width']and park_area['y']<t['y']<park_area['y']+park_area['height']
 retained_park=[t for t in m['decor']['trees']if park_tree(t)]
 rest=[t for t in m['decor']['trees']if not park_tree(t)]
 selected=random.Random(23).sample(rest,max(0,800-len(retained_park)))
 retained_ids={t['id']for t in retained_park+selected}
 omitted_feet={builtins.id(t['footprint'])for t in m['decor']['trees']if t['id']not in retained_ids}
 m['decor']['trees']=[t for t in m['decor']['trees']if t['id']in retained_ids]
 obstacles[:]=[o for o in obstacles if builtins.id(o)not in omitted_feet];_bucket_count=-1

# Low native flowerbed planters occupy courtyard garden strips rather than
# being randomly laid over streets. Every raised basin has a physical base.
for i,b in enumerate(allbuildings):
 for side in [-1,1]:
  x=(b['door']['x']+side*155)/P;y=(b['door']['y']+28)/P;f=support_rect(x,y,12,4)
  if not propclear(f,8)or not pathclear(f,3):continue
  asset=['flowerbed-tulips','flowerbed-daisies','flowerbed-petunias'][i%3];d=design(asset,x,y,18)
  if any(boxdistance(a,b,bounds(d))<r['width']/2+r.get('sidewalk_width',4)+8 for a,b,r in paths if r.get('pedestrian_entry_id')):continue
  m['decor']['street_details'].append(prop(f'flowerbed-{b["id"]}-{side}','planter',asset,x,y,18,12,4))

# Boats and piers are independent native objects with a dry boarding point and
# a wet, navigable dock. Their y difference follows the existing pier camera.
m['boats']=[]
for i,(x,by,dy)in enumerate([(970,331,390),(1090,344,401),(1188,350,393)]):
 board=safe(xy(x,by),maxdist=300,pad=20);dock=xy(x,dy)
 if not inwater(dock['x'],dock['y']):raise ValueError(f'Boat {i+1} dock is not wet')
 m['boats'].append({'id':f'boat-{i+1}','label':f'Лодка {i+1}',**dock,'dock':dock,'boarding':{**board,'radius':65}})
 l['walkways'].append({'id':f'dock-{i+1}','points':[[board['x'],board['y']],[dock['x'],dock['y']]],'width':60,'geometry_only':True})
 # Only real flat planks may turn: upright posts are never flipped.
 a=[board['x'],board['y']];b=[dock['x'],dock['y']];length=math.dist(a,b);count=math.ceil(length/180)
 for section in range(count):
  x=a[0]+(b[0]-a[0])*section/count;y=a[1]+(b[1]-a[1])*section/count;h=length/count;w=h*126/326
  d=design('bziker-water-pier',x/P,y/P,w/S,anchorY=0);d.update(height=h,componentCrop={'x':310,'y':285,'width':126,'height':326},rotation=math.atan2(b[1]-a[1],b[0]-a[0])-math.pi/2)
  m['scene_objects'].append({'id':f'pier-{i+1}-planks-{section+1}','kind':'pier','layer':'ground','design':d,'depth':-1,'footprint':None})
m['landmarks']['dock']={k:m['boats'][1]['boarding'][k]for k in ['x','y']}

# Repeated genuine narrow planks form the island bridge with uniform aspect.
bridge=l['walkways'][0];bridge['geometry_only']=True;a,b=bridge['points'];length=math.dist(a,b);count=3
for i in range(count):
 x=a[0]+(b[0]-a[0])*i/count;y=a[1]+(b[1]-a[1])*i/count;h=length/count;w=h*126/326
 d=design('bziker-water-pier',x/P,y/P,w/S,anchorY=0);d.update(height=h,componentCrop={'x':310,'y':285,'width':126,'height':326},rotation=math.atan2(b[1]-a[1],b[0]-a[0])-math.pi/2)
 m['scene_objects'].append({'id':f'island-bridge-planks-{i+1}','kind':'bridge','layer':'ground','design':d,'depth':-1,'footprint':None})

# Roaming loops are authored in actual open ground, not an arbitrary circle.
animals=json.loads((WEB/'animals-layout-v19.json').read_text());starts=animal_starts
reserved=[]
for animal,(x,y)in zip(animals['animals'],starts):
 start=safe(xy(x,y),pad=20)
 if any(math.dist([start['x'],start['y']],q)<115 for q in reserved):start=safe({'x':start['x']+150,'y':start['y']+35},pad=20)
 def segclear(a,b):
  n=max(1,math.ceil(math.dist([a['x'],a['y']],[b['x'],b['y']])/5));return all(clear({'x':a['x']+(b['x']-a['x'])*j/n,'y':a['y']+(b['y']-a['y'])*j/n},20)for j in range(n+1))
 for dx,dy in [(90,60),(-90,60),(90,-60),(-90,-60),(60,90),(-60,90),(60,-90),(-60,-90)]:
  loop=[start,{'x':start['x']+dx,'y':start['y']},{'x':start['x']+dx,'y':start['y']+dy},{'x':start['x'],'y':start['y']+dy}]
  if all(segclear(a,b)for a,b in zip(loop,loop[1:]+loop[:1])):break
 else:
  for dx,dy in [(60,0),(-60,0),(0,60),(0,-60)]:
   end={'x':start['x']+dx,'y':start['y']+dy}
   if segclear(start,end):loop=[start,end];break
  else:raise ValueError(f'No roaming route for {animal["id"]}')
 animal['route']=[{**p,'dwell':3+j%3}for j,p in enumerate(loop)];reserved.append([start['x'],start['y']])
 if animal['id']in ['park-dog','park-cat']:m['activities'].append({'id':animal['id'],'action':animal['action'],'label':animal['label'],'radius':65,**start})
dog=animals['animals'][0]['route'][0];m['landmarks']['park']=safe({'x':dog['x']-54,'y':dog['y']},pad=14)
railway=next(b for b in m['buildings']if b['id']=='railway')
m['landmarks']['station']={'x':railway['door']['x'],'y':railway['door']['y']+24}

# Return points are resolved after the final parking cars and street props.
# Earlier reservations protect scenery placement, but a filled native parking
# bay can change the nearest usable return point during the final parcel pass.
for name,p in list(m['landmarks'].items()):
 if name in ('welcome','gazebo')and not clear(p):raise ValueError(f'The physical {name} landing was obstructed')
 if not clear(p):
  q=safe(p,maxdist=160,pad=14)
  print('Final return point',name,p,'->',q,flush=True)
  m['landmarks'][name]=q
m['smoking']['door']=dict(m['landmarks']['smoking'])
m['district']['spawn']=dict(m['landmarks']['district'])

# Actual spawn to welcome walk has a short readable landing before the city.
station=m['landmarks']['station'];welcome=m['landmarks']['welcome'];m['spawn']=dict(station);navigator=Navigator()
m['arrival_route']={'points':navigator.path([station['x'],station['y']],[welcome['x'],welcome['y']]),'walking_seconds':0}
m['arrival_route']['walking_seconds']=round(sum(math.dist(a,b)for a,b in zip(m['arrival_route']['points'],m['arrival_route']['points'][1:]))/m['movement_speed'],3)
m['action_routes']=[]
targets=[(f'entrance-{b["id"]}',{'x':b['door']['x'],'y':b['door']['y']+24,'radius':110})for b in m['buildings']+m['district']['buildings']]
targets += [(f'boat-board-{b["id"]}',b['boarding'])for b in m['boats']]+[(p['id'],p)for p in m['activities']]
park=m['landmarks']['park']
for id,target in targets:
 print('Validating route',id,flush=True)
 route=navigator.path([park['x'],park['y']],[target['x'],target['y']])
 m['action_routes'].append({'id':id,'from':'park','target':{k:target[k]for k in ['x','y','radius']},'points':route})
# The generator refuses blocked doors/returns, route segments, and footings.
for b in m['buildings']+m['district']['buildings']:
 for dy in [0,24,25,28,70]:
  if not clear({'x':b['door']['x'],'y':b['door']['y']+dy}):raise ValueError(f'Blocked entrance {b["id"]}+{dy}')
for p in [m['spawn'],*m['landmarks'].values()]:
 if not clear(p):raise ValueError(f'Blocked arrival {p}')
for r in m['roads']:
 for a,b in zip(r['points'],r['points'][1:]):
  n=max(1,math.ceil(math.dist(a,b)/8))
  for i in range(n+1):
   p={'x':a[0]+(b[0]-a[0])*i/n,'y':a[1]+(b[1]-a[1])*i/n}
   if not clear(p,14):raise ValueError(f'Blocked authored corridor {r["id"]} at {p}')
for a,b,r in mainsegments:
 n=max(1,math.ceil(math.dist(a,b)/10))
 for i in range(n+1):
  if inwater(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n,r['width']/2+60):raise ValueError(f'Paved road corridor crosses water: {r["id"]}')
 for o in obstacles:
  if boxdistance(a,b,o)<r['width']/2+60:raise ValueError(f'Ground support crosses {r["id"]}: {o}')
print('Draft instances',len(m['background_buildings']),'houses',len(m['decor']['trees']),'trees',len(m['bench_groups']),'benches')
# Real parcel dimensions take priority over a fixed dwelling count.
if len(m['background_buildings'])<30:raise ValueError(f'Only {len(m["background_buildings"])} residential parcels fitted')
if len(m['decor']['trees'])<240:raise ValueError(f'Only {len(m["decor"]["trees"])} tree bases fitted')
park_trees=sum(555*P<t['x']<900*P and 172*P<t['y']<477*P for t in m['decor']['trees'])
if park_trees<45:raise ValueError(f'Only {park_trees} genuine park planting pockets fitted')
required_benches={'city-bench-1','city-bench-2','city-bench-3','city-bench-4','city-bench-5','city-bench-6','city-bench-9','city-bench-10','city-bench-13','city-bench-14','city-bench-15','smoking-bench'}
if not required_benches<={b['id']for b in m['bench_groups']}:raise ValueError('A retained bench and its saved seat IDs must not disappear')

raw=json.dumps(m,ensure_ascii=False,indent=2)+'\n';(WEB/'world-map.json').write_text(raw)
(WEB/'animals-map.json').write_text(json.dumps(animals,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'schema':23,'public':len(m['buildings']),'clan':len(m['district']['buildings']),'residential':len(m['background_buildings']),'trees':len(m['decor']['trees']),'lamps':len(m['decor']['lamps']),'benches':len(m['bench_groups']),'parking_blocks':len(parking_drafts),'native_props':len(m['scene_objects'])+len(m['decor']['street_details']),'map_sha256':hashlib.sha256(raw.encode()).hexdigest()}))

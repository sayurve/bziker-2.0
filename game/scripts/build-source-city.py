"""Exact approved scene, with independent physical traces in native pixels.

The PNG is never repainted or synthesized. Metadata below only determines
movement and interaction; it cannot move any pixel in the selected source art.
"""
import copy,hashlib,heapq,json,math,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];WEB=ROOT/'web';S=5
current=json.loads((WEB/'world-map.json').read_text())
snapshot=WEB/'world-layout-v18.json'
if not snapshot.exists():
 if current.get('schema_version')!=18:raise ValueError('Expected the preserved v18 scene before exact migration')
 snapshot.write_text(json.dumps(current,ensure_ascii=False,indent=2)+'\n')
previous=json.loads(snapshot.read_text());m=copy.deepcopy(previous)
xy=lambda x,y:{'x':round(x*S),'y':round(y*S)}
rect=lambda x,y,w,h:{'x':round(x*S),'y':round(y*S),'width':round(w*S),'height':round(h*S)}
m.update(schema_version=19,width=7680,height=5120,walkable={'left':18,'right':7662,'top':18,'bottom':5102})
m['previous_landmarks_v18']=copy.deepcopy(previous['landmarks'])
m['design_source']={'map':'city-source-map','native_size':[1536,1024],'scale':S,'version':17,'composition_revision':19,'exact_scene':True,'scene_mode':'unchanged-native-raster','source_sha256':'70dd7a15e86a16f486c7a181200607cb4b96ab5e63a3914b6af57d5864beb179','file':'01_Окружение/Карта_города/Квадраты_карты/Карта_исходная.png','geometry_policy':'authored-native-ground-supports','artwork_unchanged':True}
# Visible bounding rectangles are conservative supports because the supplied
# city is flattened; no foreground masks were included with its layers.
public={
 'railway':((880,150,230,132),(1012,301)),
 'clans':((128,53,128,103),(195,172)),
 'casino':((477,446,174,163),(554,628)),
 'shop-food':((790,593,83,78),(832,688)),
 'shop-clothes':((399,681,161,130),(480,829)),
 'shop-furniture':((576,722,158,122),(645,863)),
 'messages':((776,783,174,124),(869,925)),
 'arena':((997,739,199,167),(1090,931)),
 'profile':((681,493,65,61),(711,570)),
 'results':((454,269,61,87),(485,373)),
 'terrace':((1260,288,88,79),(1295,384)),
}
private=[((274,84,130,103),(336,204)),((60,164,134,119),(123,300)),((305,218,116,118),(357,353)),((17,27,53,83),(42,126)),((483,94,66,103),(508,215)),((299,434,56,95),(323,545)),((379,470,69,107),(410,594)),((283,631,80,112),(314,760))]
def place(b,box,door):
 b.update(rect(box[0]+2,box[1]+box[3]*.42,box[2]-4,box[3]*.58),door=xy(*door));b['design']={'baked_scene':True,'source_bounds':list(box),'x':round((box[0]+box[2]/2)*S),'y':round((box[1]+box[3])*S),'width':round(box[2]*S),'height':round(box[3]*S),'anchorX':.5,'anchorY':1,'foreground_polygon':[[box[0]+box[2]*.08,box[1]+box[3]*.05],[box[0]+box[2]*.76,box[1]],[box[0]+box[2],box[1]+box[3]*.16],[box[0]+box[2]*.94,box[1]+box[3]*.95],[box[0]+box[2]*.15,box[1]+box[3]],[box[0],box[1]+box[3]*.75],[box[0],box[1]+box[3]*.23]]};return b
for b in m['buildings']:place(b,*public[b['id']])
for b,(box,door)in zip(m['district']['buildings'],private):place(b,box,door)
# Additional residential/native structures, traced directly in the master PNG.
houses=[(141,6,54,47),(846,0,57,53),(947,22,63,59),(1047,23,49,62),(1118,18,64,85),(1180,24,44,86),(1281,48,65,101),(1353,94,81,110),(1446,139,62,87),(1270,286,45,77),(1310,313,52,66),(1414,338,67,102),(3,334,54,110),(282,321,55,63),(62,531,57,88),(119,576,102,102),(7,676,70,111),(94,748,83,107),(234,811,63,102),(330,810,72,113),(413,857,91,113),(602,920,81,104),(787,940,70,84),(1224,690,80,93),(1355,720,65,90),(1481,753,55,96),(1223,841,68,111),(1357,865,72,89),(1414,910,76,91),(1190,965,63,59),(1367,996,66,28),(327,965,67,59),(184,943,61,81),(0,966,57,58),(703,512,46,45),(23,25,43,60)]
# Avoid duplicating a private/public bounding support.
def overlap(a,b):return a['x']<b['x']+b['width'] and a['x']+a['width']>b['x'] and a['y']<b['y']+b['height'] and a['y']+a['height']>b['y']
occupied=m['buildings']+m['district']['buildings'];m['background_buildings']=[]
for i,box in enumerate(houses):
 b=place({'id':f'native-residence-{i+1}','kind':'apartment'},box,(box[0]+box[2]/2,box[1]+box[3]+12))
 if not any(overlap(b,q)for q in occupied):m['background_buildings'].append(b)
trace=json.loads((WEB/'source-canopies-v19.json').read_text())
m['solids']=[] # native supports appended below
for r in trace['rects']:
 b=rect(r['x'],r['y'],r['width'],r['height'])
 if not any(b['x']>=q['x'] and b['x']+b['width']<=q['x']+q['width'] and b['y']>=q['y'] and b['y']+b['height']<=q['y']+q['height']for q in occupied+m['background_buildings']):m['solids'].append({**b,'source_kind':'native-canopy'})
# Fountain, gazebo, clan monument, native construction perimeter and parked
# rows are physical supports belonging to the unchanged original scene.
for kind,box in [('fountain',(686,334,70,60)),('gazebo',(692,182,58,59)),('monument',(241,208,32,47)),('construction',(67,351,203,152))]:m['solids'].append({**rect(*box),'source_kind':kind})
for item in json.loads((WEB/'source-props-v19.json').read_text())['props']:
 line=item.get('support_line')
 if line:
  # Follow the native diagonal bottom edge of the rail body/vertical step.
  # A single broad bounding box would also block the adjacent platform floor.
  depth=item['support_depth'];n=0
  for a,b in zip(line,line[1:]):
   steps=max(1,math.ceil(max(abs(b[0]-a[0]),abs(b[1]-a[1]))/10))
   for i in range(steps):
    p=[a[k]+(b[k]-a[k])*i/steps for k in (0,1)];q=[a[k]+(b[k]-a[k])*(i+1)/steps for k in (0,1)]
    box=[min(p[0],q[0]),min(p[1],q[1])-depth/2,max(abs(q[0]-p[0]),1),abs(q[1]-p[1])+depth]
    m['solids'].append({**rect(*box),'id':item['id']if n==0 else f'{item["id"]}:support-{n}','source_prop_id':item['id'],'source_kind':item['kind'],'source_pixel_bounds':box});n+=1
 else:m['solids'].append({**rect(item['x'],item['y'],item['width'],item['height']),'id':item['id'],'source_kind':item['kind'],'source_pixel_bounds':[item['x'],item['y'],item['width'],item['height']]})
anchors=json.loads((WEB/'source-arrival-points-v19.json').read_text())
for b in occupied:
 if b['id']in anchors['doors']:b['door']=dict(anchors['doors'][b['id']])
m['decor']={'trees':[],'lamps':[],'street_details':[],'plaza':{**rect(648,406,141,82)}}
m['architecture']={'version':19,'exact_scene':True,'frontages':[],'districts':[{'id':'park',**rect(550,160,378,327)}],'block_paving':[],'bike_racks':[],'props':[],'railway_strip':{'points':[[0,0],[7680,1330]],'width':80}}
m['design_areas']=[];m['roads']=[]
m['smoking']={**m['smoking'],**rect(818,458,46,40),'door':xy(840,490),'exact_scene':True};m['smoking'].pop('design',None)
l=copy.deepcopy(previous['lake']);l['outline']=[[x*S,y*S]for x,y in json.loads((WEB/'source-water-trace-v19.json').read_text())['outline']];l['exact_scene']=True;l['walkways']=[{'id':'island-bridge','points':[[1237*S,611*S],[1148*S,549*S]],'width':70}]
l['x']=1120*S;l['y']=530*S;m['lake']=l
# The native wooden piers are walkable strips, not rewritten artwork.
l['walkways'] += [{'id':'dock-north','points':[[1086*S,365*S],[1092*S,410*S]],'width':55},{'id':'dock-west','points':[[940*S,406*S],[945*S,467*S]],'width':50},{'id':'dock-south','points':[[1080*S,678*S],[1120*S,683*S]],'width':55},{'id':'dock-midwest','points':[[902*S,562*S],[970*S,571*S]],'width':65}]
m['boats']=[{'id':f'boat-{i+1}','label':f'Лодка {i+1}',**xy(*dock),'dock':xy(*dock),'boarding':{**xy(*board),'radius':65},'exact_scene':True}for i,(dock,board)in enumerate([((970,439),(946,435)),((1110,401),(1090,391)),((1108,669),(1090,680))])]
m['landmarks']={k:xy(*v)for k,v in {'station':(1012,306),'welcome':(965,315),'plaza':(722,433),'district':(266,310),'park':(692,409),'dock':(1090,391),'archive':(797,548),'smoking':(840,490),'fountain':(721,409),'gazebo':(717,257)}.items()};m['spawn']=xy(1012,306);m['district'].update(width=7680,height=5120,spawn=m['landmarks']['district'])
for key,point in anchors['landmarks'].items():m['landmarks'][key]=dict(point)
# Actor foot circle is 14 world units. Vegetation and roofs use visible native
# bounds; the source raster has no independently reorderable foreground layer.
obstacles=occupied+m['background_buildings']+m['solids']
def pointpoly(x,y,poly):
 inside=False
 for i,a in enumerate(poly):
  b=poly[i-1]
  if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:inside=not inside
 return inside
def project(p,a,b):
 dx=b[0]-a[0];dy=b[1]-a[1];t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy or 1)));return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)
lakebounds=(min(q[0]for q in l['outline']),min(q[1]for q in l['outline']),max(q[0]for q in l['outline']),max(q[1]for q in l['outline']))
def inwater(x,y,pad=0):
 if x<lakebounds[0]-pad or y<lakebounds[1]-pad or x>lakebounds[2]+pad or y>lakebounds[3]+pad:return False
 if any(project((x,y),a,b)<=r['width']/2-pad for r in l['walkways'] for a,b in zip(r['points'],r['points'][1:])):return False
 if any(((x-i['x'])/max(1,i['radius_x']-pad))**2+((y-i['y'])/max(1,i['radius_y']-pad))**2<1 for i in l['islands']):return False
 if pointpoly(x,y,l['outline']):return True
 return pad>0 and any(project((x,y),a,l['outline'][j-1])<pad for j,a in enumerate(l['outline']))
buckets={}
for b in obstacles:
 for yy in range(int((b['y']-16)//100),int((b['y']+b['height']+16)//100)+1):
  for xx in range(int((b['x']-16)//100),int((b['x']+b['width']+16)//100)+1):buckets.setdefault((xx,yy),[]).append(b)
def clear(p,pad=14):
 x,y=p['x'],p['y']
 if not 18+pad<x<7662-pad or not 18+pad<y<5102-pad or inwater(x,y,pad):return False
 for b in buckets.get((int(x//100),int(y//100)),[]):
  if math.hypot(max(b['x']-x,0,x-b['x']-b['width']),max(b['y']-y,0,y-b['y']-b['height']))<pad+1:return False
 return True
def safe(p,maxdist=160,pad=14):
 if clear(p,pad):return dict(p)
 for r in range(5,maxdist+1,5):
  for dx,dy in sorted(((dx,dy)for dx in range(-r,r+1,5)for dy in range(-r,r+1,5)if max(abs(dx),abs(dy))==r),key=lambda q:q[0]**2+q[1]**2):
   q={'x':p['x']+dx,'y':p['y']+dy}
   if clear(q,pad):return q
 raise ValueError(f'No clear source passage beside {p}')
for b in occupied:
 b['door']=safe(b['door'])
for k,p in m['landmarks'].items():m['landmarks'][k]=safe(p)
m['spawn']=dict(m['landmarks']['station']);m['district']['spawn']=dict(m['landmarks']['district']);m['smoking']['door']=dict(m['landmarks']['smoking'])
for b in m['boats']:b['boarding'].update(safe(b['boarding']))
# Actual source bench art anchors (top-left x/y); immutable scene contains them.
benchcoords=[(646,307),(773,461),(827,435),(786,255),(747,305),(834,332),(331,207),(286,270),(307,341),(355,52),(970,304),(1046,305)]
# Leaf-colour extraction may include upholstery/plants touching a bench.
# A native bench cannot share its seating support with a vegetation trunk.
benchsupports=[{'x':round(x*S)-12,'y':round(y*S)-12,'width':144,'height':56}for x,y in benchcoords]
m['solids']=[b for b in m['solids']if b.get('source_kind')!='native-canopy'or not any(overlap(b,q)for q in benchsupports)]
obstacles=occupied+m['background_buildings']+m['solids'];buckets.clear()
for b in obstacles:
 for yy in range(int((b['y']-16)//100),int((b['y']+b['height']+16)//100)+1):
  for xx in range(int((b['x']-16)//100),int((b['x']+b['width']+16)//100)+1):buckets.setdefault((xx,yy),[]).append(b)
m['bench_groups']=[];m['benches']=[]
for old,(x,y)in zip(previous['bench_groups'],benchcoords):
 group={'id':old['id'],**xy(x,y),'width':120,'height':36,'exact_scene':True};m['bench_groups'].append(group)
 for j in range(2):
  seat=safe({'x':group['x']+35+j*50,'y':group['y']+28},100)
  m['benches'].append({**group,'id':f'{group["id"]}:seat-{j+1}','group_id':group['id'],'seat':seat})
# Preserve the existing action IDs; no drawn artificial city props accompany
# these functional targets. Only bins belonging to visible street furniture.
activityplaces={'fishing-west':(956,452),'fishing-east':(1161,559),'litter-park-1':(685,419),'litter-city-1':(755,700),'bin-plaza':(810,533),'bin-park':(708,441)}
m['activities']=[]
for q in previous['activities']:
 if q['action'] in ['pet-cat','pet-dog']:continue
 if q['id'] not in activityplaces:continue
 q=copy.deepcopy(q);q.update(safe(xy(*activityplaces[q['id']])));m['activities'].append(q)
# Include the exact canonical supports before authoring walking corridors.
for b in m['buildings']:
 support={**b,'width':b['width']+18,'height':b['height']+10};obstacles.append(support)
for b in m['bench_groups']:obstacles.append({'x':b['x']-6,'y':b['y']-5,'width':132,'height':42})
for b in m['activities']:
 if b['action']=='trash-bin':obstacles.append({'x':b['x']-17,'y':b['y']-8,'width':35,'height':23})
buckets.clear()
for b in obstacles:
 for yy in range(int((b['y']-16)//100),int((b['y']+b['height']+16)//100)+1):
  for xx in range(int((b['x']-16)//100),int((b['x']+b['width']+16)//100)+1):buckets.setdefault((xx,yy),[]).append(b)
animals=json.loads((WEB/'animals-layout-v16.json').read_text());animalstarts=[(686,413),(757,385),(942,313),(1035,317),(662,286),(867,401),(749,425),(763,496),(291,310),(259,185),(476,841),(894,939)]
for animal,(x,y)in zip(animals['animals'],animalstarts):
 start=safe(anchors['animals'].get(animal['id'],xy(x,y)),pad=18);route=[start]
 def animal_clear(a,b):
  steps=max(1,math.ceil(math.dist([a['x'],a['y']],[b['x'],b['y']])/4))
  return all(clear({'x':a['x']+(b['x']-a['x'])*j/steps,'y':a['y']+(b['y']-a['y'])*j/steps},18)for j in range(steps+1))
 for dx,dy in [(40,25),(-40,25),(40,-25),(-40,-25),(25,40),(-25,40),(25,-40),(-25,-40)]:
  loop=[start,{'x':start['x']+dx,'y':start['y']},{'x':start['x']+dx,'y':start['y']+dy},{'x':start['x'],'y':start['y']+dy}]
  if all(animal_clear(a,b)for a,b in zip(loop,loop[1:]+loop[:1])):route=loop;break
 else:
  for dx,dy in [(40,0),(-40,0),(0,40),(0,-40)]:
   q={'x':start['x']+dx,'y':start['y']+dy}
   if animal_clear(start,q):route=[start,q];break
  else:raise ValueError(f'No native roaming corridor beside {animal["id"]}')
 animal['route']=[{**p,'dwell':3+j%3}for j,p in enumerate(route)]
 if animal['id'] in ['park-dog','park-cat']:m['activities'].append({'id':animal['id'],'action':animal['action'],'label':animal['label'],'radius':65,**start})
# A connected reference corridor graph uses original streets and footpaths;
# A* only routes metadata around conservative supports, never paints the PNG.
STEP=10;cols=769;rows=513;blocked=set()
for y in range(rows):
 for x in range(cols):
  if not clear({'x':x*STEP,'y':y*STEP}):blocked.add((x,y))
# Isolated decorative pockets are not entrances. All interaction arrivals use
# the main continuous city pavement component.
from collections import deque
unseen={(x,y)for y in range(1,rows)for x in range(1,cols)if (x,y)not in blocked};main_component=set()
while unseen:
 start=unseen.pop();component={start};queue=deque([start])
 while queue:
  x,y=queue.popleft()
  for v in [(x+1,y),(x-1,y),(x,y+1),(x,y-1)]:
   if v in unseen:unseen.remove(v);component.add(v);queue.append(v)
 if len(component)>len(main_component):main_component=component
print('Main native passage cells',len(main_component),flush=True)
def gridpoint(p):
 g=(round(p['x']/STEP),round(p['y']/STEP))
 if g in main_component:return g
 for r in range(1,80):
  for dx,dy in sorted(((dx,dy)for dx in range(-r,r+1)for dy in range(-r,r+1)if max(abs(dx),abs(dy))==r),key=lambda q:q[0]**2+q[1]**2):
   v=(g[0]+dx,g[1]+dy)
   if 0<v[0]<cols and 0<v[1]<rows and v in main_component:return v
 raise ValueError(f'No grid corridor {p}')
def segment_clear(a,b):
 steps=math.ceil(math.dist(a,b)/4)
 return all(clear({'x':round(a[0]+(b[0]-a[0])*j/max(1,steps)),'y':round(a[1]+(b[1]-a[1])*j/max(1,steps))})for j in range(steps+1))
def route(a,b):
 start,end=gridpoint(a),gridpoint(b);heap=[(0,start)];scores={start:0};parent={};done=set()
 while heap:
  _,u=heapq.heappop(heap)
  if u in done:continue
  if u==end:break
  done.add(u)
  for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
   v=(u[0]+dx,u[1]+dy)
   if v in blocked or not 0<v[0]<cols or not 0<v[1]<rows:continue
   cost=scores[u]+1
   if cost<scores.get(v,1e9):scores[v]=cost;parent[v]=u;heapq.heappush(heap,(cost+abs(v[0]-end[0])+abs(v[1]-end[1]),v))
 else:raise ValueError(f'No source route {a} -> {b}')
 points=[[end[0]*STEP,end[1]*STEP]];u=end
 while u!=start:u=parent[u];points.append([u[0]*STEP,u[1]*STEP])
 points.reverse();points=points
 # Only remove vertices when the full segment remains physically clear.
 simple=[points[0]];i=0
 while i<len(points)-1:
  j=min(len(points)-1,i+30)
  while j>i+1 and not segment_clear(points[i],points[j]):j-=1
  simple.append(points[j]);i=j
 return simple
streetchains=[[(126,8),(28,270),(13,303)],[(621,9),(569,183),(527,339),(474,494),(422,636),(356,807),(302,996)],[(503,4),(465,144),(420,285),(388,414),(335,580),(284,730),(208,958)],[(797,3),(720,134)],[(1269,2),(1220,171),(1175,313)],[(87,303),(381,420),(679,490),(816,536)],[(65,503),(353,609),(605,704),(970,810),(1340,886),(1509,946)],[(20,659),(249,748),(528,850),(878,960),(1050,1020)],[(194,18),(456,75),(767,157)],[(968,718),(1205,790),(1490,903)],[(708,451),(711,409),(683,309),(717,260),(792,268),(844,338),(890,390),(845,453),(792,485)]]
for j,chain in enumerate(streetchains):
 for i,(aa,bb)in enumerate(zip(chain,chain[1:])):
  a,b=safe(xy(*aa)),safe(xy(*bb));m['roads'].append({'id':f'native-route-{j+1}-{i+1}','kind':'walkway','width':30,'points':route(a,b),'source_trace':[list(aa),list(bb)]})
# Public/private doors are actual reachable graph endpoints.
for b in occupied:
 g=gridpoint(b['door']);b['door']={'x':g[0]*STEP,'y':g[1]*STEP}
 # Exiting an interior places the feet 24world below the threshold.
 if not all(clear({'x':b['door']['x'],'y':b['door']['y']+dy})for dy in [24,25,28]):
  for rr in range(5,241,5):
   options=[{'x':b['door']['x']+dx,'y':b['door']['y']+dy}for dx in range(-rr,rr+1,5)for dy in range(-rr,rr+1,5)if max(abs(dx),abs(dy))==rr]
   candidate=next((q for q in options if q['x']%STEP==0 and q['y']%STEP==0 and clear(q)and all(clear({'x':q['x'],'y':q['y']+dy})for dy in [24,25,28])and gridpoint(q)==(round(q['x']/STEP),round(q['y']/STEP))),None)
   if candidate:b['door']=candidate;break
  else:raise ValueError(f'Blocked exit threshold {b["id"]}')
for key,p in m['landmarks'].items():
 g=gridpoint(p);m['landmarks'][key]={'x':g[0]*STEP,'y':g[1]*STEP}
m['spawn']=dict(m['landmarks']['station']);m['district']['spawn']=dict(m['landmarks']['district']);m['smoking']['door']=dict(m['landmarks']['smoking'])
m['boats'][1]['boarding'].update(m['landmarks']['dock'])
dog=next(a for a in m['activities']if a['id']=='park-dog')
for dx,dy in [(55,5),(50,10),(-50,10),(50,-10),(-50,-10),(0,55)]:
 arrival={'x':dog['x']+dx,'y':dog['y']+dy}
 if clear(arrival):m['landmarks']['park']=arrival;break
else:raise ValueError('No source park arrival with room beside the dog')
for b in occupied:
 candidates=[{'x':v[0],'y':v[1]}for r in m['roads']for v in r['points']];target=min(candidates,key=lambda q:math.dist([q['x'],q['y']],[b['door']['x'],b['door']['y']]))
 points=route(b['door'],target);rid=f'entrance-{b["id"]}';m['roads'].append({'id':rid,'kind':'walkway','width':30,'points':points});m['architecture']['frontages'].append({'id':f'frontage-{b["id"]}','building_id':b['id'],'door':dict(b['door']),'path':points,'width':30,'connection':{'road_id':rid},'baked_scene':True})
m['arrival_route']={'points':route(m['spawn'],m['landmarks']['welcome'])};m['arrival_route']['walking_seconds']=round(sum(math.dist(a,b)for a,b in zip(m['arrival_route']['points'],m['arrival_route']['points'][1:]))/m['movement_speed'],3)
m['action_routes']=[]
for boat in m['boats']:
 target=boat['boarding'];points=route(m['landmarks']['park'],target)
 if segment_clear(points[-1],[target['x'],target['y']]):points.append([target['x'],target['y']])
 m['action_routes'].append({'id':f'boat-board-{boat["id"]}','from':'park','points':points,'target':dict(target)})
for activity in m['activities']:
 if activity['action']=='fishing':
  points=route(m['landmarks']['park'],activity)
  if segment_clear(points[-1],[activity['x'],activity['y']]):points.append([activity['x'],activity['y']])
  m['action_routes'].append({'id':activity['id'],'from':'park','points':points,'target':dict(activity)})

# Source map labels/boats/park art remain exactly as supplied. Live overlays
# are deliberately not masqueraded as erased baked characters or vessels.
m['design_source']['baked_details']=['labels','vegetation','buildings','street_furniture','park','water','railway','stationary_vehicles','reference_boats','reference_people']
(WEB/'world-map.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n');(WEB/'animals-map.json').write_text(json.dumps(animals,ensure_ascii=False,indent=2)+'\n')
i=json.loads((WEB/'interiors-map.json').read_text())
for room in i['rooms']:room['door']=next(b['door']for b in m['buildings']if b['id']==room['id'])
(WEB/'interiors-map.json').write_text(json.dumps(i,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'schema':19,'source':m['design_source']['source_sha256'],'solids':len(m['solids']),'buildings':len(occupied+m['background_buildings']),'routes':len(m['roads'])}))

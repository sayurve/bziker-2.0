import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveDesignAsset} from '../web/design-assets.js';
import {sourceInteriorDetailLayout,sourceInteriorRoomAssetRequests,sourceFurnitureAssetId} from '../web/source-interiors.js';

const {rooms:publicRooms}=JSON.parse(await readFile(new URL('../web/interiors-map.json',import.meta.url),'utf8'));
const rooms=publicRooms;

test('every modular public wall light is anchored on the rear wall and leaves no invisible floor collision',()=>{
 assert.equal(rooms.length,11);
 for(const room of rooms){
  assert.ok(!room.props.some(p=>p.type==='lamp'),`${room.id}: native wall light still floats at a former floor-lamp position`);
  assert.ok(!room.solids.some(p=>p.prop_id==='lamp'),`${room.id}: obsolete lamp obstacle remains in the aisle`);
  const lights=sourceInteriorDetailLayout(room).filter(d=>/-(wall-lamp|sconce)$/.test(d.assetId));
  assert.ok(lights.length>=2&&lights.length<=8,`${room.id}: use a readable set of wall fixtures`);
  const ordered=lights.toSorted((a,b)=>a.bounds.x-b.bounds.x);
  for(let i=1;i<ordered.length;i++)assert.ok(ordered[i].bounds.x>=ordered[i-1].bounds.x+ordered[i-1].bounds.width+12,`${room.id}: fixtures need actual separation`);
  if(room.id==='messages')assert.ok(ordered.at(-1).bounds.x-ordered[0].bounds.x>(room.bounds.right-room.bounds.left)*.6,'bar fixtures belong on separate sides, not clustered beside the window');
  for(const light of lights){const asset=resolveDesignAsset(light.assetId);
  assert.equal(light.layer,'background');assert.equal(light.collision,false);assert.equal(light.interactive,false);
  assert.ok(light.bounds.y>=6&&light.bounds.y+light.bounds.height<=room.bounds.top,`${room.id}: light extends into a walkway`);
  assert.ok(light.bounds.x>=room.bounds.left&&light.bounds.x+light.bounds.width<=room.bounds.right,`${room.id}: light covers a side wall or doorway`);
  const visibleWidth=light.crop==='solid'?light.bounds.width:light.bounds.width*(asset.solid_bbox[2]-asset.solid_bbox[0])/asset.width;
  assert.ok(visibleWidth>=12,`${room.id}: native light is too small to read`);
  assert.ok(sourceInteriorRoomAssetRequests(room).some(request=>request.id===light.assetId),'wall light must participate in the actual lazy room preload');}
 }
});

test('public wall lighting does not add a fixture to custom clan bases or remap their own lamps',()=>{
 const base={id:'custom-clan-base',kind:'base',width:900,height:680,bounds:{left:28,right:872,top:78,bottom:652},props:[{id:'my-lamp',type:'lamp',x:210,y:310,width:28,height:24}]};
 assert.deepEqual(sourceInteriorDetailLayout(base),[]);
 assert.equal(sourceFurnitureAssetId({type:'lamp'},'modern'),null,'user floor lamps keep their existing furniture renderer');
 assert.equal(base.props[0].y,310);
});

export const worldViewportHeight=(viewportHeight,top)=>Math.max(120,viewportHeight-Math.max(0,top));
/** Native public rooms keep source-coordinate padding in their canvas. Frame
 * the actual clipped walls/floor, while retaining a small edge around them. */
export function interiorCameraBounds(room,margin=24){
 if(room?.modular_source!==true)return null;
 const valid=clip=>clip&&['x','y','width','height'].every(k=>Number.isFinite(clip[k]))&&clip.width>0&&clip.height>0;
 const clips=(room.surfaces||[]).map(surface=>surface.clip).filter(valid);
 if(!clips.length)return null;
 clips.push(...(room.wall_cutaway?.regions||[]).filter(valid));
 for(const detail of room.details||[]){
  const v=detail.visual;if(!valid(v))continue;
  const anchorX=Number.isFinite(v.anchorX)?v.anchorX:.5,anchorY=Number.isFinite(v.anchorY)?v.anchorY:1;
  clips.push({x:v.x-v.width*anchorX,y:v.y-v.height*anchorY,width:v.width,height:v.height});
 }
 return {left:Math.max(0,Math.min(...clips.map(c=>c.x))-margin),right:Math.min(room.width,Math.max(...clips.map(c=>c.x+c.width))+margin),top:Math.max(0,Math.min(...clips.map(c=>c.y))-margin),bottom:Math.min(room.height,Math.max(...clips.map(c=>c.y+c.height))+margin)};
}
/** Reserve space below the physical feet for controls; align the world origin
 * to device pixels. This changes the view only, never saved coordinates. */
export function worldCamera({width,height,dpr=1,zoom=1,sceneWidth,sceneHeight,position,sceneBounds}){
 const rawScale=Math.min(height/650,width/350,1.45)*zoom,requested=Math.max(Math.ceil(width/sceneWidth*dpr)/dpr,Math.round(rawScale*dpr)/dpr);
 const bottom=height<360?72:114,desiredFoot=Math.max(80,Math.min(height*.56,height-bottom));
 const framed=sceneBounds&&['left','right','top','bottom'].every(k=>Number.isFinite(sceneBounds[k]))&&sceneBounds.right>sceneBounds.left&&sceneBounds.bottom>sceneBounds.top;
 // City/private-base zoom retains its previous exact calculation. Public
 // interiors alone cap it to their visible height above the touch controls.
 // Fine zoom steps avoid halving people when the available fit is just below1.
 // The origin still snaps to physical pixels; very short views stop at .5
 // and pan rather than shrinking people without a lower bound.
 const step=1/(8*dpr),fit=framed?Math.max(.5,Math.floor((height-bottom)/(sceneBounds.bottom-sceneBounds.top)/step+1e-9)*step):requested;
 const scale=framed?Math.min(requested,fit):requested,vw=width/scale,vh=height/scale;
 // Quantize both ends of tracking before clamping. Rounding their difference
 // instead can alternate the hero's screen pixel at half-pixel view centres.
 const pixels=scale*dpr;
 const trackedX=(Math.round(position.x*pixels)-Math.round(width*dpr/2))/pixels;
 const trackedY=(Math.round(position.y*pixels)-Math.round(desiredFoot*dpr))/pixels;
 const clampFrame=(value,low,high)=>high<low?(low+high)/2:Math.max(low,Math.min(high,value));
 const x=framed?clampFrame(trackedX,sceneBounds.left,sceneBounds.right-vw):Math.max(0,Math.min(Math.max(0,sceneWidth-vw),trackedX));
 const y=framed?clampFrame(trackedY,sceneBounds.top,sceneBounds.bottom-vh+bottom/scale):Math.max(0,Math.min(Math.max(0,sceneHeight-vh+bottom/scale),trackedY));
 return {scale,width:vw,height:vh,x:Math.round(x*scale*dpr)/(scale*dpr),y:Math.round(y*scale*dpr)/(scale*dpr)};
}

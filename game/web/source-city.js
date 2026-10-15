import {drawDesignAsset,resolveDesignAsset,designCrop,designDestination,designData,preloadDesignAssets} from './design-assets.js';
import {isModularCity,citySceneEntities,cityGroundEntity,citySupport} from './city-scene.js';
export {isModularCity} from './city-scene.js';

/** Archived v19 proof renderer. Modular maps never use full-scene artwork. */
export const isExactSourceCity=map=>!isModularCity(map)&&map?.design_source?.exact_scene===true;
let exactNativeImage=null,exactForegrounds=null,exactPropForegrounds=null,exactCanvasFactory=null;
export async function preloadExactSourceCity(loader,environment={}){
 exactCanvasFactory=environment.createCanvas||exactCanvasFactory;
 const result=await preloadDesignAssets(['city-source-map'],loader);exactNativeImage=result[0]||null;exactForegrounds=null;exactPropForegrounds=null;return result;
}
const exactCanvas=(w,h)=>{
 if(exactCanvasFactory)return exactCanvasFactory(w,h);
 if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(w,h);
 if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas;}
 return null;
};
function nativeFoliageMasks(){
 if(exactForegrounds)return exactForegrounds;if(!exactNativeImage)return [];
 const canvas=exactCanvas(1536,1024);if(!canvas)return [];
 const c=canvas.getContext('2d');c.drawImage(exactNativeImage,0,0);const raw=c.getImageData(0,0,1536,1024),data=raw.data;
 const green=new Uint8Array(1536*1024);for(let i=0;i<green.length;i++){const k=i*4,r=data[k],g=data[k+1],b=data[k+2];green[i]=g>45&&g>r*1.04&&g>b*1.12?1:0;}
 // Flat lawn pixels are ground, not foliage occluders. A local texture
 // measure retains the bright/dark leaf clusters and excludes smooth grass.
 const textured=new Uint8Array(green.length),cell=8;
 for(let y=0;y<1024;y+=cell)for(let x=0;x<1536;x+=cell){let n=0,sum=0,square=0;
  for(let yy=y;yy<Math.min(y+cell,1024);yy++)for(let xx=x;xx<Math.min(x+cell,1536);xx++){const p=yy*1536+xx;if(!green[p])continue;const value=data[p*4+1];n++;sum+=value;square+=value*value;}
  if(n<10||square/n-(sum/n)**2<210)continue;
  for(let yy=y;yy<Math.min(y+cell,1024);yy++)for(let xx=x;xx<Math.min(x+cell,1536);xx++)textured[yy*1536+xx]=green[yy*1536+xx];
 }
 green.set(textured);
 const regions=[],seen=new Uint8Array(green.length);
 for(let i=0;i<green.length;i++){
  if(!green[i]||seen[i])continue;const queue=[i];seen[i]=1;let left=1536,top=1024,right=0,bottom=0;
  for(let n=0;n<queue.length;n++){const p=queue[n],x=p%1536,y=Math.floor(p/1536);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
   for(const q of [p-1,p+1,p-1536,p+1536])if(q>=0&&q<green.length&&Math.abs(q%1536-x)<=1&&green[q]&&!seen[q]){seen[q]=1;queue.push(q);}
  }
  if(queue.length<110||right-left<7||bottom-top<7)continue;
  // Adjacent forest crowns may share pixels. Keep their exact silhouettes in
  // compact patches so an entire block cannot acquire one foreground depth.
  const size=64;for(let y=top;y<=bottom;y+=size)for(let x=left;x<=right;x+=size){
   const w=Math.min(size,right-x+1),h=Math.min(size,bottom-y+1),mask=exactCanvas(w,h);if(!mask)continue;
   const mc=mask.getContext('2d'),rgba=mc.createImageData(w,h);let count=0,last=0;
   for(const p of queue){const xx=p%1536-x,yy=Math.floor(p/1536)-y;if(xx<0||yy<0||xx>=w||yy>=h)continue;const out=(yy*w+xx)*4,k=p*4;for(let channel=0;channel<4;channel++)rgba.data[out+channel]=data[k+channel];count++;last=Math.max(last,yy);}
   if(count<60)continue;mc.putImageData(rgba,0,0);regions.push({mask,x,y,width:w,height:h,depth:y+last});
  }
 }
 exactForegrounds=regions;return regions;
}

// Local object outlines were checked on enlarged native crops of the approved
// city PNG. They describe visible heads/posts/body panels, independently from
// the tiny physical supports. No pavement crop or colour threshold is used.
const nativePropContours=[
 ["native-lamp-north-1",65,[[218.5,43],[220.5,43],[223.5,46],[223.5,53],[220.5,56],[220.5,62],[222.5,63],[222.5,65],[216.5,65],[216.5,63],[218.5,62],[218.5,56],[215.5,53],[215.5,46]]],
 ["native-lamp-north-2",100,[[423,76],[425,76],[427,79],[427,84],[425,87],[425,97],[428,98],[428,100],[420,100],[420,98],[423,97],[423,87],[421,84],[421,79]]],
 ["native-lamp-north-3",176,[[475,152],[477,152],[478.5,155],[478.5,161],[477,164],[476.5,173],[477.5,174],[477.5,176],[473.5,176],[473.5,174],[474.5,173],[475,164],[473.5,161],[473.5,155]]],
 ["native-lamp-north-4",163,[[149,145],[151,145],[153,148],[153,154],[151,157],[151,160],[153,161],[153,163],[147,163],[147,161],[149,160],[149,157],[147,154],[147,148]]],
 ["native-lamp-north-5",208,[[218.5,194],[221.5,194],[220.5,195],[220.5,205],[222.5,206],[222.5,208],[216.5,208],[216.5,206],[218.5,205],[218.5,195]]],
 ["native-lamp-north-6",324,[[164.5,295],[166.5,295],[169.0,298],[169.0,310],[166.5,313],[165.5,321],[166.5,322],[166.5,324],[162.5,324],[162.5,322],[163.5,321],[164.5,313],[162.0,310],[162.0,298]]],
 ["native-lamp-north-7",296,[[208.5,281],[210.5,281],[212.5,284],[212.5,288],[210.5,291],[210.5,293],[212.5,294],[212.5,296],[206.5,296],[206.5,294],[208.5,293],[208.5,291],[206.5,288],[206.5,284]]],
 ["native-lamp-north-8",366,[[400,337],[402,337],[404.5,340],[404.5,349],[402,352],[401.5,363],[403.5,364],[403.5,366],[397.5,366],[397.5,364],[399.5,363],[400,352],[397.5,349],[397.5,340]]],
 ["native-lamp-north-9",88,[[427,62],[429,62],[430.5,65],[430.5,70],[429,73],[427.5,85],[428.5,86],[428.5,88],[424.5,88],[424.5,86],[425.5,85],[427,73],[425.5,70],[425.5,65]]],
 ["native-lamp-north-10",322,[[775.5,293],[777.5,293],[779.5,296],[779.5,298],[777.5,301],[777,319],[780,320],[780,322],[772,322],[772,320],[775,319],[775.5,301],[773.5,298],[773.5,296]]],
 ["native-lamp-north-11",507,[[807,479],[809,479],[811.5,482],[811.5,486],[809,489],[808.5,504],[810.5,505],[810.5,507],[804.5,507],[804.5,505],[806.5,504],[807,489],[804.5,486],[804.5,482]]],
 ["native-lamp-north-12",130,[[604,109],[606,109],[607.5,112],[607.5,114],[606,117],[606,127],[609,128],[609,130],[601,130],[601,128],[604,127],[604,117],[602.5,114],[602.5,112]]],
 ["native-lamp-north-13",176,[[632,153],[634,153],[636,156],[636,158],[634,161],[634,173],[636,174],[636,176],[630,176],[630,174],[632,173],[632,161],[630,158],[630,156]]],
 ["native-lamp-north-14",205,[[630.5,178],[632.5,178],[635.5,181],[635.5,186],[632.5,189],[632,202],[634,203],[634,205],[628,205],[628,203],[630,202],[630.5,189],[627.5,186],[627.5,181]]],
 ["native-lamp-north-15",358,[[608.5,332],[610.5,332],[612.5,335],[612.5,337],[610.5,340],[610,355],[612,356],[612,358],[606,358],[606,356],[608,355],[608.5,340],[606.5,337],[606.5,335]]],
 ["native-lamp-north-16",440,[[681,410],[683,410],[686,413],[686,419],[683,422],[683,437],[685,438],[685,440],[679,440],[679,438],[681,437],[681,422],[678,419],[678,413]]],
 ["native-lamp-north-17",470,[[716,435],[718,435],[721.5,438],[721.5,450],[718.5,453],[718.0,467],[720.5,468],[720.5,470],[712.5,470],[712.5,468],[715.0,467],[715.5,453],[712.5,450],[712.5,438]]],
 ["native-lamp-north-18",216,[[842.5,184],[844.5,184],[847.5,187],[847.5,194],[844.5,197],[844,213],[847,214],[847,216],[839,216],[839,214],[842,213],[842.5,197],[839.5,194],[839.5,187]]],
 ["native-lamp-north-19",240,[[846,215],[848,215],[852,218],[852,230],[848,233],[847.5,237],[849.5,238],[849.5,240],[843.5,240],[843.5,238],[845.5,237],[846,233],[842,230],[842,218]]],
 ["native-lamp-north-20",281,[[880,253],[882,253],[884.5,256],[884.5,262],[882,265],[882,278],[884,279],[884,281],[878,281],[878,279],[880,278],[880,265],[877.5,262],[877.5,256]]],
 ["native-lamp-north-21",282,[[929,247],[931,247],[934.5,250],[934.5,264],[931.5,267],[930.5,279],[933,280],[933,282],[925,282],[925,280],[927.5,279],[928.5,267],[925.5,264],[925.5,250]]],
 ["native-lamp-north-22",329,[[991,291],[993,291],[996,294],[996,304],[993.5,307],[993.0,326],[995.5,327],[995.5,329],[987.5,329],[987.5,327],[990.0,326],[990.5,307],[988,304],[988,294]]],
 ["native-lamp-north-23",352,[[1020,324],[1022,324],[1024.5,327],[1024.5,332],[1022,335],[1021.5,349],[1023.5,350],[1023.5,352],[1017.5,352],[1017.5,350],[1019.5,349],[1020,335],[1017.5,332],[1017.5,327]]],
 ["native-lamp-north-24",360,[[1143.5,328],[1145.5,328],[1148.0,331],[1148.0,338],[1145.5,341],[1145,357],[1148,358],[1148,360],[1140,360],[1140,358],[1143,357],[1143.5,341],[1141.0,338],[1141.0,331]]],
 ["native-lamp-north-25",405,[[1256,379],[1258,379],[1260,382],[1260,384],[1258,387],[1257.5,402],[1259.5,403],[1259.5,405],[1253.5,405],[1253.5,403],[1255.5,402],[1256,387],[1254,384],[1254,382]]],
 ["native-lamp-north-26",429,[[1292.5,399],[1294.5,399],[1297.5,402],[1297.5,409],[1294.5,412],[1294,426],[1296,427],[1296,429],[1290,429],[1290,427],[1292,426],[1292.5,412],[1289.5,409],[1289.5,402]]],
 ["native-lamp-north-27",444,[[1309,416],[1311,416],[1313.5,419],[1313.5,422],[1311,425],[1311,441],[1313,442],[1313,444],[1307,444],[1307,442],[1309,441],[1309,425],[1306.5,422],[1306.5,419]]],
 ["native-lamp-north-28",349,[[1201,333],[1207,333],[1210,338],[1209,347],[1207,349],[1200,348],[1199,341]]],
 ["native-lamp-north-29",349,[[1099,329],[1101,329],[1102.5,332],[1102.5,333],[1101,336],[1101,346],[1103,347],[1103,349],[1097,349],[1097,347],[1099,346],[1099,336],[1097.5,333],[1097.5,332]]],
 ["native-lamp-north-30",334,[[1084.5,311],[1086.5,311],[1089.0,314],[1089.0,324],[1087.0,327],[1086.5,331],[1088,332],[1088,334],[1082,334],[1082,332],[1083.5,331],[1084.0,327],[1082.0,324],[1082.0,314]]],
 ["native-lamp-north-31",307,[[1034.5,278],[1036.5,278],[1039.5,281],[1039.5,289],[1036.5,292],[1036,304],[1038,305],[1038,307],[1032,307],[1032,305],[1034,304],[1034.5,292],[1031.5,289],[1031.5,281]]],
 ["native-lamp-north-32",123,[[1146.5,103],[1148.5,103],[1150.5,106],[1150.5,109],[1148.5,112],[1148,120],[1149,121],[1149,123],[1145,123],[1145,121],[1146,120],[1146.5,112],[1144.5,109],[1144.5,106]]],
 ["native-vehicle-north-33",50,[[109,28],[115,29],[118,33],[115,43],[111,49],[106,50],[103,46],[104,37]]],
 ["native-vehicle-north-34",82,[[100,61],[106,63],[109,67],[105,77],[101,82],[95,81],[91,78],[92,71],[96,63]]],
 ["native-vehicle-north-35",111,[[82,87],[89,90],[91,95],[87,105],[82,111],[76,110],[74,105],[78,94]]],
 ["native-vehicle-north-36",196,[[445,174],[451,176],[453,180],[449,190],[445,196],[439,195],[436,192],[439,181]]],
 ["native-vehicle-north-37",335,[[185,312],[192,315],[192,320],[188,329],[183,335],[177,333],[175,330],[179,320]]],
 ["native-vehicle-north-38",344,[[212,321],[219,324],[219,329],[215,339],[210,344],[204,342],[202,338],[206,328]]],
 ["native-vehicle-north-39",354,[[231,329],[238,332],[240,337],[236,347],[231,354],[223,352],[221,348],[225,338]]],
 ["native-vehicle-north-40",373,[[390,348],[397,350],[399,355],[395,366],[390,373],[383,371],[381,367],[385,358]]],
 ["native-vehicle-north-41",466,[[0,447],[5,445],[17,450],[24,454],[23,461],[19,466],[8,461],[0,457]]],
 ["native-vehicle-north-42",194,[[570,170],[577,172],[580,177],[577,187],[572,194],[565,192],[562,188],[565,178]]],
 ["native-vehicle-north-43",227,[[561,202],[568,204],[570,209],[566,219],[561,227],[554,225],[551,221],[555,211]]],
 ["native-vehicle-north-44",110,[[1235,82],[1242,85],[1244,90],[1240,100],[1235,110],[1227,108],[1224,104],[1228,93]]],
 ["native-vehicle-north-45",70,[[1289,52],[1294,54],[1295,58],[1292,66],[1288,70],[1283,68],[1283,63],[1286,55]]],
 ["native-planter-north-46",333,[[379,316],[386,316],[389,320],[386,331],[383,333],[377,330],[376,322]]],
 ["native-planter-north-47",285,[[128,274],[135,273],[138,276],[136,284],[132,285],[127,282]]],
 ["native-planter-north-48",258,[[980,246],[985,246],[988,249],[986,257],[981,258],[977,254],[977,250]]],
 ["native-lamp-south-1",783.0,[[410.0,757],[412.0,757],[414.0,760],[415.0,763.5],[414.0,768],[412.0,770],[412.0,779.0],[414.0,781.0],[414.0,783.0],[408.0,783.0],[408.0,781.0],[410.0,779.0],[410.0,770],[408.0,768],[407.0,763.5],[408.0,760]]],
 ["native-lamp-south-2",807.0,[[491,789],[494,789],[496,792],[496,797],[494,800],[493,800],[493,804],[495,807],[495,809],[489,809],[489,807],[491,804],[491,800],[488,798],[488,793],[489,791]]],
 ["native-lamp-south-3",551.0,[[781.0,515],[783.0,515],[785.0,518],[786.0,521.5],[785.0,526],[783.0,528],[783.0,547.0],[785.0,549.0],[785.0,551.0],[779.0,551.0],[779.0,549.0],[781.0,547.0],[781.0,528],[779.0,526],[778.0,521.5],[779.0,518]]],
 ["native-lamp-south-4",663.0,[[624.0,630],[626.0,630],[628.0,633],[629.0,636.5],[628.0,641],[626.0,643],[626.0,659.0],[628.0,661.0],[628.0,663.0],[622.0,663.0],[622.0,661.0],[624.0,659.0],[624.0,643],[622.0,641],[621.0,636.5],[622.0,633]]],
 ["native-lamp-south-5",654.0,[[744.0,625],[746.0,625],[748.0,628],[749.0,631.5],[748.0,636],[746.0,638],[746.0,650.0],[748.0,652.0],[748.0,654.0],[742.0,654.0],[742.0,652.0],[744.0,650.0],[744.0,638],[742.0,636],[741.0,631.5],[742.0,628]]],
 ["native-lamp-south-6",595.0,[[891.0,566],[893.0,566],[895.0,569],[896.0,572.5],[895.0,577],[893.0,579],[893.0,591.0],[895.0,593.0],[895.0,595.0],[889.0,595.0],[889.0,593.0],[891.0,591.0],[891.0,579],[889.0,577],[888.0,572.5],[889.0,569]]],
 ["native-lamp-south-7",588.0,[[906.0,535],[908.0,535],[910.0,538],[911.0,541.5],[910.0,546],[908.0,548],[908.0,584.0],[910.0,586.0],[910.0,588.0],[904.0,588.0],[904.0,586.0],[906.0,584.0],[906.0,548],[904.0,546],[903.0,541.5],[904.0,538]]],
 ["native-lamp-south-8",643.0,[[916.0,611],[918.0,611],[920.0,614],[921.0,617.5],[920.0,622],[918.0,624],[918.0,639.0],[920.0,641.0],[920.0,643.0],[914.0,643.0],[914.0,641.0],[916.0,639.0],[916.0,624],[914.0,622],[913.0,617.5],[914.0,614]]],
 ["native-lamp-south-9",656.0,[[924.0,628],[926.0,628],[928.0,631],[929.0,634.5],[928.0,639],[926.0,641],[926.0,652.0],[928.0,654.0],[928.0,656.0],[922.0,656.0],[922.0,654.0],[924.0,652.0],[924.0,641],[922.0,639],[921.0,634.5],[922.0,631]]],
 ["native-lamp-south-10",685.0,[[962.0,659],[964.0,659],[966.0,662],[967.0,665.5],[966.0,670],[964.0,672],[964.0,681.0],[966.0,683.0],[966.0,685.0],[960.0,685.0],[960.0,683.0],[962.0,681.0],[962.0,672],[960.0,670],[959.0,665.5],[960.0,662]]],
 ["native-lamp-south-11",683.0,[[1015.0,650],[1017.0,650],[1019.0,653],[1020.0,656.5],[1019.0,661],[1017.0,663],[1017.0,679.0],[1019.0,681.0],[1019.0,683.0],[1013.0,683.0],[1013.0,681.0],[1015.0,679.0],[1015.0,663],[1013.0,661],[1012.0,656.5],[1013.0,653]]],
 ["native-lamp-south-12",783.0,[[979.0,765],[981.0,765],[983.0,768],[984.0,770.0],[983.0,773.0],[981.0,775.0],[981.0,779.0],[983.0,781.0],[983.0,783.0],[977.0,783.0],[977.0,781.0],[979.0,779.0],[979.0,775.0],[977.0,773.0],[976.0,770.0],[977.0,768]]],
 ["native-lamp-south-13",836.0,[[554.0,804],[556.0,804],[558.0,807],[559.0,810.5],[558.0,815],[556.0,817],[556.0,832.0],[558.0,834.0],[558.0,836.0],[552.0,836.0],[552.0,834.0],[554.0,832.0],[554.0,817],[552.0,815],[551.0,810.5],[552.0,807]]],
 ["native-lamp-south-14",969.0,[[947.0,941],[949.0,941],[951.0,944],[952.0,947.5],[951.0,952],[949.0,954],[949.0,965.0],[951.0,967.0],[951.0,969.0],[945.0,969.0],[945.0,967.0],[947.0,965.0],[947.0,954],[945.0,952],[944.0,947.5],[945.0,944]]],
 ["native-lamp-south-15",907.0,[[1015.0,878],[1017.0,878],[1019.0,881],[1020.0,884.5],[1019.0,889],[1017.0,891],[1017.0,903.0],[1019.0,905.0],[1019.0,907.0],[1013.0,907.0],[1013.0,905.0],[1015.0,903.0],[1015.0,891],[1013.0,889],[1012.0,884.5],[1013.0,881]]],
 ["native-lamp-south-16",931.0,[[973,895],[997,899],[997,932],[992,934],[990,928],[979,925],[978,932],[973,931]]],
 ["native-lamp-south-17",709.0,[[1126.0,690],[1128.0,690],[1130.0,693],[1131.0,695.5],[1130.0,699.0],[1128.0,701.0],[1128.0,705.0],[1130.0,707.0],[1130.0,709.0],[1124.0,709.0],[1124.0,707.0],[1126.0,705.0],[1126.0,701.0],[1124.0,699.0],[1123.0,695.5],[1124.0,693]]],
 ["native-lamp-south-18",724.0,[[1177.0,686],[1179.0,686],[1181.0,689],[1182.0,692.5],[1181.0,697],[1179.0,699],[1179.0,720.0],[1181.0,722.0],[1181.0,724.0],[1175.0,724.0],[1175.0,722.0],[1177.0,720.0],[1177.0,699],[1175.0,697],[1174.0,692.5],[1175.0,689]]],
 ["native-lamp-south-19",628.0,[[1281.0,598],[1283.0,598],[1285.0,601],[1286.0,604.5],[1285.0,609],[1283.0,611],[1283.0,624.0],[1285.0,626.0],[1285.0,628.0],[1279.0,628.0],[1279.0,626.0],[1281.0,624.0],[1281.0,611],[1279.0,609],[1278.0,604.5],[1279.0,601]]],
 ["native-lamp-south-20",627.0,[[1316.0,596],[1318.0,596],[1320.0,599],[1321.0,602.5],[1320.0,607],[1318.0,609],[1318.0,623.0],[1320.0,625.0],[1320.0,627.0],[1314.0,627.0],[1314.0,625.0],[1316.0,623.0],[1316.0,609],[1314.0,607],[1313.0,602.5],[1314.0,599]]],
 ["native-lamp-south-21",544.0,[[1362.0,509],[1364.0,509],[1366.0,512],[1367.0,515.5],[1366.0,520],[1364.0,522],[1364.0,540.0],[1366.0,542.0],[1366.0,544.0],[1360.0,544.0],[1360.0,542.0],[1362.0,540.0],[1362.0,522],[1360.0,520],[1359.0,515.5],[1360.0,512]]],
 ["native-lamp-south-22",584.0,[[1355.0,565],[1357.0,565],[1359.0,568],[1360.0,570.5],[1359.0,574.0],[1357.0,576.0],[1357.0,580.0],[1359.0,582.0],[1359.0,584.0],[1353.0,584.0],[1353.0,582.0],[1355.0,580.0],[1355.0,576.0],[1353.0,574.0],[1352.0,570.5],[1353.0,568]]],
 ["native-lamp-south-23",910.0,[[1051,891],[1053,892],[1055,896],[1055,900],[1053,903],[1052,903],[1052,907],[1054,910],[1054,912],[1048,912],[1048,910],[1050,907],[1050,903],[1047,900],[1047,895],[1049,892]]],
 ["native-lamp-south-24",923.0,[[1128,894],[1130,894],[1132,897],[1133,901],[1132,905],[1130,907],[1130,920],[1132,923],[1132,925],[1126,925],[1126,923],[1128,920],[1128,907],[1126,905],[1125,901],[1126,897]]],
 ["native-lamp-south-25",953.0,[[1155.0,919],[1157.0,919],[1159.0,922],[1160.0,925.5],[1159.0,930],[1157.0,932],[1157.0,949.0],[1159.0,951.0],[1159.0,953.0],[1153.0,953.0],[1153.0,951.0],[1155.0,949.0],[1155.0,932],[1153.0,930],[1152.0,925.5],[1153.0,922]]],
 ["native-lamp-south-26",936.0,[[1193.0,910],[1195.0,910],[1197.0,913],[1198.0,916.5],[1197.0,921],[1195.0,923],[1195.0,932.0],[1197.0,934.0],[1197.0,936.0],[1191.0,936.0],[1191.0,934.0],[1193.0,932.0],[1193.0,923],[1191.0,921],[1190.0,916.5],[1191.0,913]]],
 ["native-lamp-south-27",923.0,[[1192.0,889],[1194.0,889],[1196.0,892],[1197.0,895.5],[1196.0,900],[1194.0,902],[1194.0,919.0],[1196.0,921.0],[1196.0,923.0],[1190.0,923.0],[1190.0,921.0],[1192.0,919.0],[1192.0,902],[1190.0,900],[1189.0,895.5],[1190.0,892]]],
 ["native-lamp-south-28",989.0,[[1086.0,955],[1088.0,955],[1090.0,958],[1091.0,961.5],[1090.0,966],[1088.0,968],[1088.0,985.0],[1090.0,987.0],[1090.0,989.0],[1084.0,989.0],[1084.0,987.0],[1086.0,985.0],[1086.0,968],[1084.0,966],[1083.0,961.5],[1084.0,958]]],
 ["native-car-south-1",529.0,[[291.28,514.0],[297.94,516.0],[301.0,520.0],[293.98,540.0],[290.74,542.0],[284.44,540.0],[283.0,535.0],[287.32,519.0]]],
 ["native-car-south-2",542.0,[[313.28,527.0],[319.94,529.0],[323.0,533.0],[315.98,553.0],[312.74,555.0],[306.44,553.0],[305.0,548.0],[309.32,532.0]]],
 ["native-car-south-3",530.0,[[121.28,515.0],[127.94,517.0],[131.0,521.0],[123.98,541.0],[120.74,543.0],[114.44,541.0],[113.0,536.0],[117.32,520.0]]],
 ["native-car-south-4",636.0,[[373.28,621.0],[379.94,623.0],[383.0,627.0],[375.98,647.0],[372.74,649.0],[366.44,647.0],[365.0,642.0],[369.32,626.0]]],
 ["native-car-south-5",721.0,[[359.28,706.0],[365.94,708.0],[369.0,712.0],[361.98,732.0],[358.74,734.0],[352.44,732.0],[351.0,727.0],[355.32,711.0]]],
 ["native-car-south-6",803.0,[[271.28,788.0],[277.94,790.0],[281.0,794.0],[273.98,814.0],[270.74,816.0],[264.44,814.0],[263.0,809.0],[267.32,793.0]]],
 ["native-car-south-7",919.0,[[319.28,904.0],[325.94,906.0],[329.0,910.0],[321.98,930.0],[318.74,932.0],[312.44,930.0],[311.0,925.0],[315.32,909.0]]],
 ["native-car-south-8",929.0,[[337.28,914.0],[343.94,916.0],[347.0,920.0],[339.98,940.0],[336.74,942.0],[330.44,940.0],[329.0,935.0],[333.32,919.0]]],
 ["native-car-south-9",937.0,[[358.28,922.0],[364.94,924.0],[368.0,928.0],[360.98,948.0],[357.74,950.0],[351.44,948.0],[350.0,943.0],[354.32,927.0]]],
 ["native-car-south-10",590.0,[[669.28,575.0],[675.94,577.0],[679.0,581.0],[671.98,601.0],[668.74,603.0],[662.44,601.0],[661.0,596.0],[665.32,580.0]]],
 ["native-car-south-11",596.0,[[692.28,581.0],[698.94,583.0],[702.0,587.0],[694.98,607.0],[691.74,609.0],[685.44,607.0],[684.0,602.0],[688.32,586.0]]],
 ["native-car-south-12",650.0,[[675.28,635.0],[681.94,637.0],[685.0,641.0],[677.98,661.0],[674.74,663.0],[668.44,661.0],[667.0,656.0],[671.32,640.0]]],
 ["native-car-south-13",702.0,[[799.28,687.0],[805.94,689.0],[809.0,693.0],[801.98,713.0],[798.74,715.0],[792.44,713.0],[791.0,708.0],[795.32,692.0]]],
 ["native-car-south-14",707.0,[[823.28,692.0],[829.94,694.0],[833.0,698.0],[825.98,718.0],[822.74,720.0],[816.44,718.0],[815.0,713.0],[819.32,697.0]]],
 ["native-car-south-15",723.0,[[889.28,708.0],[895.94,710.0],[899.0,714.0],[891.98,734.0],[888.74,736.0],[882.44,734.0],[881.0,729.0],[885.32,713.0]]],
 ["native-car-south-16",859.0,[[673.28,844.0],[679.94,846.0],[683.0,850.0],[675.98,870.0],[672.74,872.0],[666.44,870.0],[665.0,865.0],[669.32,849.0]]],
 ["native-car-south-17",883.0,[[787.28,868.0],[793.94,870.0],[797.0,874.0],[789.98,894.0],[786.74,896.0],[780.44,894.0],[779.0,889.0],[783.32,873.0]]],
 ["native-car-south-18",898.0,[[815.28,883.0],[821.94,885.0],[825.0,889.0],[817.98,909.0],[814.74,911.0],[808.44,909.0],[807.0,904.0],[811.32,888.0]]],
 ["native-car-south-19",908.0,[[837.28,893.0],[843.94,895.0],[847.0,899.0],[839.98,919.0],[836.74,921.0],[830.44,919.0],[829.0,914.0],[833.32,898.0]]],
 ["native-car-south-20",920.0,[[864.28,905.0],[870.94,907.0],[874.0,911.0],[866.98,931.0],[863.74,933.0],[857.44,931.0],[856.0,926.0],[860.32,910.0]]],
 ["native-car-south-21",1018.0,[[597.28,1003.0],[603.94,1005.0],[607.0,1009.0],[599.98,1029.0],[596.74,1031.0],[590.44,1029.0],[589.0,1024.0],[593.32,1008.0]]],
 ["native-planter-south-1",621.0,[[498.5,607.0],[512.5,609.0],[516.5,612.0],[515.5,620.0],[512.5,621.0],[497.5,618.0],[495.5,611.0]]],
 ["native-planter-south-2",647.0,[[575.0,633.0],[588.0,635.0],[592.0,638.0],[591.0,646.0],[588.0,647.0],[574.0,644.0],[572.0,637.0]]],
 ["native-planter-south-3",685.0,[[799.0,671.0],[810.0,673.0],[814.0,676.0],[813.0,684.0],[810.0,685.0],[798.0,682.0],[796.0,675.0]]],
 ["native-planter-south-4",690.0,[[825.0,676.0],[836.0,678.0],[840.0,681.0],[839.0,689.0],[836.0,690.0],[824.0,687.0],[822.0,680.0]]],
 ["native-planter-south-5",846.0,[[587.0,832.0],[602.0,834.0],[606.0,837.0],[605.0,845.0],[602.0,846.0],[586.0,843.0],[584.0,836.0]]],
 ["native-planter-south-6",976.0,[[1107,943],[1133,947],[1133,977],[1128,979],[1126,973],[1113,970],[1112,977],[1107,976]]],
];
// The original train and platform canopies have diagonal ground edges. Narrow
// source-pixel strips give each visible part its local depth; using the far
// carriage corner would hide actors standing in front of the opposite end.
const nativeRailContours=[
 ['native-train-coach-1',[[1100,194],[1165,211]],[[1102,163],[1166,179],[1165,194],[1162,210],[1101,193],[1098,185]]],
 ['native-train-coach-2',[[1170,211],[1235,228]],[[1172,180],[1237,196],[1237,211],[1235,227],[1170,211],[1168,202]]],
 ['native-train-coach-3',[[1240,229],[1354,258]],[[1245,200],[1358,230],[1355,244],[1354,258],[1240,230],[1240,218],[1242,207]]],
 ['native-train-coach-4',[[1359,257],[1425,275]],[[1362,232],[1418,248],[1424,256],[1428,268],[1423,275],[1357,257],[1357,244]]],
 ['native-platform-1',[[789,88],[868,105]],[[787,57],[870,76],[868,91],[866,105],[789,88],[784,81],[784,71]]],
 ['native-platform-2',[[844,169],[895,181]],[[843,142],[902,154],[900,169],[894,183],[840,169],[839,158],[840,149]]],
 ['native-platform-3',[[1114,242],[1176,256]],[[1114,214],[1181,221],[1178,237],[1176,257],[1114,242],[1113,228]]],
];
const nativeBridgePostContours=[
 ['native-rail-bridge-post-1',240,[[1198,141],[1203,142],[1196,235],[1193,240],[1187,238],[1188,233]]],
 ['native-rail-bridge-post-2',246,[[1225,147],[1230,148],[1219,242],[1220,246],[1211,244],[1212,239]]],
];
function nativeRailStrips(){
 const strips=[];
 for(const [id,line,polygon]of nativeRailContours){
  const left=Math.floor(Math.min(...polygon.map(p=>p[0]))),right=Math.ceil(Math.max(...polygon.map(p=>p[0]))),[a,b]=line;
  for(let x=left;x<right;x+=8){
   const end=Math.min(x+8,right),sample=Math.max(a[0],Math.min(b[0],(x+end)/2));
   const depth=a[1]+(b[1]-a[1])*(sample-a[0])/(b[0]-a[0]);
   strips.push([`${id}-${x-left}`,depth,polygon,x,end]);
  }
 }
 return strips;
}
const insideNativeContour=(x,y,polygon)=>{
 let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;
};
function nativePropMasks(){
 if(exactPropForegrounds)return exactPropForegrounds;if(!exactNativeImage)return [];
 const source=exactCanvas(1536,1024);if(!source)return [];
 const sc=source.getContext('2d');sc.drawImage(exactNativeImage,0,0);const data=sc.getImageData(0,0,1536,1024).data,regions=[];
 for(const [id,depth,polygon,stripLeft=0,stripRight=1536]of [...nativePropContours,...nativeBridgePostContours,...nativeRailStrips()]){
  const x=Math.max(0,stripLeft,Math.floor(Math.min(...polygon.map(p=>p[0])))),y=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p[1]))));
  const right=Math.min(1536,stripRight,Math.ceil(Math.max(...polygon.map(p=>p[0])))),bottom=Math.min(1024,Math.ceil(Math.max(...polygon.map(p=>p[1])))),w=right-x,h=bottom-y;
  if(w<=0||h<=0)continue;const mask=exactCanvas(w,h);if(!mask)continue;const mc=mask.getContext('2d'),rgba=mc.createImageData(w,h);
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(insideNativeContour(x+xx+.5,y+yy+.5,polygon)){
   const i=((y+yy)*1536+x+xx)*4;rgba.data.set(data.subarray(i,i+4),(yy*w+xx)*4);
  }
  mc.putImageData(rgba,0,0);regions.push({id,mask,x,y,width:w,height:h,depth});
 }exactPropForegrounds=regions;return regions;
}
export function sourceCityExactObjects(map){
 if(!isExactSourceCity(map))return [];
 const scale=map.design_source.scale||5,objects=[];
 for(const b of [...map.buildings||[],...map.district?.buildings||[],...map.background_buildings||[]]){
  const box=b.design?.source_bounds,polygon=b.design?.foreground_polygon;if(!box||!Array.isArray(polygon)||polygon.length<3)continue;
  const bounds={x:box[0]*scale,y:box[1]*scale,width:box[2]*scale,height:box[3]*scale};
  objects.push({id:`native-foreground-${b.id}`,depth:b.y+b.height,bounds,draw(c){c.save();c.beginPath();polygon.forEach((p,i)=>i?c.lineTo(p[0]*scale,p[1]*scale):c.moveTo(p[0]*scale,p[1]*scale));c.closePath();c.clip();drawExactSourceCity(c,map,bounds);c.restore();}});
 }
 for(const [i,r]of nativeFoliageMasks().entries()){
  const bounds={x:r.x*scale,y:r.y*scale,width:r.width*scale,height:r.height*scale};
  objects.push({id:`native-canopy-${i}`,depth:r.depth*scale,bounds,draw(c){c.imageSmoothingEnabled=false;c.drawImage(r.mask,bounds.x,bounds.y,bounds.width,bounds.height);}});
 }
 for(const r of nativePropMasks()){
  const bounds={x:r.x*scale,y:r.y*scale,width:r.width*scale,height:r.height*scale};
  objects.push({id:`native-prop-${r.id}`,depth:r.depth*scale,bounds,draw(c){c.imageSmoothingEnabled=false;c.drawImage(r.mask,bounds.x,bounds.y,bounds.width,bounds.height);}});
 }
 return objects;
}
export function drawExactSourceCity(c,map,view=null){
 if(!isExactSourceCity(map)||!c||!Number.isFinite(map.width)||!Number.isFinite(map.height))return false;
 c.save();c.imageSmoothingEnabled=false;
 if(view&&['x','y','width','height'].every(k=>Number.isFinite(view[k]))){c.beginPath();c.rect(view.x,view.y,view.width,view.height);c.clip();}
 const drawn=drawDesignAsset(c,'city-source-map',0,0,map.width,map.height,{anchorX:0,anchorY:0});
 c.restore();return drawn;
}

/** Source sprites are fitted to authored supports; saved doors and collision
 * footprints remain the authority. All sprite points use a bottom anchor. */
export const sourcePublicBuildingAssets=Object.freeze({
 railway:'railway-station',clans:'clan-base-modern-clubhouse',arena:'shopping-mall-bzik-hub',
 profile:'clothing-shop',results:'clan-base-stone-mansion',messages:'bar-pivkovy-tuz',
 terrace:'clan-base-wood-clubhouse','shop-food':'food-kiosk','shop-clothes':'clothing-shop',
 'shop-furniture':'furniture-store',casino:'casino-modern',hub:'shopping-mall-bzik-hub',bar:'bar-pivkovy-tuz',
});
export const sourceClanHouseAssets=Object.freeze([
 'clan-base-modern-clubhouse','clan-base-brick-loft','clan-base-tech-headquarters',
 'clan-base-wood-clubhouse','clan-base-stone-mansion','ordinary-house-red-brick-view-front',
]);
/** Measured centre of each provided lower staircase, relative to solid crop. */
export const sourceClanDoorAnchors=Object.freeze({
 'clan-base-modern-clubhouse':{x:.465,y:1},'clan-base-brick-loft':{x:.458,y:1},
 'clan-base-tech-headquarters':{x:.433,y:1},'clan-base-wood-clubhouse':{x:.453,y:1},
 'clan-base-stone-mansion':{x:.45,y:1},'construction-site-compact':{x:.533,y:1},
 'ordinary-house-red-brick-view-front':{x:.60,y:1},
});
const residential=Object.freeze(['ordinary-house-grey-panel','ordinary-house-red-brick','ordinary-house-beige-panel']);
const trees=Object.freeze(['tree-oak','tree-birch','tree-maple','tree-linden','tree-willow','tree-poplar','tree-pine','tree-spruce']);
const benches=Object.freeze(['bench-long-wood','bench-medium-metal','bench-short-backless']);
const flowers=Object.freeze(['flowerbed-tulips','flowerbed-daisies','flowerbed-petunias']);
export const sourceVehicleAssets=Object.freeze(['vehicle-mercedes-cabriolet','vehicle-zaporozhets','vehicle-bentley','vehicle-g-wagen','vehicle-pickup','vehicle-sports-coupe','vehicle-compact-hatchback']);
const streetIds=['streetlight-classic','streetlights','street-bin','smoking-area','smoking-area-map-variant','smoking-area-bench','smoking-area-ashtray-bin','smoking-area-paved-pad','construction-site-compact','construction-site-large','city-parking-empty','city-tennis-court','city-basketball-court','source-road-asphalt-tile'];
export const sourceCityAssetIds=Object.freeze([...new Set([...Object.values(sourcePublicBuildingAssets),...sourceClanHouseAssets,...residential,...trees,...benches,...flowers,...streetIds,...sourceVehicleAssets])]);
const hash=(x=0,y=0)=>{let n=Math.imul(Math.round(x),374761393)^Math.imul(Math.round(y),668265263);n=Math.imul(n^(n>>>13),1274126177);return (n^(n>>>16))>>>0;};
const valid=n=>Number.isFinite(n)&&n>0;
export const sourceClanAssetId=style=>sourceClanHouseAssets[Number.isInteger(style)&&style>=0&&style<sourceClanHouseAssets.length?style:0];
export function sourceTreeAssetId(kind='round',x=0,y=0){
 if(trees.includes(kind))return kind;if(trees.includes(`tree-${kind}`))return `tree-${kind}`;
 const n=hash(x,y);
 return kind==='birch'?'tree-birch':kind==='pine'?trees[6+n%2]:[trees[0],trees[2],trees[3],trees[4],trees[5]][n%5];
}
export const sourceBenchAssetId=(x=0,y=0)=>benches[hash(x,y)%benches.length];
export const sourceFlowerAssetId=(x=0,y=0)=>flowers[hash(x,y)%flowers.length];
function fitAssetBounds(assetId,anchor,width,height,anchorX=.5,anchorY=1,direction='front',crop=null){
 const asset=resolveDesignAsset(assetId,direction),content=designCrop(asset,{crop}),ratio=valid(content?.width)&&valid(content?.height)?content.width/content.height:width/height;
 const w=Math.min(width,height*ratio),h=w/ratio;
 return {x:anchor.x-w*anchorX,y:anchor.y-h*anchorY,width:w,height:h};
}
/** Every modular instance names an independent source resource and its native
 * view. The declared anchor applies to its solid crop, not its transparent box. */
export function sourceEntityLayout(entity){
 const d=entity?.design;
 if(!d?.assetId||d.assetId==='city-source-map'||!['x','y','width','height'].every(k=>Number.isFinite(d[k]))||!valid(d.width)||!valid(d.height))return null;
 const direction=d.direction||'front',asset=resolveDesignAsset(d.assetId,direction);if(!asset)return null;
 const anchor={x:d.x,y:d.y},anchorX=d.anchorX??.5,anchorY=d.anchorY??1,crop=d.crop||'solid',footprint=citySupport(entity);
 const componentCrop=d.componentCrop,rotation=Number.isFinite(d.rotation)?d.rotation:0;
 // Only the supplied flat pier plank may be used as a ground component. Tall
 // furniture/buildings retain independent native views, never flat rotation.
 if((componentCrop||rotation)&&(!cityGroundEntity(entity)||d.assetId!=='bziker-water-pier'))return null;
 if(rotation&&!componentCrop)return null;
 if(componentCrop&&(!['x','y','width','height'].every(k=>Number.isFinite(componentCrop[k]))||componentCrop.x<0||componentCrop.y<0||componentCrop.width<=0||componentCrop.height<=0||componentCrop.x+componentCrop.width>asset.width||componentCrop.y+componentCrop.height>asset.height))return null;
 const destination=designDestination(componentCrop?{width:componentCrop.width,height:componentCrop.height}:asset,anchor.x,anchor.y,d.width,d.height,{anchorX,anchorY,crop:componentCrop?null:crop});
 let bounds=destination;
 if(rotation){const cos=Math.cos(rotation),sin=Math.sin(rotation),points=[[destination.x,destination.y],[destination.x+destination.width,destination.y],[destination.x+destination.width,destination.y+destination.height],[destination.x,destination.y+destination.height]].map(([x,y])=>({x:anchor.x+(x-anchor.x)*cos-(y-anchor.y)*sin,y:anchor.y+(x-anchor.x)*sin+(y-anchor.y)*cos})),xs=points.map(p=>p.x),ys=points.map(p=>p.y);bounds={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};}
 return {assetId:d.assetId,anchor,width:d.width,height:d.height,anchorX,anchorY,direction,crop,bounds,destination,componentCrop,rotation,footprint,depth:Number.isFinite(entity.depth)?entity.depth:footprint?footprint.y+footprint.height:d.y};
}
/** The receiving opening was measured at (291,272) in the street-bin PNG.
 * Interaction coordinates describe the free approach, below the artwork. */
export function sourceBinSlot(entity){
 const layout=sourceEntityLayout(entity);
 if(layout?.assetId!=='street-bin'||layout.rotation)return null;
 const asset=resolveDesignAsset(layout.assetId,layout.direction),crop=designCrop(asset,{crop:layout.crop}),b=layout.destination;
 return {x:b.x+(291-crop.x)*b.width/crop.width,y:b.y+(272-crop.y)*b.height/crop.height};
}
const moduleBitmaps=new Map();let moduleCanvasFactory=null;
function sourceModuleBitmap(r){
 const asset=resolveDesignAsset(r.assetId,r.direction);if(!asset)return null;
 const key=asset.url;if(moduleBitmaps.has(key))return moduleBitmaps.get(key);
 const raw=moduleCanvasFactory?moduleCanvasFactory(asset.width,asset.height):typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(asset.width,asset.height):typeof document!=='undefined'?Object.assign(document.createElement('canvas'),{width:asset.width,height:asset.height}):null;
 if(!raw)return null;const c=raw.getContext('2d');
 if(!drawDesignAsset(c,r.assetId,0,0,asset.width,asset.height,{anchorX:0,anchorY:0,direction:r.direction}))return null;
 moduleBitmaps.set(key,raw);return raw;
}
export function drawSourceEntity(c,entity){
 const r=sourceEntityLayout(entity);if(!r)return false;
 if(!r.componentCrop&&!r.rotation)return drawDesignAsset(c,r.assetId,r.anchor.x,r.anchor.y,r.width,r.height,{anchorX:r.anchorX,anchorY:r.anchorY,direction:r.direction,crop:r.crop});
 const native=sourceModuleBitmap(r);if(!native)return false;const crop=r.componentCrop||designCrop(resolveDesignAsset(r.assetId,r.direction),{crop:r.crop}),b=r.destination;
 c.save();c.imageSmoothingEnabled=false;c.translate(r.anchor.x,r.anchor.y);c.rotate(r.rotation);c.drawImage(native,crop.x,crop.y,crop.width,crop.height,b.x-r.anchor.x,b.y-r.anchor.y,b.width,b.height);c.restore();return true;
}
export function sourceCityModuleObjects(map){
 if(!isModularCity(map))return [];
 return citySceneEntities(map).filter(e=>!cityGroundEntity(e)).flatMap(entity=>{const r=sourceEntityLayout(entity);return r?[{...entity,...r,draw(c){return drawSourceEntity(c,entity);}}]:[];});
}
export function sourceCityGroundObjects(map,environment={}){
 if(environment.createCanvas)moduleCanvasFactory=environment.createCanvas;
 if(!isModularCity(map))return [];
 return citySceneEntities(map).filter(cityGroundEntity).flatMap(entity=>{const r=sourceEntityLayout(entity);return r?[{...entity,...r,draw(c){return drawSourceEntity(c,entity);}}]:[];});
}
export function sourceBuildingLayout(b,occupant=null){
 if(b?.design?.assetId&&Object.hasOwn(b,'footprint')){
  if(!occupant||!b.id?.startsWith('base-'))return sourceEntityLayout(b);
  const design=b.design,assetId=sourceClanAssetId(occupant.exterior_style),doorAnchor=sourceClanDoorAnchors[assetId],initial=sourceEntityLayout(b);
  if(!initial||!doorAnchor)return null;
  const content=designCrop(resolveDesignAsset(assetId),{crop:design.crop||'solid'}),height=design.width*content.height/content.width;
  const supplied=design.doorAnchor,doorTarget=design.doorTarget||(supplied?{x:initial.bounds.x+initial.bounds.width*supplied.x,y:initial.bounds.y+initial.bounds.height*supplied.y}:b.door?{x:b.door.x,y:b.door.y-(design.doorOffsetY??0)}:null);
  if(!doorTarget)return null;
  return {...sourceEntityLayout({...b,design:{...design,assetId,height,x:doorTarget.x,y:doorTarget.y,anchorX:doorAnchor.x,anchorY:doorAnchor.y}}),doorAnchor,doorTarget};
 }
 if(!b||!valid(b.width)||!valid(b.height)||!Number.isFinite(b.x)||!Number.isFinite(b.y))return null;
 const design=b.design||{},occupiedBase=b.id?.startsWith('base-')&&occupant,assetId=occupiedBase?sourceClanAssetId(occupant.exterior_style):design.assetId||b.source_asset||sourcePublicBuildingAssets[b.id]||(b.id?.startsWith('base-')?sourceClanAssetId(occupant?.exterior_style):b.kind==='apartment'||b.id?.startsWith('apartment-')?residential[(Number(b.id?.split('-').at(-1))||1)%residential.length]:null);
 if(!assetId)return null;
 const anchor={x:Number.isFinite(design.x)?design.x:b.door?.x??b.x+b.width/2,y:Number.isFinite(design.y)?design.y:b.y+b.height+15};
 const crop='solid',width=valid(design.width)?design.width:b.width*1.04,asset=resolveDesignAsset(assetId),content=designCrop(asset,{crop}),height=occupiedBase&&asset?Math.max(b.height+125,width*content.height/content.width):valid(design.height)?design.height:b.height+(b.kind==='apartment'?130+(b.floors||3)*12:125);
 const anchorX=Number.isFinite(design.anchorX)?design.anchorX:.5,anchorY=Number.isFinite(design.anchorY)?design.anchorY:1,direction=design.direction||'front';
 return {assetId,anchor,width,height,anchorX,anchorY,direction,crop,bounds:fitAssetBounds(assetId,anchor,width,height,anchorX,anchorY,direction,crop),footprint:{x:b.x,y:b.y,width:b.width,height:b.height},depth:b.y+b.height};
}
export function drawSourceBuilding(c,b,occupant=null){if(b?.design?.baked_scene&&!occupant&&!Object.hasOwn(b,'footprint'))return true;const r=sourceBuildingLayout(b,occupant);return r?drawDesignAsset(c,r.assetId,r.anchor.x,r.anchor.y,r.width,r.height,{anchorX:r.anchorX,anchorY:r.anchorY,direction:r.direction,crop:r.crop}):false;}
export const drawSourceApartment=(c,b)=>drawSourceBuilding(c,b);

/** Bounds stay within the previous full contour, including shadows. Decorative
 * variation is deterministic, so a source choice cannot flicker between frames. */
export function sourceStreetLayout(type,x,y,options={}){
 if(options.entity?.design)return sourceEntityLayout(options.entity);
 if(options.design)return sourceEntityLayout(options);
 if(!Number.isFinite(x)||!Number.isFinite(y))return null;
 const s=valid(options.size)?options.size:1;
 let assetId,anchor={x,y},width,height,anchorX=.5,depth=y;
 if(type==='tree'){assetId=sourceTreeAssetId(options.kind,x,y);width=175*s;height=235*s;anchor.y=y+28*s;depth=anchor.y;}
 else if(type==='bench'){assetId=sourceBenchAssetId(x,y);width=132;height=64;anchor.x=x+60;anchor.y=y+40;depth=y+25;}
 else if(type==='lamp'){assetId=resolveDesignAsset('streetlight-classic')?'streetlight-classic':'streetlights';width=40;height=112;anchorX=.79;anchor.y=y+8;depth=y+5;}
 else if(type==='flowerbed'){assetId=sourceFlowerAssetId(x,y);width=options.width||72;height=46;anchor.x=x+width/2;anchor.y=y+29;depth=y+24;}
 else if(type==='bin'){assetId=options.smoking?'smoking-area-ashtray-bin':'street-bin';width=45;height=76;anchor.y=y+17;depth=y+15;}
 else if(type==='planter'){assetId=sourceFlowerAssetId(x,y);width=72;height=58;anchor.x=x+3;anchor.y=y+20;depth=y+16;}
 else return null;
 if(options.assetId)assetId=options.assetId;
 const direction=options.direction||'front';
 const crop='solid';
 if(type==='lamp'){const a=resolveDesignAsset(assetId,direction),box=designCrop(a,{crop});if(a&&box.width)anchorX=Math.max(0,Math.min(1,(a.width*.79-box.x)/box.width));}
 return {assetId,anchor,width,height,anchorX,anchorY:1,direction,crop,depth,bounds:fitAssetBounds(assetId,anchor,width,height,anchorX,1,direction,crop)};
}
export function drawSourceStreet(c,type,x,y,options={}){const r=sourceStreetLayout(type,x,y,options);return r?drawDesignAsset(c,r.assetId,r.anchor.x,r.anchor.y,r.width,r.height,{anchorX:r.anchorX,anchorY:r.anchorY,direction:r.direction,crop:r.crop}):false;}
export const drawSourceTree=(c,x,y,size=1,kind='round')=>drawSourceStreet(c,'tree',x,y,{size,kind});
export const drawSourceBench=(c,x,y)=>drawSourceStreet(c,'bench',x,y);
export const drawSourceLamp=(c,x,y)=>drawSourceStreet(c,'lamp',x,y);
export const drawSourceFlowerbed=(c,x,y,width=72)=>drawSourceStreet(c,'flowerbed',x,y,{width});
export const drawSourceBin=(c,x,y,smoking=false)=>drawSourceStreet(c,'bin',x,y,{smoking});
export function drawSourceSmoking(c,zone){
 if(!zone)return false;if(zone.exact_scene)return true;
 const design=zone.design||{},assetId=design.assetId||'smoking-area-map-variant';
 return drawDesignAsset(c,assetId,design.x??zone.x+zone.width/2,design.y??zone.y+zone.height,design.width||zone.width,design.height||zone.height+50,{anchorX:design.anchorX??.5,anchorY:design.anchorY??1,crop:'solid'});
}
export function drawSourceParking(c,parking){
 if(!parking)return false;
 // The source overhead view is a walkable ground layer; no camera rotation is applied.
 return drawDesignAsset(c,'city-parking-empty',parking.x+parking.width/2,parking.y+parking.height,parking.width,parking.height,{anchorX:.5,anchorY:1,direction:'top'});
}
export function sourceCityAreaLayouts(map){
 if(isModularCity(map))return [];
 if(isExactSourceCity(map))return [];
 if(Array.isArray(map?.design_areas))return map.design_areas.flatMap(area=>{
  if(!area.assetId||!['x','y','width','height'].every(k=>Number.isFinite(area[k]))||area.width<=0||area.height<=0)return [];
  const anchor={x:area.x,y:area.y},anchorX=area.anchorX??.5,anchorY=area.anchorY??1,direction=area.direction||'front';
  return [{...area,anchor,anchorX,anchorY,direction,bounds:fitAssetBounds(area.assetId,anchor,area.width,area.height,anchorX,anchorY,direction),depth:area.depth??-1}];
 });
 // Legacy maps have no sports parcels. Their empty south-west lawn is separated
 // from authored routes and the station approach until a map migration supplies them.
 return [{id:'source-tennis',assetId:'city-tennis-court',x:1830,y:4270,width:500,height:340},{id:'source-basketball',assetId:'city-basketball-court',x:2630,y:4270,width:500,height:340}].map(area=>({...area,anchor:{x:area.x,y:area.y},anchorX:.5,anchorY:1,direction:'front',depth:-1,bounds:fitAssetBounds(area.assetId,{x:area.x,y:area.y},area.width,area.height)}));
}
export function drawSourceCityArea(c,area){return drawDesignAsset(c,area.assetId,area.anchor.x,area.anchor.y,area.width,area.height,{anchorX:area.anchorX,anchorY:area.anchorY,direction:area.direction});}

export function sourceVehicleAssetId(vehicle){
 const name=typeof vehicle==='string'?vehicle:vehicle?.assetId||vehicle?.source_asset||vehicle?.model||vehicle?.vehicle_model||vehicle?.id;
 const id=String(name||'').startsWith('vehicle-')?name:`vehicle-${name}`;
 if(designData.assets[id]?.model_id&&String(id).startsWith('vehicle-'))return id;
 const model=sourceVehicleAssets.includes(id)?id:'vehicle-compact-hatchback',colors=designData.assets[model]?.colors;
 const color=String(vehicle?.color_key||vehicle?.color||'').toLowerCase(),named=colors?.[color],exact=Object.values(colors||{}).find(c=>c.color_hex?.toLowerCase()===color);
 return named?.id||exact?.id||model;
}
export function sourceVehicleLayout(vehicle,x,y,width=105,height=115){
 if(!Number.isFinite(x)||!Number.isFinite(y)||!valid(width)||!valid(height))return null;
 const assetId=sourceVehicleAssetId(vehicle),facing=vehicle?.direction||vehicle?.facing||'front',direction=({up:'back',down:'front'})[facing]||(['front','back','left','right'].includes(facing)?facing:'front'),anchor={x,y};
 return {assetId,anchor,width,height,direction,anchorX:.5,anchorY:1,bounds:fitAssetBounds(assetId,anchor,width,height,.5,1,direction),depth:y,vehicle};
}
export function drawSourceVehicle(c,vehicle,x,y,width=105,height=115){
 const r=sourceVehicleLayout(vehicle,x,y,width,height);if(!r)return false;
 const painted=drawDesignAsset(c,r.assetId,x,y,width,height,{anchorX:.5,anchorY:1,direction:r.direction});
 // Keep the native body, windows and reflection intact. A saved colour is
 // shown as a small plate accent, rather than recolouring glass and tyres.
 if(painted&&/^#[0-9a-f]{6}$/i.test(vehicle?.color)){c.fillStyle=vehicle.color;c.fillRect(Math.round(x-6),Math.round(y-r.bounds.height*.21),12,2);}
 return painted;
}
export function sourceParkedVehicleLayouts(map){
 if(isModularCity(map))return [];
 if(isExactSourceCity(map))return [];
 const cars=[],buildings=[...(map?.buildings||[]),...(map?.background_buildings||[]),...(map?.district?.buildings||[])];
 const add=(id,bay,index)=>{
  if(!['x','y','width','height'].every(k=>Number.isFinite(bay[k]))||bay.width<65||bay.height<40)return;
  const width=bay.width*.84,height=bay.height+45,x=bay.x+bay.width/2,y=bay.y+bay.height-7;
  if(buildings.some(b=>b.door&&Math.hypot(x-b.door.x,y-b.door.y)<90))return;
  const model=sourceVehicleAssets[index%sourceVehicleAssets.length],colors=Object.keys(designData.assets[model]?.colors||{}),color_key=colors[index%Math.max(1,colors.length)]||null,direction=['front','right','back','left'][index%4],r=sourceVehicleLayout({model,color_key,direction},x,y,width,height);
  cars.push({...r,id,bay:{...bay},model,color_key,footprint:{x:bay.x+bay.width*.13,y:bay.y+bay.height*.22,width:bay.width*.74,height:bay.height*.65}});
 };
 for(const [index,f] of (map?.architecture?.frontages||[]).entries()){
  if(index%3!==1||!f.parking)continue;
  (f.parking.bays||[f.parking]).slice(0,2).forEach((bay,i)=>add(`parked-${f.id}-${i}`,bay,index+i));
 }
 const station=(map?.design_areas||[]).find(a=>a.id==='station-parking');
 if(station){const left=station.x-station.width/2;for(let i=0;i<2;i++)add(`parked-station-${i}`,{x:left+65+i*145,y:station.y-station.height*.43,width:120,height:85},i+2);}
 return cars;
}

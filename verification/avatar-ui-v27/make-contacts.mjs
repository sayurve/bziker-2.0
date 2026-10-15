/** Crop real browser captures for QA only. Never renders or edits runtime art. */
import{readFile,writeFile,mkdir}from'node:fs/promises';import{createRequire}from'node:module';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';import{parts}from'../../game/web/avatar.js';
const args=process.argv.slice(2),value=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
if(args.includes('--help')){console.log('node verification/avatar-ui-v27/make-contacts.mjs --gender 0 --category hairStyle --source final --label g0-hair-final');process.exit(0);}
const gender=Number(value('--gender','0')),category=value('--category','hairStyle'),source=value('--source','final'),label=value('--label',`g${gender}-${category}-contact`);
if(![0,1].includes(gender)||!Object.hasOwn(parts,category)||category==='gender'||![source,label].every(v=>/^[A-Za-z0-9_-]+$/.test(v)))throw Error('Invalid matrix selection');
const selectedRaw=value('--values',null),selected=selectedRaw?selectedRaw.split(',').map(Number):parts[category].options.map((_,i)=>i);
if(!selected.length||selected.some(n=>!Number.isInteger(n)||n<0||n>=parts[category].options.length)||new Set(selected).size!==selected.length)throw Error('Invalid --values list');
const{createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas'),folder=new URL(source+'/',import.meta.url),out=new URL(label+'/',import.meta.url);await mkdir(out,{recursive:false});
const crop={x:535,y:375,width:135,height:180},dirs=['down','left','up','right'],cases=[],sheets=[];
for(let start=0;start<selected.length;start+=6){const values=selected.slice(start,start+6),sheet=createCanvas(4*220,values.length*300+30),c=sheet.getContext('2d');c.fillStyle='#e8e5dc';c.fillRect(0,0,sheet.width,sheet.height);c.font='15px sans-serif';c.fillStyle='#202629';c.fillText(`ACTUAL UI captures: G${gender} ${category}; 1.5× QA crops, no sprite rerender`,8,20);
 for(let row=0;row<values.length;row++)for(let d=0;d<4;d++){
  const n=values[row],name=parts[category].options[n],file=`g${gender}-${category}-${String(n).padStart(2,'0')}-${dirs[d]}.jpg`,url=new URL(file,folder),raw=await readFile(url),im=await loadImage(fileURLToPath(url));
  if(im.width!==1204||![925,926].includes(im.height))throw Error(`${file}: ${im.width}×${im.height}; fixed crop requires reinspection`);
  const tile=createCanvas(crop.width,crop.height),t=tile.getContext('2d');t.drawImage(im,crop.x,crop.y,crop.width,crop.height,0,0,crop.width,crop.height);const output=file.replace('.jpg','-crop.png');await writeFile(new URL(output,out),tile.toBuffer('image/png'));
  c.imageSmoothingEnabled=false;c.drawImage(tile,d*220+8,row*300+50,202.5,270);c.fillStyle='#202629';c.font='13px sans-serif';c.fillText(`${n} ${name} ${dirs[d]}`,d*220+6,row*300+45,210);
  cases.push({value:n,name,gender,direction:dirs[d],source:`verification/avatar-ui-v27/${source}/${file}`,sourceSha256:createHash('sha256').update(raw).digest('hex'),sourceDimensions:[im.width,im.height],crop,output});
 }
 const file=`page-${start/6+1}.png`;await writeFile(new URL(file,out),sheet.toBuffer('image/png'));sheets.push(file);
}
const manifest={createdAt:new Date().toISOString(),gender,category,source:source,cases:cases.length,crop,qaOnly:true,productionArtChanged:false,realBrowserCaptures:true,renderedMockups:false,scale:1.5,sheets,records:cases};await writeFile(new URL('manifest.json',out),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({out:fileURLToPath(out),cases:cases.length,sheets}));

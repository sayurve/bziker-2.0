import {createRequire} from 'node:module';
import {writeFile,readFile} from 'node:fs/promises';
import {drawAvatarCanvas,avatarGeometry} from '../web/avatar.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const canvas=createCanvas(1440,620),c=canvas.getContext('2d');
c.fillStyle='#eeeae1';c.fillRect(0,0,canvas.width,canvas.height);c.imageSmoothingEnabled=false;
c.fillStyle='#263237';c.font='bold 22px sans-serif';c.fillText('Бзикер · проверка силуэта по присланным персонажам',22,33);
const tiny=await loadImage(await readFile(new URL('./v13-reference-walking-source.png',import.meta.url)));
const snow=await loadImage(await readFile(new URL('./v13-reference-riders-source.png',import.meta.url)));
c.drawImage(tiny,15,0,50,80,20,76,240,384);
c.drawImage(snow,112,296,70,92,280,76,210,276);
c.drawImage(snow,523,91,68,90,510,76,204,270);
c.fillStyle='#263237';c.font='15px sans-serif';c.fillText('Референс ходьбы',20,60);c.fillText('Референс головы мужчины',280,60);c.fillText('Референс головы женщины',510,60);
for(const [index,facing] of ['down','right','up','left'].entries()){
 const x=755+index*165;c.fillStyle='#263237';c.fillText(facing,x,60);
 drawAvatarCanvas(c,{hairColor:0,shirtColor:3},x,76,{scale:4,facing,walking:false});
 drawAvatarCanvas(c,{gender:1,hairStyle:6,hairColor:1,shirtColor:11},x,295,{scale:4,facing,walking:false});
}
c.fillStyle='#263237';c.font='15px sans-serif';c.fillText(`Текущая сетка ${avatarGeometry.width}×${avatarGeometry.height}; справа четыре направления, мужской / женский`,755,563);
const filename=process.argv[2]||'v13-reference-current.png';await writeFile(new URL(filename,import.meta.url),canvas.toBuffer('image/png'));console.log(filename);

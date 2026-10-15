/** Only solid RGB values cross the house UI/server boundary. */
export function normalizeHouseColor(value){return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():null;}
export async function pickScreenColor(EyeDropperType){
 if(typeof EyeDropperType!=='function')return null;
 try{return normalizeHouseColor((await new EyeDropperType().open()).sRGBHex);}
 catch(error){if(error?.name==='AbortError')return null;throw error;}
}
export function previewElementColor(element,preview){
 return element&&preview?.contains(element)?normalizeHouseColor(element.getAttribute?.('fill')):null;
}

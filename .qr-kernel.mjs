import sharp from "sharp";
import jsQR from "jsqr";
const file="C:/Users/admin/Pictures/CCCD HL/5.jpg";
const {width:W,height:H}=await sharp(file).metadata();
function quadrants(width,height,ratio){const hw=width/2,hh=height/2,ox=width*ratio/2,oy=height*ratio/2,rx=hw-ox,by=hh-oy;return[{x:rx,y:0,width:width-rx,height:hh+oy},{x:0,y:0,width:hw+ox,height:hh+oy},{x:rx,y:by,width:width-rx,height:height-by},{x:0,y:by,width:hw+ox,height:height-by}]}
const parent=quadrants(W,H,0.08)[0];
const child=quadrants(parent.width,parent.height,0.12)[0];
const r={x:parent.x+child.x,y:parent.y+child.y,width:child.width,height:child.height};
const left=Math.floor(r.x),top=Math.floor(r.y),width=Math.min(W-left,Math.ceil(r.width)),height=Math.min(H-top,Math.ceil(r.height));
const scale=Math.min(1200/Math.max(width,height),3), ow=Math.round(width*scale),oh=Math.round(height*scale);
for(const kernel of ['nearest','cubic','mitchell','lanczos2','lanczos3']){
 const {data,info}=await sharp(file).extract({left,top,width,height}).resize(ow,oh,{kernel}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let ok=false;try{ok=Boolean(jsQR(new Uint8ClampedArray(data),info.width,info.height,{inversionAttempts:'attemptBoth'})?.data)}catch{}
 console.log(kernel,ok?'PASS':'fail',`${ow}x${oh}`)
}

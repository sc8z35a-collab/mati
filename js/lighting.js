'use strict';
window.EvercityLighting = class EvercityLighting {
  constructor({THREE:T,scene,renderer,player,streetFixtures,vehicles,ambient,sun}){
    Object.assign(this,{T,scene,renderer,player,streetFixtures,vehicles,ambient,sun});this.elapsed=1;this.lastRoom='';this.lastShadowCell='';
    const makeSpot=(color,angle,range,shadow=false)=>{const light=new T.SpotLight(color,0,range,angle,.85,2);light.castShadow=shadow;if(shadow){light.shadow.mapSize.set(1024,1024);light.shadow.bias=-.0002;light.shadow.normalBias=.035;light.shadow.camera.near=.2;}scene.add(light,light.target);return light;};
    this.streetLights=Array.from({length:6},()=>makeSpot('#ffdba5',1.15,27));
    this.roomLights=Array.from({length:6},(_,i)=>makeSpot('#ffe6bf',1.2,17,i<2));
    this.headlights=Array.from({length:2},()=>makeSpot('#d9edff',.46,32));
    this.bounce=new T.PointLight('#ffe4c5',0,35,2);scene.add(this.bounce);
    this.fill=new T.DirectionalLight('#a7d4e2',.3);this.fill.position.set(90,100,-160);scene.add(this.fill);
    // A procedural soft halo emphasizes luminous fixtures; actual surface illumination is supplied by SpotLights.
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,234,186,.75)');g.addColorStop(.12,'rgba(255,226,162,.23)');g.addColorStop(1,'rgba(255,216,142,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);const tex=new T.CanvasTexture(canvas);
    this.halos=this.streetLights.map(()=>{const sprite=new T.Sprite(new T.SpriteMaterial({map:tex,transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:0}));sprite.scale.set(2.4,2.4,1);scene.add(sprite);return sprite;});
  }
  update(dt,building,mode){
    this.elapsed+=dt;if(this.elapsed<.18)return;this.elapsed=0;const p=this.player,night=mode==='night',golden=mode==='golden';const indoor=building&&p.floor<building.floors;
    const nearby=[...this.streetFixtures].sort((a,b)=>(a.x-p.x)**2+(a.z-p.z)**2-((b.x-p.x)**2+(b.z-p.z)**2));
    this.streetLights.forEach((light,i)=>{const f=nearby[i];if(!f)return;light.position.set(f.x,6.35,f.z);light.target.position.set(f.x,.12,f.z+.4);const distance=Math.hypot(f.x-p.x,f.z-p.z);light.intensity=distance<85&&!indoor?(night?420:golden?65:0):0;this.halos[i].position.copy(light.position);this.halos[i].material.opacity=light.intensity>0?(night?.64:.13):0;});
    const fixtures=indoor?[...(building.lights?.[p.floor]||[])].filter(f=>f.enabled!==false&&(building.type!=='residential'||Math.abs(p.x-building.x)<3.4||Math.abs(f.x-building.x)<3.4||Math.sign(f.x-building.x)===Math.sign(p.x-building.x))).sort((a,b)=>(a.x-p.x)**2+(a.z-p.z)**2-((b.x-p.x)**2+(b.z-p.z)**2)):[];
    const roomKey=(indoor?building.id+':'+p.floor:'outside')+':'+fixtures.slice(0,2).map(f=>`${f.x},${f.z}`).join(';')+mode;
    const roomChanged=this.lastRoom!==roomKey;
    this.roomLights.forEach((light,i)=>{const f=fixtures[i];light.intensity=f?f.intensity*(night?2:1.4):0;if(f){light.position.set(f.x,f.y,f.z);light.target.position.set(f.x,f.y-4.5,f.z);light.color.set(f.color);}});
    this.bounce.intensity=indoor?(night?16:9):0;if(indoor)this.bounce.position.set(building.x,p.floor*5.6+3.3,building.z+building.d*.26);
    this.fill.intensity=night?.09:golden?.35:.42;
    const nearestCars=[...this.vehicles].sort((a,b)=>a.g.position.distanceToSquared(new this.T.Vector3(p.x,0,p.z))-b.g.position.distanceToSquared(new this.T.Vector3(p.x,0,p.z)));
    this.headlights.forEach((light,i)=>{const v=nearestCars[i];if(!v)return;const x=v.axis?v.pos:v.lane,z=v.axis?v.lane:v.pos;light.position.set(x+(v.axis?v.dir*2:0),.83,z+(v.axis?0:v.dir*2));light.target.position.set(x+(v.axis?v.dir*20:0),.15,z+(v.axis?0:v.dir*20));light.intensity=night&&!indoor?190:0;});
    // Follow the current district with a detailed sun shadow rather than leaving the outskirts unshadowed.
    const cell=`${Math.round(p.x/65)}:${Math.round(p.z/65)}:${mode}`;
    if(cell!==this.lastShadowCell){const cx=Math.round(p.x/65)*65,cz=Math.round(p.z/65)*65;this.sun.target.position.set(cx,0,cz);this.sun.position.set(cx+(mode==='day'?90:-130),mode==='day'?300:200,cz+95);this.lastShadowCell=cell;this.renderer.shadowMap.needsUpdate=true;}
    if(roomChanged){this.lastRoom=roomKey;this.renderer.shadowMap.needsUpdate=true;}
  }
  snapshot(){return {registeredStreetFixtures:this.streetFixtures.length,streetLights:this.streetLights.filter(l=>l.intensity>0).length,roomLights:this.roomLights.filter(l=>l.intensity>0).length,headlights:this.headlights.filter(l=>l.intensity>0).length};}
};

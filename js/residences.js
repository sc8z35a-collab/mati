'use strict';
window.EvercityResidences = class EvercityResidences {
  constructor(api){this.a=api;this.createMaterials();this.roomsBuilt=0;}
  createMaterials(){
    const {THREE:T,materials:m,mat}=this.a;
    mat('plaster','#ddd8c9',.94);mat('sage','#819285',.95);mat('linen','#cbc4ae',1);mat('walnut','#604737',.7);mat('kitchen','#d8d6c7',.48);mat('marble','#eee9d9',.25);mat('tile','#c7c8bd',.4);mat('rug','#a8ac98',1);mat('terracotta','#b8795b');mat('stainless','#a8b3b1',.25,.85);mat('screen','#244c53',.25,.2,{emissive:'#285763',emissiveIntensity:.6});
    const makeTexture=(kind)=>{const cv=document.createElement('canvas');cv.width=cv.height=512;const c=cv.getContext('2d');
      if(kind==='oak'){
        c.fillStyle='#b18e64';c.fillRect(0,0,512,512);
        for(let row=0;row<16;row++){const y=row*32;c.fillStyle=['#b39a73','#bda27c','#af9067','#c2a981'][row%4];c.fillRect(0,y,512,31);c.strokeStyle='#795e392a';for(let line=0;line<6;line++){c.beginPath();c.moveTo(0,y+4+line*4);c.bezierCurveTo(100,y+line*4,340,y+line*4+9,512,y+line*4+4);c.stroke();}c.fillStyle='#70553555';c.fillRect((row%3)*160,y,1,32);}
      }else{c.fillStyle='#d4d4c8';c.fillRect(0,0,512,512);c.strokeStyle='#939c9366';c.lineWidth=2;for(let x=0;x<=512;x+=64){c.beginPath();c.moveTo(x,0);c.lineTo(x,512);c.stroke();c.beginPath();c.moveTo(0,x);c.lineTo(512,x);c.stroke();}}
      const t=new T.CanvasTexture(cv);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;return t;
    };
    mat('oak','#ffffff',.74,0,{map:makeTexture('oak')});m.tile.map=makeTexture('tile');
    mat('hallCarpet','#59706b',1,0,{map:makeTexture('tile')});
    mat('travertine','#ded1bb',.78,0,{map:makeTexture('oak')});
    // Original architectural prints, shared across floors instead of external image assets.
    for(let style=0;style<3;style++){
      const cv=document.createElement('canvas');cv.width=512;cv.height=512;const ctx=cv.getContext('2d');
      ctx.fillStyle=['#ede5ce','#c3c8bd','#efc7a6'][style];ctx.fillRect(0,0,512,512);
      ctx.fillStyle=['#d5ad70','#aa9071','#bf7353'][style];ctx.beginPath();ctx.arc(340,155,70,0,Math.PI*2);ctx.fill();
      for(let n=0;n<7;n++){ctx.fillStyle=['#4e7162','#53646c','#905f50'][style];ctx.globalAlpha=.25+n*.09;ctx.beginPath();ctx.moveTo(0,300+n*27);ctx.bezierCurveTo(180,110+n*36,240,460-n*21,512,250+n*25);ctx.lineTo(512,512);ctx.lineTo(0,512);ctx.fill();}
      ctx.globalAlpha=1;ctx.fillStyle='#f7f0dc';ctx.font='18px sans-serif';ctx.fillText(['BOTANICAL STUDIES / 01','CITY IN STILLNESS / 02','EARTH & LIGHT / 03'][style],30,468);
      const texture=new T.CanvasTexture(cv);texture.colorSpace=T.SRGBColorSpace;
      mat('residenceArt'+style,'#ffffff',.9,0,{map:texture});
    }
    // Meter-scaled UVs keep boards and tile joints consistent in every apartment size.
    for(const [key,meters] of [['oak',4],['tile',4],['hallCarpet',1.6],['travertine',3]]){
      m[key].onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
        vec4 floorPosition = vec4(position, 1.0);
        vec3 floorNormal = normal;
        #ifdef USE_INSTANCING
          floorPosition = instanceMatrix * floorPosition;
          floorNormal = mat3(instanceMatrix) * floorNormal;
        #endif
        floorPosition = modelMatrix * floorPosition;
        floorNormal = abs(normalize(mat3(modelMatrix) * floorNormal));
        #ifdef USE_MAP
          vMapUv = (floorNormal.y > .5 ? floorPosition.xz : (floorNormal.x > .5 ? floorPosition.zy : floorPosition.xy)) / ${meters.toFixed(2)};
        #endif`);};
      m[key].customProgramCacheKey=()=>`residence-surface-${meters}`;
    }
  }
  build(b,f){
    if(f===0){this.lobby(b);return;}
    const a=this.a,y=a.BASE+f*a.FLOOR;
    b.units=b.units||{};b.units[f]=[];
    for(const side of [-1,1])this.apartment(b,f,side,y);
    this.corridor(b,f,y);
  }
  floorLayout(b){
    // Paint by rectangle subtraction, not stacked full-floor planes. Each X/Z point
    // belongs to exactly one finish; all finishes meet at the same walking height.
    let tiles=[{x0:-b.w/2+.3,x1:b.w/2-.3,z0:-b.d/2+.3,z1:b.d/2-.3,material:'travertine'}];
    const paint=(x0,x1,z0,z1,material)=>{
      const next=[];
      for(const r of tiles){
        const l=Math.max(x0,r.x0),h=Math.min(x1,r.x1),t=Math.max(z0,r.z0),k=Math.min(z1,r.z1);
        if(l>=h||t>=k){next.push(r);continue;}
        for(const [a,c,d,e] of [[r.x0,l,r.z0,r.z1],[h,r.x1,r.z0,r.z1],[l,h,r.z0,t],[l,h,k,r.z1]])if(c-a>1e-6&&e-d>1e-6)next.push({x0:a,x1:c,z0:d,z1:e,material:r.material});
        next.push({x0:l,x1:h,z0:t,z1:k,material});
      }
      tiles=next;
    };
    const width=b.w/2-4.1,depth=b.d-9.4,back=-b.d/2+7.2;
    paint(-2.5,2.5,-b.d/2+7,b.d/2-3,'hallCarpet');
    for(const side of [-1,1]){
      const region=(u,v,w,d,material)=>{const x=side*(3.4+u);paint(x-w/2,x+w/2,back+v-d/2,back+v+d/2,material);};
      region(width/2,depth/2,width,depth,'oak');
      region(1.25,depth*.72,2.5,3.25,'tile');
      region(width-2.15,depth*.44+4.2,4.1,5.9,'tile');
      region(2.85,3.5,5.5,6.9,'tile');
    }
    return tiles;
  }
  floor(b,f){
    const y=this.a.BASE+f*this.a.FLOOR;
    for(const r of this.floorLayout(b)){
      const mesh=this.a.box(r.material,b.x+(r.x0+r.x1)/2,y+.15,b.z+(r.z0+r.z1)/2,r.x1-r.x0,.12,r.z1-r.z0);
      if(mesh.isMesh){mesh.userData.floorSurface='finish';mesh.userData.floorBounds=r;}
    }
  }
  corridor(b,f,y){
    const a=this.a,{box,cyl,solid,fixture}=a,back=b.z-b.d/2+7.2,depth=b.d-9.4,entry=back+depth*.72;
    // Recessed panels and wall-mounted equipment stay outside the 5m clear aisle.
    for(const side of [-1,1]){
      const x=b.x+side*3.27;
      for(let z=back+2;z<entry-2.8;z+=3.8){
        box('walnut',x,y+.92,z,.09,1.35,3.4);
        box('gold',x-side*.055,y+1.64,z,.035,.035,3.4);
        box('gold',x-side*.05,y+2.7,z,.14,.86,.36);box('glow',x-side*.14,y+2.7,z,.065,.58,.25);
      }
      const z=back+3.2;
      box('paper',x-side*.14,y+1.08,z,.27,1.5,1);box('lobbyGlass',x-side*.3,y+1.08,z,.025,1.3,.82);
      cyl('red',x-side*.34,y+.97,z,.16,.79);box('black',x-side*.34,y+1.44,z,.16,.12,.18);
      box('paper',x-side*.1,y+3.28,z,.06,.6,1.7);
      if(a.active())a.roomLabel('FIRE / 消火器',x-side*.15,y+3.28,z,side<0?Math.PI/2:-Math.PI/2,1.5);
      // Entry intercom and a shallow wall-mounted parcel ledge.
      box('black',x-side*.09,y+1.9,entry+1.8,.12,.58,.26);box('screen',x-side*.16,y+2,entry+1.8,.035,.22,.19);
      box('gold',x-side*.17,y+1.76,entry+1.8,.04,.08,.08);
    }
    const lift=b.z-b.d/2+5.29;
    box('travertine',b.x,y+4.67,lift,6.4,.46,.3);
    if(a.active())a.roomLabel(`${String(f+1).padStart(2,'0')}  /  RESIDENCES`,b.x,y+4.68,lift+.18,0,3.8);
    for(let z=back+2;z<b.z+b.d/2-3;z+=6.8){
      box('walnut',b.x,y+5.17,z,6.65,.2,.9);box('glow',b.x,y+5.04,z,3.4,.055,.3);
      fixture(b,f,b.x,y+4.85,z,105,'#ffe2b9');
    }
    // Window-end bench and planter create a shared resting spot, not a blocked corridor.
    const end=b.z+b.d/2-1.25;
    box('walnut',b.x,y+.58,end,3.8,.65,.8);box('linen',b.x,y+.98,end,3.7,.18,.84);solid(b.x,end,3.8,.84);
    for(const dx of [-2.7,2.7]){a.plant(b.x+dx,y+.21,end,.65);solid(b.x+dx,end,.65,.65);}
    // An opaque underside also finishes the top occupied floor consistently.
    box('plaster',b.x,y+5.31,b.z,b.w-.65,.12,b.d-.65);
  }
  lobby(b){
    const {box,plant,sofa,table,bookcase,solid,fixture,BASE:y}=this.a;
    const x=b.x,z=b.z;
    for(const side of [-1,1]){
      const xx=x+side*b.w*.29;
      box('walnut',xx,y+.09,z+3,b.w*.3,.1,b.d*.55);
      sofa(xx,y,z+6);table(xx,y,z+3.5,2.9,1.3);plant(xx-2.6,y,z+5,1.3);
      box('rug',xx,y+.15,z+4,6.4,.04,6);bookcase(xx,y,z-b.d/2+1.3,6);
      fixture(b,0,xx,y+4.65,z+3,145,'#ffe2aa');
    }
    // Concierge reception and mail/parcel wall.
    solid(x+9,z-b.d*.2,6,2);box('walnut',x+9,y+.7,z-b.d*.2,6,1.4,2);box('marble',x+9,y+1.45,z-b.d*.2,6.2,.12,2.15);box('black',x+9,y+1.84,z-b.d*.2,1,.6,.08);
    for(let row=0;row<4;row++)for(let col=0;col<6;col++){box('gold',x-14+col*.9,y+.7+row*.55,z-b.d/2+1.3,.8,.46,.18);box('dark',x-14+col*.9,y+.75+row*.55,z-b.d/2+1.41,.48,.025,.02);}
    for(let n=0;n<3;n++){solid(x-11+n*1.2,z-5,.95,.85);box('paper',x-11+n*1.2,y+.42,z-5,.95,.8,.85);box('wood',x-11+n*1.2,y+.84,z-5,.16,.015,.85);}
    // Full-height parcel lockers, concierge backdrop and a residents' notice board.
    const lockers=x-b.w/2+1.05;
    solid(lockers,z+1,1.15,5.6);box('walnut',lockers,y+1.9,z+1,1.15,3.4,5.6);
    for(let row=0;row<3;row++)for(let col=0;col<5;col++){
      box('kitchen',lockers+.6,y+.85+row*1.05,z-1.2+col*1.1,.05,.97,1.02);
      box('dark',lockers+.64,y+.85+row*1.05,z-1.45+col*1.1,.045,.18,.24);
    }
    for(let n=0;n<19;n++)box('walnut',x+5+n*.45,y+2.55,z-b.d/2+.65,.16,4.6,.15);
    this.a.roomLabel('CONCIERGE / RESIDENT SERVICES',x+9,y+3.35,z-b.d/2+.79,0,7);
    box('walnut',x-8,y+2.7,z-b.d/2+.8,4.8,2.5,.16);box('sage',x-8,y+2.7,z-b.d/2+.9,4.5,2.2,.04);
    for(let n=0;n<3;n++){box('paper',x-9.4+n*1.4,y+2.6,z-b.d/2+.94,1.1,1.4,.025);for(let row=0;row<4;row++)box('teal',x-9.4+n*1.4,y+2.9-row*.18,z-b.d/2+.965,.8,.025,.015);}
    this.a.roomLabel('RESIDENTS / COMMUNITY NEWS',x-8,y+3.65,z-b.d/2+1,0,4.5);
    plant(x+11.1,y+1.51,z-b.d*.2,.28);
    box('paper',x+7.2,y+1.55,z-b.d*.2,.9,.07,.65);box('gold',x+8,y+1.56,z-b.d*.2+.5,.5,.08,.18);
  }
  apartment(b,f,side,y){
    const a=this.a,{box,cyl,ball,part,solid,plant,chair,table,sofa,fixture}=a;
    const width=b.w/2-4.1,depth=b.d-9.4,origin=b.x+side*3.4,back=b.z-b.d/2+7.2;
    const X=u=>origin+side*u,Z=v=>back+v,split=depth*.44,entry=depth*.72;
    const variant=(Math.abs(Math.round(b.x/72))+f+(side>0?1:0))%3;
    const accent=['sage','teal','terracotta'][variant],wood=variant===1?'walnut':'woodLight';
    const emitters=[];
    const B=(m,u,h,v,w,t,d)=>{const mesh=box(m,X(u),y+h,Z(v),w,t,d);if(m==='glow'&&mesh?.isMesh){emitters.push(mesh);mesh.userData.dynamicInterior=true;}return mesh;};
    const S=(u,v,w,d)=>solid(X(u),Z(v),w,d);
    const wall=(u,v,w,d,h=4.25)=>{B('plaster',u,h/2,v,w,h,d);S(u,v,w,d);B(wood,u,.16,v,w+.015,.2,d+.02);};
    const picture=(u,v,w,h,color)=>{B('walnut',u,2.55,v,w+.16,h+.16,.1);B('paper',u,2.55,v+.065,w,h,.035);B(color,u-.15,2.6,v+.09,w*.58,h*.63,.02);B('gold',u+.33,2.85,v+.115,w*.23,h*.32,.02);};
    const pendant=(u,v)=>{cyl('gold',X(u),y+4.7,Z(v),.025,1.4);part('cone',variant===2?'terracotta':'paper',X(u),y+4.05,Z(v),.55,.4,.55);const bulb=cyl('glow',X(u),y+3.86,Z(v),.34,.04);if(bulb?.isMesh)emitters.push(bulb);fixture(b,f,X(u),y+3.78,Z(v),100,'#ffdeb0');};
    // Floor finishes are partitioned once by floor(), never layered per room.
    // Corridor wall, with a genuine 2.3m open apartment doorway (not a teleport).
    wall(0,(entry-1.2)/2,.18,entry-1.2);
    wall(0,(entry+1.2+depth)/2,.18,depth-entry-1.2);
    B(wood,0,3.75,entry,.23,1.05,2.4);
    for(const dz of [-1.2,1.2])B(wood,0,1.8,entry+dz,.25,3.6,.1);
    B('gold',-.13,2.15,entry-1.7,.055,.45,.7);
    // Static room-number plaque, created for active floors only.
    if(a.active())a.roomLabel(`${f+1}${side<0?'01':'02'} / ${['GARDEN','WALNUT','TERRACE'][variant]}`,X(-.18),y+2.4,Z(entry-1.8),side<0?Math.PI/2:-Math.PI/2);
    b.units[f].push({side,origin,back,split,roomNumber:`${f+1}${side<0?'01':'02'}`,entry:{x:X(1.3),z:Z(entry)},living:{x:X(3),z:Z(entry)},targets:{living:{x:X(3),z:Z(entry)},kitchen:{x:X(width-3.1),z:Z(split+4.8)},bedroom:{x:X(8),z:Z(split-2)},secondBedroom:{x:X(4.3),z:Z(10)},bathroom:{x:X(3),z:Z(3.9)}},width,depth,variant});
    wall(width/2,0,width,.17);
    // Bedroom partition has a 2.2m door opening. All rooms remain reachable on foot.
    wall(1,split,2,.17);wall((4.2+width)/2,split,width-4.2,.17);B(wood,3.1,3.75,split,2.2,1.05,.18);
    // Bathroom enclosure and open doorway into its vanity area.
    wall(5.8,3.55,.14,7.1);wall(1,7.1,2,.14);wall(4.9,7.1,1.8,.14);
    const doorV=split-2.1;wall(5.8,(7.1+doorV-1.1)/2,.14,doorV-1.1-7.1);wall(5.8,(doorV+1.1+split)/2,.14,split-doorV-1.1);B(wood,5.8,3.75,doorV,.18,1.05,2.2);
    // A separately partitioned second bedroom doubles as a home office.
    B(wood,1.5,.6,9.55,2.1,.65,4.1);S(1.5,9.55,2.1,4.1);B('linen',1.5,1,9.55,2,.24,4);B(accent,1.5,1.17,10.25,2.02,.1,2.4);B('paper',1.5,1.23,8.05,1.4,.2,.65);B(wood,1.5,1.3,7.44,2.15,1.8,.1);
    // Entry: stone threshold, shoe storage, coat hooks and a full-height mirror.
    B(wood,1.05,.72,entry+2.8,1.9,1.25,.6);S(1.05,entry+2.8,1.9,.6);
    B('stainless',.14,2.25,entry+4.2,.06,2.6,1.3);B('glassLight',.19,2.25,entry+4.2,.035,2.4,1.15);
    for(let n=0;n<3;n++)B('gold',.2,2.45,entry+2.1+n*.35,.28,.08,.06);
    // Living room: layered rug, sofa with cushions, low table, media wall and books.
    const livingV=depth-6.2,livingU=width*.58;
    B('rug',livingU,.29,livingV-1,7.3,.05,6.5);sofa(X(livingU),y+.2,Z(livingV+1.1));
    for(const du of [-1.1,1.1])B(accent,livingU+du,1.36,livingV+1.08,.57,.48,.2);
    B(wood,livingU,.63,livingV-1.5,2.9,.28,1.6);S(livingU,livingV-1.5,2.9,1.6);
    for(const du of [-1.1,1.1])B('gold',livingU+du,.4,livingV-1.5,.08,.45,1.1);
    B('paper',livingU-.6,.8,livingV-1.5,.75,.07,.5);cyl('light',X(livingU+.6),y+.89,Z(livingV-1.5),.12,.2);
    // Television sits beyond the rug so the player can circle every side of the seating area.
    B(wood,livingU,.65,livingV-4.65,5,1.1,.8);S(livingU,livingV-4.65,5,.8);B('black',livingU,1.8,livingV-4.65,3.3,1.9,.1);const tvMesh=B('screen',livingU,1.8,livingV-4.58,3.12,1.7,.025);
    for(let n=0;n<5;n++)B(['paper','art','navy'][n%3],livingU-1.85+n*.2,.76,livingV-4.15,.12,.4,.3);
    plant(X(width-1.1),y+.2,Z(depth-1.4),1.1);
    // Dining area and a kitchen with real cabinetry, sink, tap, induction hob and appliances.
    const kitchenV=split+2.1;
    B('tile',width-2.8,2.07,kitchenV-.63,4.3,.92,.09);
    for(let n=0;n<4;n++){
      const u=width-4.4+n*1.05;B('kitchen',u,.82,kitchenV,1,1.4,1.15);B('gold',u,1.13,kitchenV+.59,.45,.035,.07);S(u,kitchenV,1,1.15);
      B(wood,u,3.15,kitchenV,1,1.12,.56);B('glow',u,2.56,kitchenV+.02,.85,.035,.3);
    }
    B('marble',width-2.8,1.56,kitchenV,4.3,.1,1.25);
    B('stainless',width-4,1.62,kitchenV,.9,.05,.7);B('dark',width-4,1.65,kitchenV,.69,.02,.48);
    cyl('stainless',X(width-4.4),y+1.95,Z(kitchenV-.37),.045,.7);B('stainless',width-4.18,2.28,kitchenV-.37,.45,.07,.07);
    B('black',width-1.55,1.63,kitchenV,1.15,.035,.85);
    for(const du of [-.25,.25])for(const dv of [-.22,.22])cyl('metal',X(width-1.55+du),y+1.66,Z(kitchenV+dv),.17,.015);
    cyl('stainless',X(width-1.8),y+1.84,Z(kitchenV+.2),.21,.32);
    B('stainless',width-1,3,kitchenV,1.5,.16,1);B('stainless',width-1,3.55,kitchenV,.55,1,.4);
    // A hollow refrigerator: the left panel slides over the right, entirely inside
    // its footprint. Shelves and food are actually revealed, not a texture swap.
    const fridgeU=width-.85,fridgeV=kitchenV+3.1;
    S(fridgeU,fridgeV,1.35,1.15);
    B('kitchen',fridgeU,1.8,fridgeV-.52,1.35,3.2,.1);
    for(const du of [-.625,.625])B('stainless',fridgeU+du,1.8,fridgeV,.1,3.2,1.15);
    for(const h of [.24,1,1.8,2.55,3.38])B('paper',fridgeU,h,fridgeV,1.24,.08,1.05);
    for(let row=0;row<3;row++)for(let n=0;n<3;n++){
      B(['paper','sage','terracotta'][n],fridgeU-.4+n*.38,1.19+row*.77,fridgeV+.1,.25,.32,.4);
      B('gold',fridgeU-.4+n*.38,1.37+row*.77,fridgeV+.1,.23,.045,.32);
    }
    const fridgePanel=B('stainless',fridgeU-.32,1.8,fridgeV+.62,.65,3.12,.075);
    const fridgeHandle=B('gold',fridgeU-.1,1.85,fridgeV+.7,.045,.65,.075);
    B('stainless',fridgeU+.32,1.8,fridgeV+.52,.65,3.12,.07);
    // Dining table deliberately outside the entrance-to-bedroom circulation route.
    const diningU=5.2,diningV=split+2.9;table(X(diningU),y+.23,Z(diningV),2.9,1.7);
    for(const du of [-1,1]){chair(X(diningU+du),y+.23,Z(diningV+1.4),0,'linen');chair(X(diningU+du),y+.23,Z(diningV-1.4),Math.PI,'linen');cyl('paper',X(diningU+du),y+1.34,Z(diningV+.3),.28,.025);}
    plant(X(diningU),y+1.3,Z(diningV),.25);pendant(diningU,diningV);
    // Bedroom: upholstered bed, folded throw, bedside lights, built-in wardrobe and workstation.
    const bedU=(6.5+width)/2,bedV=4.4;
    B(wood,bedU,.63,bedV,3.75,.65,5);S(bedU,bedV,3.75,5);B('linen',bedU,1.02,bedV,3.65,.28,4.85);B(accent,bedU,1.2,bedV+1.05,3.66,.12,2.4);B(accent,bedU,1.5,bedV-2.55,3.95,1.85,.17);
    for(const du of [-.95,.95]){B('paper',bedU+du,1.29,bedV-1.75,1.42,.23,.77);B(wood,bedU+du*2.5,.66,bedV-1.7,.7,1.15,.85);cyl('gold',X(bedU+du*2.5),y+1.57,Z(bedV-1.7),.045,.65);part('cone','paper',X(bedU+du*2.5),y+1.99,Z(bedV-1.7),.32,.4,.32);}
    const wardrobeU=width-1;
    // Hollow wardrobe with sliding fronts, a hanging rail and folded clothing.
    const wardrobeV=split-3.3;
    S(wardrobeU,wardrobeV,1.2,3.25);B(wood,wardrobeU+.55,1.8,wardrobeV,.1,3.3,3.25);
    for(const v of [wardrobeV-1.62,wardrobeV+1.62])B(wood,wardrobeU,1.8,v,1.2,3.3,.08);
    for(const h of [.2,1,3.4])B(wood,wardrobeU,h,wardrobeV,1.2,.08,3.25);
    B('gold',wardrobeU,2.9,wardrobeV,.045,.045,3.1);
    for(let n=0;n<5;n++){B(['linen','sage','navy'][n%3],wardrobeU,2.14,wardrobeV-1.1+n*.45,.7,1.12,.18);B('gold',wardrobeU,2.77,wardrobeV-1.1+n*.45,.45,.04,.03);}
    for(let n=0;n<3;n++)B(['paper','terracotta','linen'][n],wardrobeU,.4+n*.15,wardrobeV+.8,.8,.13,.6);
    const cabinetPanel=B(wood,wardrobeU-.62,1.8,wardrobeV-.8,.07,3.22,1.6);
    B(wood,wardrobeU-.52,1.8,wardrobeV+.8,.07,3.22,1.6);
    const cabinetHandle=B('gold',wardrobeU-.68,1.8,wardrobeV-.16,.06,.6,.05);
    picture(bedU,.12,3.1,1.3,accent);
    table(X(2.4),y+.23,Z(split-2.3),2.8,1.1);chair(X(2.4),y+.23,Z(split-1.15),0,'linen');B('black',2.4,1.68,split-2.45,.9,.58,.05);B('paper',3.3,1.34,split-2.3,.5,.05,.65);
    // Bathroom: tiled floor, bathtub with water, shower glass, vanity, mirror, toilet and laundry.
    B('tile',2.85,2.15,.13,5.5,3.8,.08);B('tile',5.68,2.15,3.5,.065,3.8,6.7);
    B('paper',1.8,.72,1.7,2.9,1.05,2.65);S(1.8,1.7,2.9,2.65);B('dark',1.8,1.27,1.7,2.55,.02,2.28);B('water',1.8,1.29,1.7,2.4,.015,2.13);
    cyl('stainless',X(.4),y+1.55,Z(.65),.05,.7);B('stainless',.65,1.9,.65,.55,.06,.07);
    B('lobbyGlass',3.38,2,1.6,.055,3.5,3);B('stainless',3.38,3.78,1.6,.06,.055,3);
    B(wood,4.73,.75,4.6,1.45,1.15,1.1);S(4.73,4.6,1.45,1.1);B('marble',4.73,1.38,4.6,1.5,.1,1.2);B('paper',4.73,1.55,4.6,.8,.26,.6);B('glassLight',5.67,2.35,4.65,.055,1.55,1.5);B('glow',5.6,3.19,4.65,.055,.05,1.5);
    cyl('paper',X(1.1),y+.64,Z(5),.47,.9);B('paper',1.1,1.11,5,.9,.12,1.1);B('paper',1.1,1.15,4.4,.8,1.25,.24);S(1.1,5,.9,1.3);
    B('paper',4.7,.9,1.15,1.25,1.38,1.05);S(4.7,1.15,1.25,1.05);part('sphere','dark',X(4.7),y+.88,Z(1.71),.4,.4,.025);part('sphere','glassLight',X(4.7),y+.88,Z(1.74),.29,.29,.023);B('linen',4.7,1.63,1.15,.85,.12,.55);
    // Curtains, tracks and layered ceiling lights finish the inhabited feel.
    const curtainPanels=[];
    for(const end of [0,1])for(let n=0;n<16;n++){
      const mesh=B('linen',end?width-.45-n*.035:.45+n*.035,2.62,depth-.22+(n%2)*.045,.06,4.55,.12);
      curtainPanels.push({mesh,end,n});
    }
    B('gold',width/2,4.94,depth-.22,width,.05,.09);
    for(const [u,v] of [[livingU,livingV],[bedU,bedV],[2.8,4],[3,10]]){B('glow',u,5.05,v,1.3,.045,.7);fixture(b,f,X(u),y+4.85,Z(v),v===4?95:140,v===4?'#fff1d6':'#ffe5be');}
    // Finishing details: skirting/coving, electrical plates, ventilation, bedding, stationery and toiletries.
    for(const u of [.18,width-.18]){B('paper',u,4.87,depth/2,.15,.2,depth);B(wood,u,.28,depth/2,.08,.13,depth);}
    for(const v of [.18,depth-.3])B('paper',width/2,4.87,v,width,.2,.15);
    for(const v of [entry-2.2,depth-2,split+1]){B('paper',.12,.58,v,.04,.24,.2);for(const dz of [-.045,.045])B('dark',.145,.58,v+dz,.014,.08,.025);}
    B('paper',.13,1.55,entry+1.85,.05,.34,.23);B('metal',.17,1.55,entry+1.85,.04,.21,.14);
    B('paper',width-.18,3.92,split+5.8,.26,.7,2.8);for(let n=0;n<7;n++)B('dark',width-.34,3.68+n*.07,split+5.8,.025,.027,2.5);
    B('black',livingU+.72,.81,livingV-1.05,.14,.045,.48);for(let n=0;n<4;n++)B('paper',livingU+.72,.842,livingV-1.2+n*.07,.075,.012,.025);
    for(const u of [livingU-.7,livingU+.1]){cyl('gold',X(u),y+.87,Z(livingV-1.65),.08,.14);cyl('paper',X(u),y+.955,Z(livingV-1.65),.052,.015);}
    // Open display shelf with books, a bowl and framed print.
    for(const h of [1.7,2.4,3.1]){B(wood,width-.65,h,depth-4.2,1,.09,3);for(let n=0;n<5;n++)B(['paper','navy','terracotta'][n%3],width-.65,h+.23,depth-5.15+n*.26,.65,.38,.13);}
    for(let n=0;n<3;n++){cyl(['teal','gold','paper'][n],X(width-2.7+n*.25),y+1.8,Z(kitchenV-.3),.065,.4);cyl('black',X(width-2.7+n*.25),y+2.015,Z(kitchenV-.3),.07,.045);}
    B(wood,width-3,1.66,kitchenV+.35,.7,.045,.38);B('stainless',width-3,1.7,kitchenV+.35,.35,.035,.04);
    B('metal',width-1.3,2.9,kitchenV+3.71,.18,.18,.025);B('paper',width-.85,2.5,kitchenV+3.73,.52,.7,.025);
    for(let n=0;n<4;n++)B('teal',width-.85,2.65-n*.11,kitchenV+3.75,.36,.018,.015);
    for(const du of [-.15,.15])part('sphere','navy',X(1.3+du),y+.29,Z(entry+.8),.14,.055,.28);
    for(let n=0;n<3;n++){cyl(['teal','paper','terracotta'][n],X(4.25+n*.25),y+1.61,Z(4.3),.065,.26);B('gold',4.25+n*.25,1.79,4.3,.12,.07,.06);}
    B('gold',5.58,1.8,5.9,.08,.06,.9);B('linen',5.5,1.45,5.9,.07,.65,.66);
    B('rug',3.2,.31,3.45,1.4,.035,.62);
    B('paper',4.7,1.82,1.13,.7,.12,.5);B('teal',5.35,1.78,1.15,.21,.56,.26);B('gold',5.35,2.1,1.15,.15,.07,.16);
    for(const n of [0,1,2])B(['paper','sage','navy'][n],3.25,1.36+n*.04,split-2.3,.45,.035,.65);
    // Inhabited details remain on existing furniture footprints, keeping circulation clear.
    for(let n=0;n<7;n++)B(accent,livingU-1.1+n*.12,1.01,livingV+1.23,.08,.025,.95);
    for(let n=0;n<8;n++)B('linen',bedU-1.6+n*.45,1.272,bedV+1.05,.018,.014,2.25);
    for(const du of [-1,1]){B('linen',diningU+du,1.365,diningV+.3,.85,.012,.65);cyl('paper',X(diningU+du),y+1.395,Z(diningV+.3),.26,.02);B('stainless',diningU+du+.34,1.4,diningV+.3,.035,.018,.4);cyl('glassLight',X(diningU+du),y+1.56,Z(diningV-.2),.095,.28);}
    // Espresso machine, cup stack and fruit on the kitchen counter.
    B('dark',width-2.65,1.95,kitchenV,.5,.67,.5);B('stainless',width-2.65,1.75,kitchenV+.26,.52,.06,.24);
    B('gold',width-2.65,2.03,kitchenV+.29,.17,.07,.19);cyl('paper',X(width-2.65),y+1.87,Z(kitchenV+.34),.085,.18);
    for(let n=0;n<3;n++){cyl('paper',X(width-3.2),y+1.72+n*.12,Z(kitchenV-.22),.09,.1);}
    // Desk keyboard, pencils, a framed print and a wall clock.
    B('black',2.4,1.365,split-2.08,.85,.035,.26);
    for(let row=0;row<3;row++)for(let n=0;n<8;n++)B('paper',2.07+n*.09,1.391,split-2.17+row*.075,.065,.009,.04);
    cyl('terracotta',X(1.4),y+1.5,Z(split-2.55),.12,.3);
    for(let n=0;n<4;n++)B(n%2?'gold':'navy',1.34+n*.045,1.7,split-2.55,.025,.45,.025);
    const clockU=width*.55;part('sphere','walnut',X(clockU),y+3.35,Z(split+.13),.42,.42,.055);part('sphere','paper',X(clockU),y+3.35,Z(split+.19),.36,.36,.025);
    B('dark',clockU,3.48,split+.23,.025,.25,.018);B('dark',clockU+.09,3.35,split+.23,.2,.025,.018);
    for(let n=0;n<12;n++){const angle=n*Math.PI/6;B('gold',clockU+Math.sin(angle)*.29,3.35+Math.cos(angle)*.29,split+.23,.025,.035,.015);}
    B('paper',.16,3.1,entry+3.8,.07,.5,.38);B('screen',.21,3.14,entry+3.8,.025,.22,.27);
    this.suiteDetails({b,f,y,X,Z,B,S,width,depth,split,entry,livingU,livingV,bedU,bedV,kitchenV,wood,accent,variant});
    // Laundry controls and a visible drum behind its glass port.
    B('metal',4.7,1.4,1.71,1.08,.19,.025);const washerIndicator=B('mintGlow',4.95,1.4,1.735,.28,.09,.018);
    part('sphere','stainless',X(4.34),y+1.4,Z(1.74),.07,.07,.02);
    let drum=null;
    if(a.active()){
      drum=new a.THREE.Group();drum.position.set(X(4.7),y+.88,Z(1.78));a.group().add(drum);
      for(let n=0;n<3;n++){const cloth=B(['linen','sage','paper'][n],4.7+Math.sin(n*2.1)*.15,.88+Math.cos(n*2.1)*.15,1.78,.16,.13,.02);drum.attach(cloth);}
      const id=`${b.id}:${f}:${side}`,group=a.group(),interactive=a.interactions;
      interactive.door({id:id+':door',group,x:X(0),y,z:Z(entry-1.1),side,material:a.materials[wood],gold:a.materials.gold,b,f});
      interactive.switch({id:id+':light',b,f,side,x:X(.3),z:Z(entry+1.85),emitters});
      interactive.television({id:id+':tv',b,f,mesh:tvMesh,x:X(livingU),z:Z(livingV-4.55)});
      interactive.faucet({id:id+':tap',b,f,group,x:X(width-4),y:y+2.27,z:Z(kitchenV-.37)});
      interactive.sliding({id:id+':curtain',b,f,x:X(width/2),z:Z(depth-.6),kind:'curtain',name:'リビングのカーテン',panels:curtainPanels,apply:(open,panels)=>{
        const span=.56+(width/2-.46-.56)*(1-open);
        for(const {mesh,end,n} of panels){const offset=.45+(n+.5)*span/16;mesh.position.x=X(end?width-offset:offset);mesh.scale.x=span/16*1.08;}
      }});
      interactive.sliding({id:id+':cabinet',b,f,x:X(wardrobeU-.9),z:Z(wardrobeV-.7),kind:'cabinet',name:'ワードローブ',panels:[cabinetPanel,cabinetHandle],apply:(open,panels)=>{panels[0].position.z=Z(wardrobeV-.8+open*1.55);panels[1].position.z=Z(wardrobeV-.16+open*1.55);}});
      interactive.washer({id:id+':washer',b,f,x:X(4.7),z:Z(1.8),drum,indicator:washerIndicator});
      interactive.sliding({id:id+':fridge',b,f,x:X(fridgeU-.2),z:Z(fridgeV+1),kind:'fridge',name:'冷蔵庫',initialOpen:false,panels:[fridgePanel,fridgeHandle],apply:(open,panels)=>{
        panels[0].position.x=X(fridgeU-.32+open*.62);panels[1].position.x=X(fridgeU-.1+open*.62);
      }});
      for(const mesh of [tvMesh,washerIndicator,cabinetPanel,cabinetHandle,fridgePanel,fridgeHandle,...curtainPanels.map(p=>p.mesh)])mesh.userData.dynamicInterior=true;
    }
    this.roomsBuilt++;
  }
  suiteDetails({b,f,y,X,Z,B,S,width,depth,split,entry,livingU,livingV,bedU,bedV,kitchenV,wood,accent,variant}){
    const {cyl,part,plant,fixture}=this.a;
    // Window-side nook: the same safe furniture envelope, three distinct uses.
    const nookU=5.3,nookV=depth-1.35;
    S(nookU,nookV,3.6,1.2);
    B(wood,nookU,.54,nookV,3.6,.62,1.2);B('linen',nookU,.94,nookV,3.5,.2,1.2);
    B(accent,nookU,1.28,nookV+.44,3.6,.65,.18);
    for(const du of [-1.15,1.15])B(accent,nookU+du,1.2,nookV,.6,.45,.22);
    if(variant===0){
      // Indoor herb garden and botanical prints.
      for(let n=0;n<3;n++){plant(X(nookU-1+n),y+1.06,Z(nookV-.27),.24);B('paper',nookU-1+n,1.23,nookV-.45,.13,.16,.02);}
    }else if(variant===1){
      // Record player, speaker and a small collection of sleeves.
      B('walnut',nookU,1.11,nookV,1.5,.13,.8);cyl('black',X(nookU),y+1.2,Z(nookV),.32,.025);cyl('gold',X(nookU),y+1.218,Z(nookV),.075,.013);
      B('gold',nookU+.46,1.25,nookV-.05,.025,.04,.46);
      B('black',nookU-1.35,1.25,nookV,.5,.48,.55);
      for(let n=0;n<5;n++)B(['paper','teal','terracotta'][n%3],nookU+.8+n*.09,1.34,nookV,.045,.57,.56);
    }else{
      // Artist's corner: sketchbook, paint jars and folded textiles.
      B('paper',nookU,1.09,nookV,1.1,.05,.7);B('residenceArt2',nookU,1.13,nookV,.9,.018,.57);
      for(let n=0;n<4;n++)cyl(['sage','teal','terracotta','gold'][n],X(nookU-1+n*.22),y+1.22,Z(nookV),.08,.28);
    }
    // Floor lamp with a real registered light; its base has a furniture collider.
    const lampU=width-2.7,lampV=depth-1.6;
    cyl('walnut',X(lampU),y+.28,Z(lampV),.4,.12);cyl('gold',X(lampU),y+1.5,Z(lampV),.038,2.45);
    part('cone','linen',X(lampU),y+2.78,Z(lampV),.54,.6,.54);B('glow',lampU,2.48,lampV,.36,.035,.36);S(lampU,lampV,.8,.8);fixture(b,f,X(lampU),y+2.44,Z(lampV),65,'#ffdb9e');
    // Paneled media wall, acoustic slats and original framed artwork.
    B(wood,livingU,2.4,livingV-4.92,5.8,4.2,.12);
    for(let n=0;n<9;n++)B(accent,livingU-2.7+n*.16,2.4,livingV-4.81,.065,3.9,.08);
    B('walnut',width-.23,2.85,depth-7.1,.1,2.7,2.9);B('paper',width-.3,2.85,depth-7.1,.04,2.53,2.73);B('residenceArt'+variant,width-.33,2.85,depth-7.1,.025,2.27,2.46);
    // Room-specific ceiling perimeter, diffusers and smoke detector.
    for(const v of [split+.4,depth-.65])B(wood,width/2,5.07,v,width-.6,.14,.12);
    for(const u of [.5,width-.5])B(wood,u,5.07,(split+depth)/2,.12,.14,depth-split-1);
    for(let n=0;n<7;n++)B('metal',2.2+n*.16,5.18,entry-2.8,.07,.025,.8);
    cyl('paper',X(4),y+5.14,Z(entry-2.8),.18,.1);B('mintGlow',4,5.075,entry-2.8,.035,.012,.035);
    // Bedroom headboard panels, bedside drawer seams, reading book and linen bench.
    for(let n=0;n<8;n++)B(wood,bedU-2.3+n*.65,2.5,.22,.45,3.4,.12);
    for(const du of [-2.375,2.375]){B('dark',bedU+du,.73,bedV-1.255,.61,.023,.025);B('gold',bedU+du,.92,bedV-1.23,.26,.035,.04);}
    B('paper',bedU-2.375,1.27,bedV-1.6,.45,.06,.6);
    // Small items are intentionally on existing surfaces, never across door paths.
    B('linen',1.05,1.4,entry+2.8,.7,.09,.4);B('gold',1.45,1.43,entry+2.8,.15,.035,.15);
    B('walnut',.16,2.8,entry+5.8,.09,1.6,1.3);B('residenceArt'+variant,.22,2.8,entry+5.8,.025,1.42,1.12);
    // Kitchen backsplash rails, utensil rack, oven front and task-light diffuser.
    B('stainless',width-2.7,2.3,kitchenV-.5,3.5,.045,.06);
    for(let n=0;n<4;n++){B('gold',width-3.3+n*.35,2.15,kitchenV-.44,.035,.34,.035);part('sphere','stainless',X(width-3.3+n*.35),y+1.97,Z(kitchenV-.44),.09,.12,.035);}
    B('black',width-1.25,.81,kitchenV+.6,.88,.7,.055);B('glassLight',width-1.25,.79,kitchenV+.64,.7,.46,.025);B('gold',width-1.25,1.16,kitchenV+.68,.65,.035,.07);
    // Shower column, wall niche with bottles, towel warmer and vanity drain.
    B('stainless',.28,2.7,1.7,.08,2.7,.08);B('stainless',.55,3.93,1.7,.65,.06,.06);B('stainless',.82,3.86,1.7,.48,.07,.4);
    B(wood,2.35,2.65,.23,1.5,1.1,.13);B('dark',2.35,2.65,.31,1.34,.92,.035);
    for(let n=0;n<3;n++){B(['paper','teal','terracotta'][n],1.9+n*.4,2.46,.45,.19,.35,.18);B('gold',1.9+n*.4,2.68,.45,.09,.09,.1);}
    for(const u of [.3,1.6])B('stainless',u,2.35,7,.04,1.3,.07);
    for(let n=0;n<5;n++)B('stainless',.95,1.8+n*.25,7,1.3,.04,.07);
    B('linen',.95,2.18,6.9,.75,.63,.05);cyl('dark',X(4.73),y+1.696,Z(4.6),.055,.018);
    this.householdObjects({b,f,y,X,Z,B,width,depth,split,entry,livingU,livingV,bedU,bedV,kitchenV,wood,accent,variant});
  }
  householdObjects({b,f,y,X,Z,B,width,depth,split,entry,livingU,livingV,bedU,bedV,kitchenV,wood,accent,variant}){
    const {cyl,ball}=this.a,objects={};let components=0;
    // Surface-only still lifes never change the door sweep or room navigation graph.
    const box=(...args)=>{components++;return B(...args);};
    const C=(m,u,h,v,r,t)=>{components++;return cyl(m,X(u),y+h,Z(v),r,t);};
    const O=(m,u,h,v,rx,ry,rz)=>{components++;return ball(m,X(u),y+h,Z(v),rx,ry,rz);};
    const item=(name,build)=>{objects[name]=(objects[name]||0)+1;build();};
    item('entry-organizer',()=>{
      box(wood,.7,1.4,entry+2.8,.6,.09,.42);
      for(const du of [-.25,.25])box('gold',.7+du,1.47,entry+2.8,.025,.09,.4);
      box('paper',.68,1.46,entry+2.8,.35,.02,.24);
      box('navy',.77,1.49,entry+2.81,.25,.025,.13);
      box('gold',.55,1.49,entry+2.86,.13,.02,.03);
    });
    item('reed-diffuser',()=>{
      C('terracotta',1.8,1.53,entry+2.8,.1,.28);
      for(let n=0;n<5;n++)box('woodLight',1.72+n*.036,1.85,entry+2.8,.015,.43,.015);
    });
    item('tea-tray',()=>{
      box(wood,livingU+.45,.795,livingV-1.8,1.05,.035,.56);
      C('paper',livingU+.33,.96,livingV-1.87,.15,.28);
      C('gold',livingU+.33,1.12,livingV-1.87,.16,.035);
      box('paper',livingU+.52,1.02,livingV-1.87,.18,.055,.065);
      O('paper',livingU+.15,1,livingV-1.87,.09,.1,.025);
      for(const du of [.02,.78]){C('gold',livingU+du,.83,livingV-1.65,.12,.015);C('paper',livingU+du,.9,livingV-1.65,.07,.13);}
    });
    item('open-magazine',()=>{
      box('paper',livingU-.8,.85,livingV-1.45,.62,.025,.43);
      box('residenceArt'+variant,livingU-.95,.869,livingV-1.45,.25,.01,.36);
      for(let n=0;n<5;n++)box('teal',livingU-.65,.87,livingV-1.6+n*.065,.22,.009,.015);
    });
    for(const du of [-2.05,2.05])item('bookshelf-speaker',()=>{
      box('black',livingU+du,1.45,livingV-4.65,.48,.5,.42);
      for(const h of [1.34,1.56])O('metal',livingU+du,h,livingV-4.425,.12,.12,.022);
    });
    item('game-console',()=>{
      box('paper',livingU+1.15,1.25,livingV-4.45,.75,.07,.3);
      box('dark',livingU+1.15,1.29,livingV-4.45,.56,.012,.27);
      for(let n=0;n<6;n++)box('metal',livingU+.94+n*.08,1.303,livingV-4.45,.025,.008,.23);
    });
    item('breakfast-board',()=>{
      box(wood,5.2,1.31,split+3.36,1.1,.04,.53);
      for(let n=0;n<3;n++)O('gold',4.93+n*.27,1.43,split+3.36,.13,.095,.19);
      C('terracotta',5.6,1.48,split+3.37,.09,.28);C('paper',5.6,1.63,split+3.37,.1,.04);
    });
    item('kitchen-drying-rack',()=>{
      // Wall shelf above the backsplash, clear of sink, hob and opening fridge front.
      box('stainless',width-3.5,2.43,kitchenV-.37,1.65,.05,.36);
      for(let n=0;n<7;n++)box('stainless',width-4.2+n*.21,2.51,kitchenV-.37,.018,.16,.33);
      for(let n=0;n<4;n++)O('paper',width-4.1+n*.21,2.65,kitchenV-.35,.025,.2,.16);
    });
    item('recipe-book',()=>{
      box(wood,width-3.25,1.75,kitchenV+.31,.44,.19,.06);
      box('paper',width-3.25,1.89,kitchenV+.33,.39,.35,.045);
      for(let n=0;n<4;n++)box('teal',width-3.25,1.79+n*.065,kitchenV+.36,.27,.012,.01);
    });
    item('bedside-phone',()=>{
      box('black',bedU+2.375,1.255,bedV-1.48,.22,.035,.37);
      box('screen',bedU+2.375,1.278,bedV-1.48,.18,.013,.28);
      box('paper',bedU+2.375,1.29,bedV-1.4,.07,.008,.015);
    });
    item('alarm-clock',()=>{
      box('walnut',bedU-2.375,1.47,bedV-1.96,.46,.37,.15);
      box('dark',bedU-2.375,1.49,bedV-1.875,.38,.22,.025);
      for(let n=0;n<4;n++)box('paper',bedU-2.5+n*.08,1.49,bedV-1.855,.045,.1,.012);
    });
    item('desk-accessories',()=>{
      box('linen',2.4,1.323,split-2.3,1.9,.013,.94);
      O('black',3.04,1.38,split-2.04,.09,.055,.13);
      box('navy',1.77,1.39,split-2.29,.3,.025,.43);
      C('metal',3.51,1.48,split-2.59,.1,.3);
      box('paper',3.51,1.65,split-2.59,.23,.04,.18);
    });
    item('pin-board',()=>{
      // Mounted on the bedroom partition, rather than freestanding in the doorway.
      box(wood,1.12,2.68,split-.11,1.45,1.25,.06);
      box('linen',1.12,2.68,split-.15,1.32,1.12,.025);
      for(let n=0;n<3;n++){
        box(['paper','sage','terracotta'][n],.7+n*.41,2.7,split-.175,.32,.65,.014);
        O('gold',.7+n*.41,2.96,split-.19,.027,.027,.01);
      }
    });
    item('tissue-box',()=>{
      box('linen',width-.65,3.3,depth-3.24,.55,.32,.36);
      box('dark',width-.65,3.468,depth-3.24,.33,.013,.06);
      box('paper',width-.65,3.53,depth-3.24,.21,.14,.023);
    });
    item('toothbrush-set',()=>{
      C('paper',5.24,1.58,4.79,.1,.28);
      for(const du of [-.045,.045]){box(du<0?'teal':'terracotta',5.24+du,1.82,4.79,.035,.4,.035);box('paper',5.24+du,2.03,4.79,.045,.095,.055);}
    });
    item('soap-dish',()=>{
      box('marble',4.18,1.46,4.8,.31,.04,.24);
      O('sage',4.18,1.51,4.8,.12,.035,.08);
    });
    item('laundry-shelf',()=>{
      box(wood,4.68,2.53,.34,1.45,.09,.5);
      for(let n=0;n<4;n++)box(n%2?'linen':'paper',4.34,2.63+n*.1,.36,.56,.085,.37);
      for(let n=0;n<2;n++){C(n?'terracotta':'sage',4.87+n*.26,2.83,.34,.09,.49);C('paper',4.87+n*.26,3.1,.34,.065,.05);}
    });
    // Different hobbies per palette, keeping the same safe shelf footprint.
    item(['seed-library','camera-collection','model-making'][variant],()=>{
      const u=width-.65,v=depth-3.24,h=2.46;
      if(variant===0){for(let n=0;n<4;n++){box(['sage','paper','terracotta'][n%3],u,h+.2,v-.4+n*.25,.5,.36,.1);box('gold',u,h+.25,v-.34+n*.25,.2,.12,.014);}}
      else if(variant===1){box('black',u,h+.16,v,.55,.29,.35);O('metal',u,h+.17,v+.24,.16,.16,.12);box('stainless',u-.12,h+.34,v,.18,.06,.13);}
      else {box(wood,u,h+.01,v,.7,.035,.75);for(let n=0;n<5;n++)box(n%2?'paper':'sage',u+(n%2)*.17-.08,h+.13+n*.03,v-.23+n*.12,.19,.2+n*.06,.15);}
    });
    b.units[f][b.units[f].length-1].objects={categories:objects,count:Object.values(objects).reduce((a,b)=>a+b,0),components};
  }
};

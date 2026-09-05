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
  }
  build(b,f){
    if(f===0){this.lobby(b);return;}
    const a=this.a,y=a.BASE+f*a.FLOOR;
    b.units=b.units||{};b.units[f]=[];
    for(const side of [-1,1])this.apartment(b,f,side,y);
    // Common corridor: warm wall sconces, numbered entrances and a clear path to the lift.
    for(const side of [-1,1])for(let z=-b.d/2+10;z<b.d/2-3;z+=7){a.box('gold',b.x+side*3.05,y+2.5,b.z+z,.09,.8,.35);a.box('glow',b.x+side*2.98,y+2.5,b.z+z,.07,.5,.28);}
    a.fixture(b,f,b.x,y+4.3,b.z+2,90,'#ffe4b9');
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
  }
  apartment(b,f,side,y){
    const a=this.a,{box,cyl,ball,part,solid,plant,chair,table,sofa,fixture}=a;
    const width=b.w/2-4.1,depth=b.d-9.4,origin=b.x+side*3.4,back=b.z-b.d/2+7.2;
    const X=u=>origin+side*u,Z=v=>back+v,split=depth*.44,entry=depth*.72;
    const variant=(Math.abs(Math.round(b.x/72))+f+(side>0?1:0))%3;
    const accent=['sage','teal','terracotta'][variant],wood=variant===1?'walnut':'woodLight';
    const emitters=[];
    const B=(m,u,h,v,w,t,d)=>{const mesh=box(m,X(u),y+h,Z(v),w,t,d);if(m==='glow'&&mesh?.isMesh)emitters.push(mesh);return mesh;};
    const S=(u,v,w,d)=>solid(X(u),Z(v),w,d);
    const wall=(u,v,w,d,h=4.25)=>{B('plaster',u,h/2,v,w,h,d);S(u,v,w,d);B(wood,u,.16,v,w+.015,.2,d+.02);};
    const picture=(u,v,w,h,color)=>{B('walnut',u,2.55,v,w+.16,h+.16,.1);B('paper',u,2.55,v+.065,w,h,.035);B(color,u-.15,2.6,v+.09,w*.58,h*.63,.02);B('gold',u+.33,2.85,v+.115,w*.23,h*.32,.02);};
    const pendant=(u,v)=>{cyl('gold',X(u),y+4.7,Z(v),.025,1.4);part('cone',variant===2?'terracotta':'paper',X(u),y+4.05,Z(v),.55,.4,.55);const bulb=cyl('glow',X(u),y+3.86,Z(v),.34,.04);if(bulb?.isMesh)emitters.push(bulb);fixture(b,f,X(u),y+3.78,Z(v),100,'#ffdeb0');};
    B('oak',width/2,.14,depth/2,width,.14,depth);
    // Corridor wall, with a genuine 2.3m open apartment doorway (not a teleport).
    wall(0,(entry-1.2)/2,.18,entry-1.2);
    wall(0,(entry+1.2+depth)/2,.18,depth-entry-1.2);
    B(wood,0,3.75,entry,.23,1.05,2.4);
    for(const dz of [-1.2,1.2])B(wood,0,1.8,entry+dz,.25,3.6,.1);
    B('gold',-.13,2.15,entry-1.7,.055,.45,.7);
    // Static room-number plaque, created for active floors only.
    if(a.active())a.roomLabel(`${String(f+1).padStart(2,'0')}${side<0?'01':'02'} / ${['GARDEN','WALNUT','TERRACE'][variant]}`,X(-.18),y+2.4,Z(entry-1.8),side<0?Math.PI/2:-Math.PI/2);
    b.units[f].push({side,entry:{x:X(1.3),z:Z(entry)},living:{x:X(3),z:Z(entry)},targets:{living:{x:X(3),z:Z(entry)},kitchen:{x:X(width-3.1),z:Z(split+4.8)},bedroom:{x:X(8),z:Z(split-2)},secondBedroom:{x:X(4.3),z:Z(10)},bathroom:{x:X(3),z:Z(3.9)}},width,depth,variant});
    wall(width/2,0,width,.17);
    // Bedroom partition has a 2.2m door opening. All rooms remain reachable on foot.
    wall(1,split,2,.17);wall((4.2+width)/2,split,width-4.2,.17);B(wood,3.1,3.75,split,2.2,1.05,.18);
    // Bathroom enclosure and open doorway into its vanity area.
    wall(5.8,3.55,.14,7.1);wall(1,7.1,2,.14);wall(4.9,7.1,1.8,.14);
    const doorV=split-2.1;wall(5.8,(7.1+doorV-1.1)/2,.14,doorV-1.1-7.1);wall(5.8,(doorV+1.1+split)/2,.14,split-doorV-1.1);B(wood,5.8,3.75,doorV,.18,1.05,2.2);
    // A separately partitioned second bedroom doubles as a home office.
    B(wood,1.5,.6,9.55,2.1,.65,4.1);S(1.5,9.55,2.1,4.1);B('linen',1.5,1,9.55,2,.24,4);B(accent,1.5,1.17,10.25,2.02,.1,2.4);B('paper',1.5,1.23,8.05,1.4,.2,.65);B(wood,1.5,1.3,7.44,2.15,1.8,.1);
    // Entry: stone threshold, shoe storage, coat hooks and a full-height mirror.
    B('tile',1.25,.23,entry,2.5,.05,3.25);B(wood,1.05,.72,entry+2.8,1.9,1.25,.6);S(1.05,entry+2.8,1.9,.6);
    B('stainless',.14,2.25,entry+4.2,.06,2.6,1.3);B('glassLight',.19,2.25,entry+4.2,.035,2.4,1.15);
    for(let n=0;n<3;n++)B('gold',.2,2.45,entry+2.1+n*.35,.28,.08,.06);
    // Living room: layered rug, sofa with cushions, low table, media wall and books.
    const livingV=depth-6.2,livingU=width*.58;
    B('rug',livingU,.245,livingV-1,7.3,.05,6.5);sofa(X(livingU),y+.2,Z(livingV+1.1));
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
    B('tile',width-2.15,.24,kitchenV+2.1,4.1,.04,5.9);
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
    B('stainless',width-.85,1.8,kitchenV+3.1,1.35,3.2,1.15);S(width-.85,kitchenV+3.1,1.35,1.15);B('dark',width-.85,1.6,kitchenV+3.69,1.3,.04,.02);B('metal',width-1.35,2.4,kitchenV+3.72,.05,.7,.05);
    // Dining table deliberately outside the entrance-to-bedroom circulation route.
    const diningU=5.2,diningV=split+2.9;table(X(diningU),y+.23,Z(diningV),2.9,1.7);
    for(const du of [-1,1]){chair(X(diningU+du),y+.23,Z(diningV+1.4),0,'linen');chair(X(diningU+du),y+.23,Z(diningV-1.4),Math.PI,'linen');cyl('paper',X(diningU+du),y+1.34,Z(diningV+.3),.28,.025);}
    plant(X(diningU),y+1.3,Z(diningV),.25);pendant(diningU,diningV);
    // Bedroom: upholstered bed, folded throw, bedside lights, built-in wardrobe and workstation.
    const bedU=(6.5+width)/2,bedV=4.4;
    B(wood,bedU,.63,bedV,3.75,.65,5);S(bedU,bedV,3.75,5);B('linen',bedU,1.02,bedV,3.65,.28,4.85);B(accent,bedU,1.2,bedV+1.05,3.66,.12,2.4);B(accent,bedU,1.5,bedV-2.55,3.95,1.85,.17);
    for(const du of [-.95,.95]){B('paper',bedU+du,1.29,bedV-1.75,1.42,.23,.77);B(wood,bedU+du*2.5,.66,bedV-1.7,.7,1.15,.85);cyl('gold',X(bedU+du*2.5),y+1.57,Z(bedV-1.7),.045,.65);part('cone','paper',X(bedU+du*2.5),y+1.99,Z(bedV-1.7),.32,.4,.32);}
    const wardrobeU=width-1;
    for(let n=0;n<3;n++){B(wood,wardrobeU,1.7,split-4.4+n*1.1,1.2,3.25,1.03);B('gold',wardrobeU-.65,1.8,split-4.4+n*1.1,.07,.55,.06);S(wardrobeU,split-4.4+n*1.1,1.2,1.03);}
    picture(bedU,.12,3.1,1.3,accent);
    table(X(2.4),y+.23,Z(split-2.3),2.8,1.1);chair(X(2.4),y+.23,Z(split-1.15),0,'linen');B('black',2.4,1.68,split-2.45,.9,.58,.05);B('paper',3.3,1.34,split-2.3,.5,.05,.65);
    // Bathroom: tiled floor, bathtub with water, shower glass, vanity, mirror, toilet and laundry.
    B('tile',2.85,.24,3.5,5.5,.06,6.9);
    B('paper',1.8,.72,1.7,2.9,1.05,2.65);S(1.8,1.7,2.9,2.65);B('dark',1.8,1.27,1.7,2.55,.02,2.28);B('water',1.8,1.29,1.7,2.4,.015,2.13);
    cyl('stainless',X(.4),y+1.55,Z(.65),.05,.7);B('stainless',.65,1.9,.65,.55,.06,.07);
    B('lobbyGlass',3.38,2,1.6,.055,3.5,3);B('stainless',3.38,3.78,1.6,.06,.055,3);
    B(wood,4.73,.75,4.6,1.45,1.15,1.1);S(4.73,4.6,1.45,1.1);B('marble',4.73,1.38,4.6,1.5,.1,1.2);B('paper',4.73,1.55,4.6,.8,.26,.6);B('glassLight',5.67,2.35,4.65,.055,1.55,1.5);B('glow',5.6,3.19,4.65,.055,.05,1.5);
    cyl('paper',X(1.1),y+.64,Z(5),.47,.9);B('paper',1.1,1.11,5,.9,.12,1.1);B('paper',1.1,1.15,4.4,.8,1.25,.24);S(1.1,5,.9,1.3);
    B('paper',4.7,.9,1.15,1.25,1.38,1.05);S(4.7,1.15,1.25,1.05);part('sphere','dark',X(4.7),y+.88,Z(1.71),.4,.4,.025);part('sphere','glassLight',X(4.7),y+.88,Z(1.74),.29,.29,.023);B('linen',4.7,1.63,1.15,.85,.12,.55);
    // Curtains, tracks and layered ceiling lights finish the inhabited feel.
    for(const u of [.45,width-.5])for(let n=0;n<6;n++)B('linen',u+n*.085,2.62,depth-.22,.07,4.55,.24);
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
    if(a.active()){
      const id=`${b.id}:${f}:${side}`,group=a.group(),interactive=a.interactions;
      interactive.door({id:id+':door',group,x:X(0),y,z:Z(entry-1.1),side,material:a.materials[wood],gold:a.materials.gold,b,f});
      interactive.switch({id:id+':light',b,f,side,x:X(.3),z:Z(entry+1.85),emitters});
      interactive.television({id:id+':tv',b,f,mesh:tvMesh,x:X(livingU),z:Z(livingV-4.55)});
      interactive.faucet({id:id+':tap',b,f,group,x:X(width-4),y:y+2.27,z:Z(kitchenV-.37)});
    }
    this.roomsBuilt++;
  }
};

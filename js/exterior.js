'use strict';
// Deterministic, instanced exterior detail. No external textures or per-frame allocations.
window.EvercityExterior = class EvercityExterior {
  constructor({THREE:T,scene,renderer,materials,obstacle,sun}) {
    Object.assign(this,{T,scene,renderer,materials,obstacle,sun});
    this.seed=482731;this.batches=new Map();this.meshes=[];this.counts={};this.elapsed=1;
    this.quality=matchMedia('(pointer:coarse)').matches?'balanced':'ultra';
    try{const saved=localStorage.getItem('evercity-quality-v1');if(['balanced','high','ultra'].includes(saved))this.quality=saved;}catch(e){}
    this.dummy=new T.Object3D();this.color=new T.Color();
    this.geometry={box:new T.BoxGeometry(1,1,1),cylinder:new T.CylinderGeometry(1,1,1,12),sphere:new T.IcosahedronGeometry(1,1),leaf:new T.PlaneGeometry(1,1),ring:new T.TorusGeometry(1,.065,6,20)};
    this.makeMaterials();this.makeReflection();
  }
  random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  pick(a){return a[Math.floor(this.random()*a.length)];}
  canvas(size=512){const c=document.createElement('canvas');c.width=c.height=size;return c;}
  texture(c){const t=new this.T.CanvasTexture(c);t.colorSpace=this.T.SRGBColorSpace;t.wrapS=t.wrapT=this.T.RepeatWrapping;t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());return t;}
  surface(kind) {
    const c=this.canvas(),ctx=c.getContext('2d');
    ctx.fillStyle=kind==='asphalt'?'#b1b3b4':'#dedbd4';ctx.fillRect(0,0,512,512);
    // Fine aggregate remains visible close up, with mipmaps preventing distant shimmer.
    for(let i=0;i<24000;i++){const v=100+Math.floor(this.random()*145);ctx.fillStyle=`rgba(${v},${v},${v},${kind==='asphalt'?.27:.12})`;const s=this.random()*2+.4;ctx.fillRect(this.random()*512,this.random()*512,s,s);}
    if(kind==='pavers'||kind==='brick'){
      const h=kind==='brick'?64:128,w=kind==='brick'?128:256;
      for(let row=0;row<512/h;row++)for(let col=-1;col<512/w+1;col++){
        const x=col*w+(row%2)*w/2,y=row*h;
        ctx.fillStyle=`rgba(90,78,66,${.02+this.random()*.08})`;ctx.fillRect(x+3,y+3,w-6,h-6);
        ctx.strokeStyle='rgba(61,63,61,.28)';ctx.lineWidth=3;ctx.strokeRect(x,y,w,h);
        ctx.strokeStyle='rgba(255,255,245,.30)';ctx.lineWidth=1;ctx.strokeRect(x+3,y+3,w-6,h-6);
      }
    } else if(kind==='stone') {
      ctx.strokeStyle='rgba(76,76,70,.2)';ctx.lineWidth=2;ctx.strokeRect(1,1,510,510);
      for(let i=0;i<50;i++){ctx.strokeStyle='rgba(130,127,119,.08)';ctx.beginPath();const y=this.random()*512;ctx.moveTo(0,y);ctx.bezierCurveTo(140,y-10,300,y+20,512,y+5);ctx.stroke();}
    } else if(kind==='wood') {
      for(let i=0;i<280;i++){ctx.strokeStyle=`rgba(78,59,35,${this.random()*.18})`;ctx.beginPath();const x=this.random()*512;ctx.moveTo(x,0);ctx.bezierCurveTo(x+12,160,x-10,300,x+3,512);ctx.stroke();}
    }
    return this.texture(c);
  }
  worldTexture(material,texture,meters,bump=.035) {
    material.map=texture;material.bumpMap=texture;material.bumpScale=bump;
    // Planar UVs in world meters prevent giant stretched road/building textures.
    material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
        vec4 detailWorld = vec4(position, 1.0);
        vec3 detailNormal = normal;
        #ifdef USE_INSTANCING
          detailWorld = instanceMatrix * detailWorld;
          detailNormal = mat3(instanceMatrix) * detailNormal;
        #endif
        detailWorld = modelMatrix * detailWorld;
        detailNormal = abs(normalize(mat3(modelMatrix) * detailNormal));
        vec2 detailUv = detailNormal.y > .5 ? detailWorld.xz : (detailNormal.x > .5 ? detailWorld.zy : detailWorld.xy);
        #ifdef USE_MAP
          vMapUv = detailUv / ${meters.toFixed(3)};
        #endif
        #ifdef USE_BUMPMAP
          vBumpMapUv = detailUv / ${meters.toFixed(3)};
        #endif`);
    };
    material.customProgramCacheKey=()=>`exterior-world-uv-${meters}`;material.needsUpdate=true;
  }
  makeMaterials(){
    const T=this.T,m=this.materials;
    const pavers=this.surface('pavers'),stone=this.surface('stone'),asphalt=this.surface('asphalt'),brick=this.surface('brick'),wood=this.surface('wood');
    this.worldTexture(m.road,asphalt,4,.045);m.road.color.set('#454d51');
    this.worldTexture(m.paving,pavers,3.2,.028);
    for(const k of ['stone','concrete','warm','light','curb'])this.worldTexture(m[k],stone,2,.022);
    for(const k of ['wood','woodLight','trunk'])this.worldTexture(m[k],wood,1.8,.028);
    this.m={
      masonry:new T.MeshStandardMaterial({color:'#ffffff',roughness:.86}),
      trim:new T.MeshStandardMaterial({color:'#ffffff',roughness:.52,metalness:.35}),
      timber:new T.MeshStandardMaterial({color:'#ffffff',roughness:.78}),
      glass:new T.MeshStandardMaterial({color:'#84b4bc',metalness:.65,roughness:.19}),
      dark:new T.MeshStandardMaterial({color:'#25373a',roughness:.68}),
      glow:new T.MeshStandardMaterial({color:'#ffe6bc',emissive:'#ffd397',emissiveIntensity:.8,roughness:.45}),
      foliage:new T.MeshStandardMaterial({color:'#ffffff',roughness:.95}),
      leaf:new T.MeshStandardMaterial({color:'#ffffff',roughness:.9,side:T.DoubleSide,alphaTest:.48}),
      sign:new T.MeshStandardMaterial({color:'#ffffff',roughness:.68})
    };
    this.worldTexture(this.m.masonry,brick,2.4,.045);this.worldTexture(this.m.timber,wood,1.8,.035);
    const c=this.canvas(128),ctx=c.getContext('2d');
    // One alpha-cutout branch card contains many individual leaves, not a solid billboard.
    ctx.strokeStyle='#6b7550';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(62,120);ctx.quadraticCurveTo(70,60,60,7);ctx.stroke();
    for(let i=0;i<12;i++){
      const y=13+i*8,side=i%2?1:-1,x=63+side*(10+this.random()*10);
      ctx.save();ctx.translate(x,y+5);ctx.rotate(side*.65);ctx.fillStyle=this.pick(['#c9dcb0','#9dbb81','#b5ce99','#8da970']);ctx.beginPath();ctx.ellipse(0,0,6+this.random()*3,13,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(72,105,51,.4)';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(0,10);ctx.stroke();ctx.restore();
    }
    this.m.leaf.map=this.texture(c);
    const atlas=this.canvas(1024),a=atlas.getContext('2d');
    const panels=[['EVERCITY','CITY TRANSIT','CENTRAL / 04'],['COMMON','COFFEE & BAKERY','OPEN 08:00 — 20:00'],['FORM','ART & CULTURE','EXHIBITION / 2026'],['BOTANICA','FLOWERS & PLANTS','GROWN IN THE CITY'],['NORTHLINE','BOOKS & OBJECTS','FIND YOUR NEXT STORY'],['CENTRAL','GARDEN DISTRICT','WALK • EXPLORE • DISCOVER'],['CITY MARKET','FRESH EVERY DAY','LOCAL / SEASONAL'],['ATELIER','DESIGN STUDIO','ARCHITECTURE & LIVING']];
    panels.forEach((p,i)=>{const x=(i%2)*512,y=Math.floor(i/2)*256;a.fillStyle=['#213f44','#cfb58d','#d1d0bc','#354d3d'][i%4];a.fillRect(x,y,512,256);a.strokeStyle='#8baf9a';a.lineWidth=2;a.strokeRect(x+14,y+14,484,228);a.textAlign='center';a.fillStyle=i%4===1||i%4===2?'#263c3c':'#eee8d4';a.font='bold 46px sans-serif';a.fillText(p[0],x+256,y+92,462);a.font='19px sans-serif';a.fillText(p[1],x+256,y+142,470);a.font='14px sans-serif';a.fillText(p[2],x+256,y+202,470);});
    this.m.sign.map=this.texture(atlas);
    for(let i=0;i<8;i++){const g=new T.PlaneGeometry(1,1),uv=g.attributes.uv;for(let j=0;j<uv.count;j++)uv.setXY(j,(uv.getX(j)+i%2)/2,(uv.getY(j)+3-Math.floor(i/2))/4);this.geometry['sign'+i]=g;}
  }
  makeReflection(){
    const T=this.T,s=new T.Scene();s.background=new T.Color('#bfd9de');
    const sky=new T.Mesh(new T.SphereGeometry(180,24,12),new T.ShaderMaterial({side:T.BackSide,vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 p;void main(){float h=normalize(p).y;vec3 c=mix(vec3(.84,.79,.65),vec3(.33,.55,.70),smoothstep(-.1,.8,h));gl_FragColor=vec4(c,1.);}'}));s.add(sky);
    const geo=new T.BoxGeometry(1,1,1),mats=['#7b959a','#b4b5a7','#577985'].map(color=>new T.MeshBasicMaterial({color}));
    for(let i=0;i<28;i++){const angle=i*Math.PI*2/28,h=12+(i*17%53),b=new T.Mesh(geo,mats[i%3]);b.position.set(Math.sin(angle)*90,h/2-22,Math.cos(angle)*90);b.scale.set(12,h,12);s.add(b);}
    const pmrem=new T.PMREMGenerator(this.renderer);this.reflection=pmrem.fromScene(s,.035,.1,400);this.scene.environment=this.reflection.texture;pmrem.dispose();geo.dispose();sky.geometry.dispose();sky.material.dispose();mats.forEach(m=>m.dispose());
    for(const m of Object.values(this.materials))m.envMapIntensity=.24;
    for(const k of ['glass','glassLight','glassWarm']){this.materials[k].envMapIntensity=.75;this.materials[k].roughness=.22;}
    for(const m of Object.values(this.m))m.envMapIntensity=.4;
  }
  add(kind,mat,x,y,z,w,h,d,color='#ffffff',rx=0,ry=0,rz=0,tier='near'){
    const cellX=Math.floor((x+36)/72),cellZ=Math.floor((z+36)/72),key=`${kind}:${mat}:${cellX}:${cellZ}:${tier}`;
    if(!this.batches.has(key))this.batches.set(key,{kind,mat,cellX,cellZ,tier,items:[]});
    this.batches.get(key).items.push([x,y,z,w,h,d,color,rx,ry,rz]);
    this.counts[tier]=(this.counts[tier]||0)+1;
  }
  box(mat,x,y,z,w,h,d,color,ry=0,tier='near'){this.add('box',mat,x,y,z,w,h,d,color,0,ry,0,tier);}
  cylinder(mat,x,y,z,r,h,color,tier='near'){this.add('cylinder',mat,x,y,z,r,h,r,color,0,0,0,tier);}
  beam(mat,a,b,r,color,tier='near'){
    const T=this.T,from=new T.Vector3(...a),to=new T.Vector3(...b),delta=to.clone().sub(from),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.clone().normalize()),e=new T.Euler().setFromQuaternion(q),mid=from.add(to).multiplyScalar(.5);
    this.add('cylinder',mat,mid.x,mid.y,mid.z,r,delta.length(),r,color,e.x,e.y,e.z,tier);
  }
  panel(index,x,y,z,w,h,rotation=0){this.add('sign'+index,'sign',x,y,z,w,h,1,'#ffffff',0,rotation,0,'near');}
  tree(x,z,s){
    const colors=['#729351','#88a761','#9aae70','#607f47'];
    for(let i=0;i<7;i++){
      const a=i*2.399,r=(i%3)*.53*s,xx=x+Math.cos(a)*r,zz=z+Math.sin(a)*r,yy=(4.6+(i%3)*.58)*s;
      this.beam('timber',[x,2.5*s,z],[xx,yy,zz],.065*s,'#70614a','green');
      this.add('sphere','foliage',xx,yy,zz,1.1*s,1.2*s,1.1*s,colors[i%4],0,a,0,'green');
    }
    for(let i=0;i<100;i++){
      const a=i*2.399,y=1-2*(i+.5)/100,r=Math.sqrt(1-y*y),jitter=.85+this.random()*.3;
      this.add('leaf','leaf',x+Math.cos(a)*r*2.3*s*jitter,(4.95+y*2.55)*s,z+Math.sin(a)*r*2.15*s*jitter,1.3*s,1.5*s,1,colors[i%4],this.random()*Math.PI,this.random()*Math.PI,this.random()*Math.PI,'green');
    }
    // Tree grate, concentric irrigation ring and corner fasteners.
    this.box('dark',x,.77,z,2.7,.035,2.7);
    for(let n=-6;n<=6;n++)if(Math.abs(n)>1){this.box('trim',x+n*.19,.794,z,.045,.035,2.6,'#6c766d');this.box('trim',x,.794,z+n*.19,2.6,.035,.045,'#6c766d');}
  }
  shrub(x,y,z,s=1,flowers=false){
    this.add('sphere','foliage',x,y+.35*s,z,.7*s,.5*s,.6*s,'#52714b',0,0,0,'near');
    for(let k=0;k<8;k++){const a=k*2.4;this.add('leaf','leaf',x+Math.cos(a)*.5*s,y+(.4+this.random()*.3)*s,z+Math.sin(a)*.4*s,.7*s,.8*s,1,'#95ae6d',0,a,.5,'near');}
    if(flowers)for(let k=0;k<5;k++){const a=k*2.4;this.add('sphere','foliage',x+Math.sin(a)*.4*s,y+.7*s,z+Math.cos(a)*.35*s,.11*s,.07*s,.11*s,this.pick(['#e9c9b0','#df9f94','#eee3b2','#a897ba']),0,0,0,'near');}
  }
  building(b){
    const {x,z,w,d,floors,type}=b,F=5.6,B=.32,roof=B+floors*F;
    const residential=type==='residential',cafe=type==='cafe'||type==='shop',gallery=type==='gallery';
    const tone=residential?this.pick(['#bd8869','#d3b99b','#b5b0a0','#ba9c7d']):gallery?'#d9d4c4':this.pick(['#bbc3bd','#859f9e','#c7bea9']);
    const metal=this.pick(['#485b5b','#76674e','#414f54']);
    // Four elevation coordinate systems; keep all details outside the existing shell.
    for(let face=0;face<4;face++){
      const side=face%2?1:-1,alongX=face<2,length=alongX?w:d;
      const at=(u,v,out)=>alongX?[x+u,v,z+side*(d/2+out)]:[x+side*(w/2+out),v,z+u];
      const block=(mat,u,v,out,a,h,depth,color,tier='facade')=>{const p=at(u,v,out);this.box(mat,...p,alongX?a:depth,h,alongX?depth:a,color,0,tier);};
      for(let f=1;f<floors;f++){
        const y=B+f*F;
        block('masonry',0,y+.46,.10,length-.5,.78,.23,tone);
        block('trim',0,y+.88,.23,length+.35,.08,.46,metal);
        for(let u=-length/2+2;u<length/2-1;u+=3.6){
          block('trim',u,y+2.85,.19,.11,4.5,.34,metal);
          block('trim',u-1.7,y+3.65,.16,3.3,.07,.2,metal,'near');
          if(residential&&(Math.round((u+length/2)/3.6)%2===0))block('masonry',u,y+2.9,.20,.50,4.35,.48,tone);
          // Narrow window reveals and external shading slats do not fill the glazing.
          if(!residential&&f%3===1)for(let l=0;l<3;l++)block('trim',u-1.7,y+4.6+l*.19,.42,3.35,.055,.7,metal,'near');
        }
      }
      block('masonry',0,roof+.95,.1,length+.65,.24,.65,tone);
      // Ground-level plinths and wall bays leave the original south entrance untouched.
      if(face!==1){
        block('masonry',0,1.0,.28,length,1.3,.45,tone);
        for(let u=-length/2+2;u<length/2-2;u+=5.5){block('trim',u,3.3,.27,.12,3.6,.35,metal);block('glass',u+2.3,3.1,.26,4.2,2.9,.06,'#b4caca');block('trim',u+2.3,4.63,.34,4.7,.14,.7,metal);}
      }
      if(residential||type==='hotel'){
        // Balcony top rails, vertical balusters, side returns and planted ends.
        if(face===1)for(let f=2;f<floors;f+=2)for(const side of [-1,1]){
          const u=side*w*.27,y=B+f*F,bw=w*.32;
          block('trim',u,y+1.25,2.53,bw,.07,.1,metal);
          for(let n=-bw/2;n<=bw/2;n+=.6)block('trim',u+n,y+.69,2.53,.045,1.05,.06,metal,'near');
          for(const edge of [-1,1]){const p=at(u+edge*bw/2,y+.68,1.35);this.box('trim',...p,.07,1.15,2.35,metal);}
          const p=at(u+bw/2-.8,y+.42,1.45);this.box('masonry',...p,1.2,.62,.7,'#b7b5a1');this.shrub(p[0],y+.73,p[2],.65,true);
        }
      }
      // Rainwater pipes and collar clamps follow the corners.
      const p=at(-length/2+.6,roof/2,.5);this.cylinder('trim',...p,.075,roof,metal,'facade');
      for(let f=1;f<floors;f+=2)block('trim',-length/2+.6,B+f*F,.5,.22,.12,.26,metal,'near');
    }
    // Entrance fascia, stone jambs, wall sconces and a recessed welcome mat.
    for(const side of [-1,1]){
      this.box('masonry',x+side*3.45,2.55,z+d/2+.25,.48,4.45,.65,tone,0,'facade');
      this.box('trim',x+side*4.15,3.1,z+d/2+.43,.32,.95,.25,metal);
      this.box('glow',x+side*4.15,3.1,z+d/2+.58,.16,.72,.045);
      if(cafe){for(let n=0;n<12;n++)this.box(n%2?'timber':'trim',x+side*w*.29-4.4+n*.8,4.3,z+d/2+1.45,.8,.12,2.7,n%2?'#dbd2b4':'#466c63',0,'facade');this.box('timber',x+side*w*.29,4.02,z+d/2+2.8,9.6,.48,.1,'#ded1ac',0,'facade');}
    }
    this.box('dark',x,.34,z+d/2+.4,5.6,.025,1.2);
    const signIndex=type==='cafe'?1:type==='gallery'?2:type==='shop'?6:residential?3:4;
    this.panel(signIndex,x-w*.3,3.1,z+d/2+.5,5.4,2.7);
    // Rooftop solar arrays, cable trays, ventilation ducts, fans and planted terrace.
    for(let row=0;row<3;row++)for(let col=0;col<4;col++){
      const xx=x-w*.34+col*2.5,zz=z-d*.27+row*3;
      this.box('trim',xx,roof+.5,zz,2.3,.1,2.2,'#bec8c5');
      this.add('box','glass',xx,roof+.65,zz,2.1,.10,2,'#31566a',-.16,0,0,'roof');
      for(let k=-1;k<=1;k++)this.box('trim',xx+k*.64,roof+.74,zz,.025,.025,1.95,'#b2c5c4',0,'roof');
    }
    for(let n=0;n<3;n++){
      const xx=x+w/2-4,zz=z-d/2+4+n*4;
      this.cylinder('trim',xx,roof+1.99,zz,.72,.18,'#a9b5b1','roof');
      this.cylinder('dark',xx,roof+2.1,zz,.58,.045,undefined,'roof');
      for(let k=0;k<4;k++)this.box('trim',xx,roof+2.13,zz,1.1,.035,.12,'#81948f',k*Math.PI/4,'roof');
      this.box('trim',xx-1.8,roof+.45,zz,1,.7,.7,'#a8b7b3',0,'roof');
    }
    this.box('trim',x+w/2-6,roof+.32,z-d/2+8,.48,.35,13,'#8c9b97',0,'roof');
    for(let n=0;n<5;n++){
      const xx=x-w*.35+n*w*.175,zz=z+d/2-2;
      this.box('masonry',xx,roof+.42,zz,2.8,.65,1.1,tone,0,'roof');this.shrub(xx,roof+.75,zz,1,true);
    }
    this.street(b,signIndex);
  }
  bicycle(x,z,color){
    // Bicycle lies parallel to sidewalk: both wheels share the same vertical plane.
    const y=.83;
    for(const dx of [-.72,.72]){
      this.add('ring','dark',x+dx,y,z,.52,.52,.52,'#ffffff',0,0,0,'near');
      this.add('ring','trim',x+dx,y,z,.45,.45,.45,'#b4c4be',0,0,0,'near');
      for(let k=0;k<6;k++){const a=k*Math.PI/3;this.beam('trim',[x+dx,y,z],[x+dx+Math.cos(a)*.44,y+Math.sin(a)*.44,z],.009,'#c1c8c2');}
    }
    const a=[x-.72,y,z],b=[x-.25,y+.65,z],c=[x+.15,y,z],d=[x+.45,y+.72,z],e=[x+.72,y,z];
    for(const [p,q]of [[a,b],[b,c],[c,a],[b,d],[d,c],[d,e]])this.beam('trim',p,q,.036,color);
    this.box('dark',x-.25,y+.78,z,.43,.12,.26);this.beam('trim',d,[x+.4,y+1,z],.035,'#c2c8be');this.box('dark',x+.4,y+1,z,.1,.07,.62);
    this.cylinder('trim',x-.13,.64,z-.13,.025,.65,'#5a6560');
  }
  street(b,index){
    const {x,z,w,d,type}=b;
    // Utilities are in the furnishing strip, not on NPC lanes (at +/-29) or the entrance axis.
    for(const side of [-1,1]){
      this.box('dark',x+side*25.9,.296,z-10,1.2,.024,2.2);
      for(let n=0;n<12;n++)this.box('trim',x+side*25.9,.317,z-10.98+n*.18,1.12,.018,.05,'#8a9286');
      this.cylinder('trim',x+side*25.6,.33,z+10,.52,.04,'#68746d');
      this.add('ring','dark',x+side*25.6,.36,z+10,.41,.41,.41,undefined,Math.PI/2,0,0);
      for(let n=-2;n<=2;n++)this.box('trim',x+side*25.6+n*.14,.365,z+10,.026,.02,.65,'#354b48');
    }
    for(let n=-2;n<=2;n++){
      this.box('trim',x+n*.42,.325,z+26, .38,.04,1.5,'#d5bd75');
      for(let k=-2;k<=2;k++)this.cylinder('trim',x+n*.42,.357,z+26+k*.22,.035,.023,'#ead39b');
    }
    // Proper slatted public benches, bollards, recycling bins and bike racks.
    for(let n=0;n<6;n++)this.box('timber',x-12,.99,z+23.65+n*.14,3,.055,.10,'#b0956c');
    for(const side of [-1,1]){
      this.box('trim',x-12+side*1.4,1.23,z+24,.055,.45,.8,'#51675f');
      this.cylinder('trim',x+side*5.2,.88,z+26,.085,1.15,'#455a57');
      this.cylinder('trim',x+side*5.2,1.33,z+26,.095,.08,'#d4c6a4');
    }
    for(let n=0;n<2;n++){
      const xx=x+12+n*1.1;this.box('trim',xx,.99,z+24,.83,1.3,.78,n?'#648375':'#5a7079');
      this.box('dark',xx,1.48,z+24.405,.58,.15,.035);this.box('trim',xx,1.69,z+24,.94,.12,.88,'#a4b1a5');
    }
    this.box('trim',x-25,1.05,z-7,1.2,1.5,.6,'#aab3a4');
    for(let k=0;k<8;k++)this.box('dark',x-24.387,1.1+k*.065,z-7,.025,.018,.4);
    for(let n=0;n<3;n++){
      const xx=x-14+n*2.5,zz=z-24;
      this.cylinder('trim',xx-.65,.8,zz,.045,1,'#81968b');this.cylinder('trim',xx+.65,.8,zz,.045,1,'#81968b');this.box('trim',xx,1.3,zz,1.3,.09,.09,'#81968b');
      if(n<2)this.bicycle(xx,zz+.3,this.pick(['#ba7859','#769791','#d6c69f']));
    }
    if(type==='cafe'||type==='shop'){
      // Sidewalk menu board and a planted terrace edge, central 6m entrance stays clear.
      this.box('timber',x+7,1.14,z+d/2+3,1.2,1.65,.16,'#9a7a55');this.panel(index,x+7,1.17,z+d/2+3.09,1.06,1.45);
      for(const dx of [-.53,.53])this.beam('timber',[x+7+dx,.32,z+d/2+2.5],[x+7+dx,1.95,z+d/2+3],.045,'#9a7a55');
    }
    for(let n=0;n<4;n++){
      const zz=z-12+n*6;this.box('masonry',x+24,.63,zz,1.5,.6,3.8,'#bab4a0');
      for(let k=-1;k<=1;k++)this.shrub(x+24,.93,zz+k*1.1,.75,n%2===0);
    }
    if((Math.round(x/72)+Math.round(z/72))%4===0)this.busStop(x,z);
  }
  busStop(x,z){
    // Shelter sits along the north furnishing strip, away from crossings.
    const xx=x+8,zz=z-24.4;
    this.box('trim',xx,3.4,zz,7.3,.18,2.4,'#4d6662',0,'facade');
    for(const dx of [-3.35,3.35])this.box('trim',xx+dx,1.85,zz-.8,.13,3.1,.14,'#50645f');
    this.box('glass',xx,1.95,zz-.83,6.7,2.65,.045,'#9cafaa');
    this.box('timber',xx,1.01,zz-.32,5,.13,.68,'#ac956e');
    for(const dx of [-1.7,1.7])this.box('trim',xx+dx,.65,zz-.32,.12,.7,.55,'#526760');
    this.panel(0,xx+2.5,2.1,zz-.78,1.3,1.95);
    this.box('glow',xx,3.27,zz,5,.035,.14);
    this.obstacle(xx,zz-.83,6.8,.2);this.obstacle(xx,zz-.32,5,.68);
  }
  park(p){
    const {x,z}=p;
    for(const side of [-1,1])for(const end of [-1,1]){
      for(let n=0;n<11;n++){
        const xx=x+side*16+(n-5)*1.65,zz=z+end*7;
        this.shrub(xx,.69,zz,.9,true);
        // Tufts of ornamental grass, each using three crossed slender blades.
        for(let k=0;k<3;k++)this.add('leaf','leaf',xx+.35,.99,zz+end*.6,.32,1.1,1,'#b2b47c',0,k*Math.PI/3,0,'near');
      }
    }
    for(const side of [-1,1]){
      // Pergola on a planted lawn, never across the existing walkable axial paths.
      const px=x+side*16,pz=z-15;
      for(const dx of [-3.6,3.6])for(const dz of [-3,3])this.box('timber',px+dx,2.28,pz+dz,.19,3.3,.19,'#8d7956',0,'facade');
      for(let n=-4;n<=4;n++)this.box('timber',px+n*.95,4.01,pz,.12,.23,7,'#a59169',0,'facade');
      for(const dz of [-3,3])this.box('timber',px,3.87,pz+dz,8.2,.26,.16,'#8d7956',0,'facade');
    }
    for(let n=0;n<20;n++){
      const a=n*Math.PI*2/20;this.cylinder('trim',x+Math.sin(a)*4.8,1.05,z+Math.cos(a)*4.8,.045,.16,'#c4c9b1');
    }
    this.panel(5,x+8,1.5,z+24,3,1.5);
    this.box('trim',x+8,.85,z+23.96,.12,1.2,.12,'#526259');
  }
  waterfront(){
    for(let x=-320;x<=320;x+=4){
      this.cylinder('trim',x,1.35,-339,.055,1.7,'#5f7872','facade');
      this.box('trim',x+2,2.12,-339,4,.08,.08,'#9eada1',0,'facade');
      for(const y of [.85,1.25,1.65])this.box('trim',x+2,y,-339,4,.026,.026,'#778d83');
    }
  }
  flush(){
    for(const batch of this.batches.values()){
      const mesh=new this.T.InstancedMesh(this.geometry[batch.kind],this.m[batch.mat],batch.items.length);
      batch.items.forEach((v,i)=>{this.dummy.position.set(v[0],v[1],v[2]);this.dummy.scale.set(v[3],v[4],v[5]);this.dummy.rotation.set(v[7],v[8],v[9]);this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);mesh.setColorAt(i,this.color.set(v[6]));});
      mesh.receiveShadow=true;mesh.castShadow=false;mesh.computeBoundingSphere();mesh.computeBoundingBox();
      mesh.userData.detailTier=batch.tier;mesh.userData.bounds=mesh.boundingBox;this.scene.add(mesh);this.meshes.push(mesh);
    }
    this.batches.clear();this.setQuality(this.quality);console.info('EVERCITY exterior',JSON.stringify(this.snapshot()));
  }
  setQuality(value){
    this.quality=['balanced','high','ultra'].includes(value)?value:'high';
    const ratio={balanced:1,high:1.5,ultra:2}[this.quality];this.renderer.setPixelRatio(Math.min(devicePixelRatio,ratio));
    // Quality controls shadows as well as pixels and detail distance.
    const size=Math.min(this.renderer.capabilities.maxTextureSize,{balanced:1024,high:2048,ultra:4096}[this.quality]);
    if(this.sun&&this.sun.shadow.mapSize.x!==size){this.sun.shadow.map?.dispose();this.sun.shadow.map=null;this.sun.shadow.mapSize.set(size,size);this.renderer.shadowMap.needsUpdate=true;}
    try{localStorage.setItem('evercity-quality-v1',this.quality);}catch(e){}
    this.elapsed=1;
  }
  update(dt,p,mode){
    this.elapsed+=dt;if(this.elapsed<.3)return;this.elapsed=0;
    const ranges={balanced:{near:75,green:185,roof:135,facade:300},high:{near:120,green:280,roof:210,facade:470},ultra:{near:175,green:380,roof:300,facade:650}}[this.quality];
    for(const m of this.meshes){const b=m.userData.bounds,dx=Math.max(b.min.x-p.x,0,p.x-b.max.x),dy=Math.max(b.min.y-p.y,0,p.y-b.max.y),dz=Math.max(b.min.z-p.z,0,p.z-b.max.z),r=ranges[m.userData.detailTier];const distance2=dx*dx+dy*dy+dz*dz;m.visible=distance2<r*r;
      const casts=m.visible&&this.quality!=='balanced'&&distance2<(this.quality==='ultra'?155:100)**2&&m.material!==this.m.glass&&m.material!==this.m.glow;
      if(m.castShadow!==casts){m.castShadow=casts;this.renderer.shadowMap.needsUpdate=true;}}
    if(this.lastMode!==mode){const night=mode==='night';for(const [k,m]of Object.entries(this.materials))m.envMapIntensity=night?.06:k.startsWith('glass')?.75:.24;this.m.glow.emissiveIntensity=night?2.5:.55;this.m.glass.envMapIntensity=night?.12:.65;this.lastMode=mode;}
  }
  snapshot(){return {quality:this.quality,shadowSize:this.sun?.shadow.mapSize.x,components:Object.values(this.counts).reduce((a,b)=>a+b,0),categories:{...this.counts},batches:this.meshes.length,visibleBatches:this.meshes.filter(m=>m.visible).length,reflection:!!this.scene.environment};}
  selfTest(){return {denseExterior:this.snapshot().components>50000,instanced:this.meshes.every(m=>m.isInstancedMesh),finiteBounds:this.meshes.every(m=>Number.isFinite(m.boundingSphere.radius)),worldScalePaving:!!this.materials.paving.map,leafCutouts:this.m.leaf.alphaTest>0,environmentReflection:!!this.scene.environment,allTiersPresent:['near','green','roof','facade'].every(k=>this.counts[k]>0)};}
};

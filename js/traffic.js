'use strict';
// Shared, fixed-step traffic simulation. Signal lamps, HUD and road users read this same clock.
window.EvercityTraffic = class EvercityTraffic {
  constructor({THREE:T,scene,vehicles,people,player,staticBlocked}) {
    Object.assign(this,{T,scene,vehicles,people,player,staticBlocked});
    this.time=0;this.accumulator=0;this.stats={redStops:0,carYields:0,pedestrianWaits:0};
    this.intersections=[];this.bulbs=[];
    for(let ix=-4;ix<4;ix++)for(let iz=-4;iz<4;iz++){
      this.intersections.push({x:ix*72+36,z:iz*72+36,offset:((ix+4)*7+(iz+4)*11)%19});
    }
    // The starting crossing has a reproducible cycle.
    this.intersections.find(c=>c.x===36&&c.z===108).offset=0;
    for(const v of vehicles){v.cruise=v.speed;v.speed=0;v.reason='';}
    for(const p of people){p.cruise=p.speed;p.waiting=false;}
    if(scene)this.buildSignals();
  }
  phase(c,time=this.time){
    const t=((time+c.offset)%80+80)%80;
    const ns=t<12?'green':t<15?'yellow':'red';
    const ew=t>=18&&t<30?'green':t>=30&&t<33?'yellow':'red';
    return {ns,ew,walk:t>=36&&t<56,clearance:t>=56&&t<78,t,remaining:Math.ceil((t<12?12:t<15?15:t<18?18:t<30?30:t<33?33:t<36?36:t<56?56:t<78?78:80)-t)};
  }
  position(a,pos=a.pos){return {x:a.axis?pos:a.lane,z:a.axis?a.lane:pos};}
  carRect(v,pos=v.pos){const p=this.position(v,pos);return {...p,w:v.axis?2.15:1.02,d:v.axis?1.02:2.15};}
  overlap(a,b,margin=0){return Math.abs(a.x-b.x)<a.w+b.w+margin&&Math.abs(a.z-b.z)<a.d+b.d+margin;}
  dynamicBlocked(x,z,r=.32){
    if(this.player.floor>0)return false;
    const body={x,z,w:r,d:r};
    if(this.vehicles.some(v=>this.overlap(body,this.carRect(v),.08)))return true;
    return this.people.some(p=>{const at=this.position(p);return Math.hypot(at.x-x,at.z-z)<r+.29;});
  }
  intersectionFor(a,c){return Math.abs((a.axis?c.z:c.x)-a.lane)<14;}
  signalGap(v){
    let gap=Infinity;
    for(const c of this.intersections){if(!this.intersectionFor(v,c))continue;
      const center=v.axis?c.x:c.z,stop=center-v.dir*16.6,dist=(stop-v.pos)*v.dir;
      // A vehicle already across its stop line clears the junction, even after amber.
      if(dist<-.03||dist>45)continue;
      const light=this.phase(c)[v.axis?'ew':'ns'];
      const conflicting=this.vehicles.some(o=>o!==v&&o.axis!==v.axis&&Math.abs(this.position(o).x-c.x)<13&&Math.abs(this.position(o).z-c.z)<13);
      if(light!=='green'||conflicting)gap=Math.min(gap,Math.max(0,dist));
    }
    return gap;
  }
  carMoveSafe(v,position){
    const rect=this.carRect(v,position);
    if(this.player.floor===0&&this.overlap(rect,{x:this.player.x,z:this.player.z,w:.36,d:.36},.5))return false;
    for(const other of this.vehicles){if(other!==v&&this.overlap(rect,this.carRect(other),.65))return false;}
    for(const p of this.people){const at=this.position(p);if(this.overlap(rect,{...at,w:.28,d:.28},.48))return false;}
    return true;
  }
  carGap(v){
    let gap=this.signalGap(v),reason=Number.isFinite(gap)?'signal':'';
    for(const other of this.vehicles){if(other===v||other.axis!==v.axis||Math.abs(other.lane-v.lane)>2)continue;const dist=(other.pos-v.pos)*v.dir-5.4;if(dist>=-.1&&dist<gap){gap=Math.max(0,dist);reason='queue';}}
    const p=this.position(v),ahead=(at,r)=>{
      const lateral=v.axis?Math.abs(at.z-p.z):Math.abs(at.x-p.x);
      const dist=((v.axis?at.x:at.z)-v.pos)*v.dir-2.15-r-.75;
      if(lateral<1.05+r&&dist>=-.8&&dist<gap){gap=Math.max(0,dist);reason='yield';}
    };
    if(this.player.floor===0)ahead(this.player,.36);
    for(const person of this.people)ahead(this.position(person),.3);
    return {gap,reason};
  }
  advanceCar(v,dt){
    const {gap,reason}=this.carGap(v);
    const target=Math.min(v.cruise,Math.sqrt(Math.max(0,gap)*8));
    v.speed=Math.max(0,v.speed+Math.max(-9*dt,Math.min(2.8*dt,target-v.speed)));
    let amount=Math.min(v.speed*dt,Math.max(0,gap));
    let next=v.pos+v.dir*amount;
    if(next>320||next<-320){const wrapped=-v.dir*318;if(this.carMoveSafe(v,wrapped)){v.pos=wrapped;v.speed=0;}else v.speed=0;return;}
    if(!this.carMoveSafe(v,next)){amount=0;v.speed=0;v.reason='yield';this.stats.carYields++;}else v.reason=target<.1?reason:'';
    v.pos+=v.dir*amount;
    if(v.reason==='signal')this.stats.redStops++;
    if(v.g){const at=this.position(v);v.g.position.set(at.x,0,at.z);for(const brake of v.brakes||[])brake.material=v.speed<.2?this.brakeOn:this.brakeOff;}
  }
  pedestrianSignalGap(p){
    let gap=Infinity;
    for(const c of this.intersections){if(!this.intersectionFor(p,c))continue;
      const center=p.axis?c.x:c.z,stop=center-p.dir*12.4,dist=(stop-p.pos)*p.dir;
      // Once on a crossing, continue to the far pavement during the clearance phase.
      if(dist>=-.015&&dist<5&&!this.phase(c).walk)gap=Math.min(gap,Math.max(0,dist));
    }return gap;
  }
  pedestrianMoveSafe(p,next){
    const at=this.position(p,next);
    if(this.staticBlocked&&this.staticBlocked(at.x,at.z))return false;
    if(this.player.floor===0&&Math.hypot(at.x-this.player.x,at.z-this.player.z)<.7)return false;
    for(const v of this.vehicles)if(this.overlap({...at,w:.29,d:.29},this.carRect(v),.18))return false;
    for(const other of this.people){if(other===p)continue;const op=this.position(other);if(Math.hypot(at.x-op.x,at.z-op.z)<.57)return false;}
    return true;
  }
  advancePerson(p,dt){
    const gap=this.pedestrianSignalGap(p),step=Math.min(p.cruise*dt,gap);
    let next=p.pos+p.dir*step;
    if(next>313||next<-313){p.dir*=-1;next=p.pos;}
    const safe=this.pedestrianMoveSafe(p,next);p.waiting=step<.002||!safe;
    if(safe)p.pos=next;
    else if(!Number.isFinite(gap)){
      // Deterministic sidewalk courtesy: pause, then turn back instead of clipping through an obstacle.
      p.blockedFor=(p.blockedFor||0)+dt;if(p.blockedFor>2.2){p.dir*=-1;p.blockedFor=0;}
    }
    if(!p.waiting)p.blockedFor=0;else this.stats.pedestrianWaits++;
    if(p.g){const at=this.position(p);p.g.position.set(at.x,.31,at.z);p.g.rotation.y=(p.axis?Math.PI/2:0)+(p.dir<0?Math.PI:0);if(!p.waiting)p.phase+=dt*6;const swing=p.waiting?0:Math.sin(p.phase)*.3;p.legs[0].rotation.x=swing;p.legs[1].rotation.x=-swing;}
  }
  tick(dt){this.time+=dt;for(const p of this.people)this.advancePerson(p,dt);for(const v of this.vehicles)this.advanceCar(v,dt);}
  update(dt){this.accumulator+=Math.min(dt,.1);while(this.accumulator>=1/60){this.tick(1/60);this.accumulator-=1/60;}this.updateLamps();}
  buildSignals(){
    const T=this.T,group=new T.Group();group.name='Functional traffic lights';this.scene.add(group);
    const poleMat=new T.MeshStandardMaterial({color:'#485858',metalness:.65,roughness:.32});
    const housingMat=new T.MeshStandardMaterial({color:'#17282c',roughness:.55});
    const geo=new T.BoxGeometry(1,1,1),sphere=new T.SphereGeometry(1,10,8);
    const housing=(x,y,z,w,h,d)=>{const mesh=new T.Mesh(geo,housingMat);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);group.add(mesh);};
    const arm=(x,y,z,w,h,d)=>{const mesh=new T.Mesh(geo,poleMat);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);group.add(mesh);};
    const bulbData=[];
    for(const c of this.intersections)for(const axis of [0,1])for(const dir of [-1,1]){
      const x=c.x+(axis?-dir*14:dir*10.9),z=c.z+(axis?dir*10.9:-dir*14);
      arm(x,3.3,z,.13,6.6,.13);
      const hx=axis?x:c.x+dir*3.9,hz=axis?c.z+dir*3.9:z;
      arm((x+hx)/2,6.55,(z+hz)/2,axis?.15:7.2,.15,axis?7.2:.15);
      housing(hx,5.98,hz,axis?.42:.7,1.73,axis?.7:.42);
      for(let k=0;k<3;k++)bulbData.push({x:hx+(axis?-dir*.25:0),y:6.5-k*.5,z:hz+(axis?0:-dir*.25),c,axis,k,walk:false});
      housing(x,2.65,z,axis?.3:.65,1.04,axis?.65:.3);
      for(let k=0;k<2;k++)bulbData.push({x:x+(axis?-dir*.2:0),y:2.92-k*.5,z:z+(axis?0:-dir*.2),c,axis,k,walk:true});
    }
    this.lampMesh=new T.InstancedMesh(sphere,new T.MeshBasicMaterial({toneMapped:false}),bulbData.length);const dummy=new T.Object3D();
    bulbData.forEach((b,i)=>{dummy.position.set(b.x,b.y,b.z);dummy.scale.set(b.walk?.15:.19,b.walk?.17:.19,b.walk?.15:.19);dummy.updateMatrix();this.lampMesh.setMatrixAt(i,dummy.matrix);});
    this.bulbs=bulbData;group.add(this.lampMesh);this.lastLampKey='';
    this.brakeOn=new T.MeshStandardMaterial({color:'#ff5a35',emissive:'#ff290e',emissiveIntensity:2.8});this.brakeOff=new T.MeshStandardMaterial({color:'#6a201b',emissive:'#b92b20',emissiveIntensity:.35});
    for(const v of this.vehicles){v.brakes=[];for(const s of [-1,1]){const m=new T.Mesh(new T.BoxGeometry(.45,.16,.05),this.brakeOff);m.position.set(s*.68,.84,2.19);v.g?.add(m);v.brakes.push(m);}}
    this.updateLamps();
  }
  updateLamps(){if(!this.lampMesh)return;const key=Math.floor(this.time*3);if(key===this.lastLampKey)return;this.lastLampKey=key;const color=new this.T.Color();
    this.bulbs.forEach((b,i)=>{const phase=this.phase(b.c);let hex='#122b2d';if(b.walk){if(b.k===0&&!phase.walk)hex='#ff4935';if(b.k===1&&(phase.walk||(phase.clearance&&Math.floor(this.time*2)%2)))hex='#74ffc1';}
      else {const state=phase[b.axis?'ew':'ns'];if(b.k===0&&state==='red')hex='#ff4935';if(b.k===1&&state==='yellow')hex='#ffd451';if(b.k===2&&state==='green')hex='#53ffb6';}this.lampMesh.setColorAt(i,color.set(hex));});this.lampMesh.instanceColor.needsUpdate=true;
  }
  nearest(){return this.intersections.reduce((best,c)=>Math.hypot(c.x-this.player.x,c.z-this.player.z)<Math.hypot(best.x-this.player.x,best.z-this.player.z)?c:best,this.intersections[0]);}
  snapshot(){const c=this.nearest();return {...this.phase(c),x:c.x,z:c.z,time:this.time,carsStopped:this.vehicles.filter(v=>v.speed<.1).length,walkersWaiting:this.people.filter(p=>p.waiting).length};}
  static selfTest(){
    const result={},player={x:900,z:900,floor:0};
    const makeCar=(pos=12)=>({axis:0,dir:1,lane:39.9,pos,speed:8});
    const v=makeCar(),s=new this({vehicles:[v],people:[],player});const c=s.intersections.find(c=>c.x===36&&c.z===36);c.offset=0;
    result.signalMutualExclusion=Array.from({length:800},(_,i)=>s.phase(c,i/10)).every(p=>!(p.ns!=='red'&&p.ew!=='red'));
    result.pedestrianExclusive=Array.from({length:800},(_,i)=>s.phase(c,i/10)).every(p=>!p.walk||(p.ns==='red'&&p.ew==='red'));
    s.time=20;for(let n=0;n<120;n++)s.advanceCar(v,1/60);result.redStopsAtLine=v.pos<=19.401;
    const stopped=v.pos;s.time=1;for(let n=0;n<90;n++)s.advanceCar(v,1/60);result.greenRestarts=v.pos>stopped+1;
    result.playerBlockedByCar=s.dynamicBlocked(s.position(v).x,s.position(v).z);
    v.pos=5;v.speed=7;player.x=39.9;player.z=15;for(let n=0;n<120;n++)s.advanceCar(v,1/60);result.carYieldsToPlayer=v.pos<12;
    player.x=900;player.z=900;const lead=makeCar(18);s.vehicles.push(lead);v.pos=9;v.speed=8;for(let n=0;n<120;n++)s.advanceCar(v,1/60);result.vehicleQueue=!s.overlap(s.carRect(v),s.carRect(lead));
    s.vehicles.length=0;const p={axis:0,dir:1,lane:25,pos:22,speed:1.3,cruise:1.3};s.people.push(p);s.time=1;for(let n=0;n<120;n++)s.advancePerson(p,1/60);result.walkerWaits=p.pos<=23.601;
    const held=p.pos;s.time=40;for(let n=0;n<120;n++)s.advancePerson(p,1/60);result.walkerCrossesOnGreen=p.pos>held+1;
    result.playerBlockedByWalker=s.dynamicBlocked(s.position(p).x,s.position(p).z);
    p.pos=34;s.time=65;const before=p.pos;s.advancePerson(p,.1);result.crossingClearsAfterSignal=p.pos>before;
    s.people.length=0;s.vehicles.push(v);v.pos=12;v.speed=8;player.x=39.9;player.z=16;s.advanceCar(v,.05);result.noTunneling=!s.overlap(s.carRect(v),{x:player.x,z:player.z,w:.32,d:.32});
    return result;
  }
};

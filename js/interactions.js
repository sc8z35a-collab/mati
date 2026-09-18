'use strict';
// Only the current floor owns interactive meshes. States survive floor changes within this visit.
window.EvercityInteractions = class EvercityInteractions {
  constructor({THREE:T,player,renderer,toast}){Object.assign(this,{T,player,renderer,toast});this.items=[];this.doors=[];this.states=new Map();this.owned=[];this.time=0;}
  state(id,defaults){if(!this.states.has(id))this.states.set(id,{...defaults});return this.states.get(id);}
  own(resource){this.owned.push(resource);return resource;}
  clear(){this.items=[];this.doors=[];this.owned.forEach(r=>r.dispose?.());this.owned=[];}
  add(item){this.items.push(item);return item;}
  door({id,group,x,y,z,side,material,gold,b,f}){
    const T=this.T,state=this.state(id,{open:false}),pivot=new T.Group();pivot.position.set(x,y,z);group.add(pivot);
    const mesh=new T.Mesh(this.own(new T.BoxGeometry(.13,3.48,2.18)),material);mesh.position.set(0,1.83,1.09);mesh.castShadow=true;mesh.receiveShadow=true;pivot.add(mesh);
    const trim=new T.Mesh(this.own(new T.BoxGeometry(.15,2.3,1.5)),material);trim.position.set(0,1.92,1.09);pivot.add(trim);
    for(const s of [-1,1]){const handle=new T.Mesh(this.own(new T.BoxGeometry(.2,.055,.36)),gold);handle.position.set(s*.14,1.22,1.88);pivot.add(handle);}
    const door={pivot,x,z,side,b,f,state,angle:state.open?side*Math.PI/2:0};pivot.rotation.y=door.angle;this.doors.push(door);
    this.add({id,b,f,x,z:z+1.1,radius:3.5,kind:'door',state,label:()=>state.open?'住戸の扉を閉める':'住戸の扉を開ける',activate:()=>{
      const desired=state.open?0:side*Math.PI/2;
      // Test the whole swing before starting, not merely the destination panel.
      for(let n=1;n<=24;n++){const a=door.angle+(desired-door.angle)*n/24;if(this.doorHits(door,this.player.x,this.player.z,.35,a)){this.toast('扉の開閉範囲から一歩離れてください');return false;}}
      state.open=!state.open;this.toast(state.open?'住戸の扉を開けました':'住戸の扉を閉めました');return true;
    }});return door;
  }
  doorHits(d,x,z,r=.32,angle=d.angle){const dx=x-d.x,dz=z-d.z,c=Math.cos(angle),s=Math.sin(angle),lx=c*dx-s*dz,lz=s*dx+c*dz;return Math.abs(lx)<.08+r&&lz>-.08-r&&lz<2.21+r;}
  blocked(x,z,f,b){return this.doors.some(d=>d.f===f&&d.b===b&&this.doorHits(d,x,z));}
  switch({id,b,f,side,x,z,emitters=[]}){
    const state=this.state(id,{on:true});const fixtures=b.lights[f].filter(light=>Math.sign(light.x-b.x)===side);
    const apply=()=>{fixtures.forEach(l=>{l.enabled=state.on;});emitters.forEach(m=>{m.userData.dynamicInterior=true;if(m.material){if(!m.userData.offMaterial){m.userData.onMaterial=m.material;m.userData.offMaterial=this.own(m.material.clone());m.userData.offMaterial.emissiveIntensity=0;m.userData.offMaterial.color.set('#777368');}m.material=state.on?m.userData.onMaterial:m.userData.offMaterial;}});this.renderer.shadowMap.needsUpdate=true;};apply();
    this.add({id,b,f,x,z,radius:2.6,kind:'switch',state,label:()=>state.on?'住戸の照明を消す':'住戸の照明を点ける',activate:()=>{state.on=!state.on;apply();this.toast(state.on?'住戸の照明を点けました':'住戸の照明を消しました');return true;}});
  }
  television({id,b,f,mesh,x,z}){
    const T=this.T,state=this.state(id,{channel:1}),canvas=document.createElement('canvas');canvas.width=768;canvas.height=432;const ctx=canvas.getContext('2d');
    const texture=this.own(new T.CanvasTexture(canvas));texture.colorSpace=T.SRGBColorSpace;
    mesh.material=this.own(new T.MeshBasicMaterial({map:texture,toneMapped:false}));
    const paint=(time=0)=>{const ch=state.channel;ctx.fillStyle=ch===0?'#111c20':ch===1?'#294c5b':'#1c3834';ctx.fillRect(0,0,768,432);if(ch){
      const grd=ctx.createLinearGradient(0,0,0,432);grd.addColorStop(0,ch===1?'#8cb5b9':'#739e86');grd.addColorStop(1,ch===1?'#dfbf8c':'#253e40');ctx.fillStyle=grd;ctx.fillRect(0,0,768,370);
      if(ch===1){for(let i=0;i<15;i++){const h=70+(i*47)%160;ctx.fillStyle=i%2?'#31505c':'#49656a';ctx.fillRect(i*55-8,350-h,42,h);ctx.fillStyle='#d1b77e';for(let j=0;j<6;j++)ctx.fillRect(i*55,360-h+j*24,4,6);}}
      else{for(let i=0;i<10;i++){ctx.fillStyle=i%2?'#416950':'#294f47';ctx.beginPath();ctx.moveTo(i*90-70,350);ctx.lineTo(i*90+30,70+(i%3)*30);ctx.lineTo(i*90+130,350);ctx.fill();}}
      ctx.fillStyle='#f4edda';ctx.font='26px sans-serif';ctx.fillText(ch===1?'EVERCITY  /  CITY JOURNAL':'EVERCITY  /  QUIET PLACES',30,402);ctx.font='15px sans-serif';ctx.fillText(ch===1?'LOCAL STORIES · ARCHITECTURE · LIFE':'FOREST COLLECTION · RELAX',30,36);
      ctx.fillStyle='#84e6b6';ctx.beginPath();ctx.arc(715,30,4+Math.sin(time)*1.4,0,Math.PI*2);ctx.fill();
    }texture.needsUpdate=true;};paint();
    this.add({id,b,f,x,z,radius:3.1,kind:'tv',state,label:()=>['テレビを点ける','テレビ：自然チャンネルへ','テレビを消す'][state.channel],activate:()=>{state.channel=(state.channel+1)%3;paint(this.time);this.toast(['テレビを消しました','CITY JOURNAL を再生','QUIET PLACES を再生'][state.channel]);return true;},animate:time=>{if(state.channel&&Math.floor(time)!==state.lastPaint){state.lastPaint=Math.floor(time);paint(time);}}});
  }
  faucet({id,b,f,group,x,y,z}){
    const T=this.T,state=this.state(id,{on:false}),stream=new T.Mesh(this.own(new T.CylinderGeometry(.025,.039,.6,9)),this.own(new T.MeshStandardMaterial({color:'#a2d9dc',transparent:true,opacity:.72,roughness:.1,metalness:.2,emissive:'#5d9ba0',emissiveIntensity:.25})));
    stream.position.set(x,y-.3,z);stream.visible=state.on;group.add(stream);
    const ring=new T.Mesh(this.own(new T.RingGeometry(.035,.075,24)),this.own(new T.MeshBasicMaterial({color:'#ccf2e5',transparent:true,opacity:.6,side:T.DoubleSide,depthWrite:false})));ring.rotation.x=-Math.PI/2;ring.position.set(x,y-.57,z);group.add(ring);ring.visible=state.on;
    this.add({id,b,f,x,z,radius:2.9,kind:'faucet',state,label:()=>state.on?'キッチンの水を止める':'キッチンの水を出す',activate:()=>{state.on=!state.on;stream.visible=ring.visible=state.on;this.toast(state.on?'水を出しました':'水を止めました');return true;},animate:time=>{if(state.on){const pulse=(time*1.5)%1;ring.scale.setScalar(.7+pulse*2);ring.material.opacity=(1-pulse)*.65;stream.scale.x=stream.scale.z=.9+Math.sin(time*24)*.1;}}});
  }
  // Sliding panels stay inside their cabinet/window footprint, so no new swing collision is needed.
  sliding({id,b,f,x,z,kind,panels,apply,name,initialOpen=true}){
    const state=this.state(id,{open:initialOpen});let amount=state.open?1:0;apply(amount,panels);
    this.add({id,b,f,x,z,radius:3,kind,state,label:()=>`${name}を${state.open?'閉める':'開ける'}`,activate:()=>{state.open=!state.open;this.toast(`${name}を${state.open?'開けました':'閉めました'}`);return true;},animate:(_time,dt)=>{
      const target=state.open?1:0;if(Math.abs(target-amount)<.001)return;
      amount+=Math.sign(target-amount)*Math.min(Math.abs(target-amount),dt*.9);apply(amount,panels);this.renderer.shadowMap.needsUpdate=true;
    }});
  }
  washer({id,b,f,x,z,drum,indicator}){
    const state=this.state(id,{running:false,remaining:0,done:false,angle:0});
    indicator.material=this.own(indicator.material.clone());
    const paint=()=>{indicator.material.color.set(state.running?'#79e6c5':state.done?'#e8c878':'#34494a');indicator.material.emissive.set(state.running?'#327d68':'#000000');drum.rotation.z=state.angle;};paint();
    this.add({id,b,f,x,z,radius:2.6,kind:'washer',state,refresh:paint,label:()=>state.running?`洗濯を一時停止（残り${Math.ceil(state.remaining)}秒）`:state.remaining>0?'洗濯を再開する':state.done?'洗濯物を取り出す':'洗濯機を回す（60秒）',activate:()=>{
      if(state.done){state.done=false;this.toast('洗濯物を取り出しました');}
      else {state.running=!state.running;if(state.running&&state.remaining<=0)state.remaining=60;this.toast(state.running?'洗濯を開始しました / この階にいる間、運転します':'洗濯を一時停止しました');}
      paint();return true;
    },animate:(_time,dt)=>{
      if(!state.running)return;
      state.remaining=Math.max(0,state.remaining-dt);state.angle=(state.angle+dt*(state.remaining>15?3:8))%(Math.PI*2);drum.rotation.z=state.angle;
      if(state.remaining===0){state.running=false;state.done=true;paint();this.toast('洗濯が終わりました。洗濯機から取り出せます');}
    }});
    drum.rotation.z=state.angle;
  }
  snapshot(){return this.items.map(({id,kind,state,label})=>({id,kind,state:{...state},label:label()}));}
  lineClear(item){const p=this.player,dx=item.x-p.x,dz=item.z-p.z,dist=Math.hypot(dx,dz);const walls=(item.b.solids[item.f]||[]).filter(o=>o.w<.16||o.d<.16);for(let d=.2;d<dist-.25;d+=.18){const x=p.x+dx*d/dist,z=p.z+dz*d/dist;if(walls.some(o=>Math.abs(x-o.x)<o.w+.015&&Math.abs(z-o.z)<o.d+.015))return false;}return true;}
  nearest(){const p=this.player;let best=null,bestScore=Infinity;for(const item of this.items){if(item.b!==p.building||item.f!==p.floor)continue;const dx=item.x-p.x,dz=item.z-p.z,dist=Math.hypot(dx,dz);if(dist>item.radius)continue;const dot=dist>.1?(-Math.sin(p.yaw)*dx-Math.cos(p.yaw)*dz)/dist:1;if(dot<-.15&&dist>1.1)continue;if(item.kind!=='door'&&!this.lineClear(item))continue;const score=dist+(1-dot)*.7;if(score<bestScore){best=item;bestScore=score;}}return best;}
  use(item=this.nearest()){return item?item.activate():false;}
  update(dt){this.time+=dt;for(const d of this.doors){const target=d.state.open?d.side*Math.PI/2:0;if(Math.abs(target-d.angle)<.001)continue;const next=d.angle+Math.max(-dt*1.8,Math.min(dt*1.8,target-d.angle));if(!this.doorHits(d,this.player.x,this.player.z,.34,next)){d.angle=next;d.pivot.rotation.y=next;this.renderer.shadowMap.needsUpdate=true;}}
    for(const item of this.items)item.animate?.(this.time,dt);
  }
  selfTest(){const tests={},door=this.doors[0];if(door){tests.closedDoorSolid=this.doorHits(door,door.x,door.z+1,.32,0);tests.openDoorPassage=!this.doorHits(door,door.x,door.z+1,.32,door.side*Math.PI/2);}
    for(const kind of ['switch','tv','faucet']){const item=this.items.find(i=>i.kind===kind);if(!item){tests[kind+'Exists']=false;continue;}const key=kind==='tv'?'channel':'on',old=item.state[key];const times=kind==='tv'?3:2;item.activate();tests[kind+'ChangesState']=item.state[key]!==old;for(let n=1;n<times;n++)item.activate();tests[kind+'RestoresState']=item.state[key]===old;}
    for(const kind of ['curtain','cabinet','fridge']){const item=this.items.find(i=>i.kind===kind);tests[kind+'Exists']=!!item;if(item){const old=item.state.open;item.activate();tests[kind+'ChangesState']=item.state.open!==old;item.activate();tests[kind+'RestoresState']=item.state.open===old;}}
    const washer=this.items.find(i=>i.kind==='washer');tests.washerExists=!!washer;
    if(washer){const saved={...washer.state};Object.assign(washer.state,{running:false,remaining:0,done:false});washer.activate();washer.animate(this.time,30);tests.washerAdvances=washer.state.running&&washer.state.remaining===30;washer.activate();washer.animate(this.time,5);tests.washerPauses=washer.state.remaining===30;washer.activate();washer.animate(this.time,30);tests.washerFinishes=washer.state.done&&!washer.state.running&&washer.state.remaining===0;washer.activate();tests.washerUnloads=!washer.state.done;Object.assign(washer.state,saved);washer.refresh();tests.washerRestoresState=Object.keys(saved).every(key=>washer.state[key]===saved[key]);}
    return tests;
  }
};

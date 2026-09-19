'use strict';
window.EvercityStories = class EvercityStories {
  constructor(api){
    this.a=api;this.npcs=[];this.time=0;this.saveTimer=0;this.photoMode=false;this.busy=false;this.photoURLs=[];this.db=null;this.sessionPhotos=[];
    this.data=this.readSave();
    const named=n=>api.buildings.find(b=>b.name===n);
    this.maple=named('MAPLE COURT');this.cafe=named('COMMON GROUNDS');this.museum=named('MUSEUM OF FORM');this.atlas=named('ATLAS TOWER');
    this.people=[{id:'hana',name:'ハナ',role:'ガーデン・キーパー',x:14,z:94,color:'#74967d',hello:'ようこそ、エバーシティへ。今日は公園の彫刻を撮ってみませんか？ 見慣れた景色にも、きっと発見があります。'},
      {id:'ren',name:'レン',role:'コモングラウンズの店主',x:this.cafe.x+5,z:this.cafe.z+this.cafe.d/2+5,color:'#c39566',hello:'いらっしゃい。メイプル・コート401号室に届けたいコーヒー豆があるんです。散歩のついでにお願いできますか？'},
      {id:'aya',name:'アヤ',role:'フォーム美術館の学芸員',x:this.museum.x+5,z:this.museum.z+this.museum.d/2+5,color:'#75859a',hello:'建築もアートも、見る角度で表情が変わります。1階の左奥にある彫刻を、写真に残してみてください。'}];
    const talk=(npc,text)=>({type:'talk',npc,text});
    this.missions=[
      {id:'garden',title:'この街で、最初の一枚',tag:'01 / A FIRST IMPRESSION',description:'公園のハナと話し、中央の彫刻を撮影して報告する。',reward:60,steps:[talk('hana','公園のハナと話す'),{type:'photo',text:'公園中央の彫刻を撮影',x:0,z:72,y:4,floor:0,radius:29},talk('hana','ハナに写真の報告をする')]},
      {id:'delivery',title:'一杯の、その向こうへ',tag:'02 / SPECIAL DELIVERY',description:'カフェで荷物を受け取り、マンション4階の401号室前へ届ける。',reward:140,steps:[talk('ren','カフェのレンから荷物を受け取る'),{type:'deliver',text:'メイプル・コート4階・401号室前へ配達',x:this.maple.x-1.65,z:this.maple.z-this.maple.d/2+7.2+(this.maple.d-9.4)*.72,floor:3,b:this.maple},talk('ren','カフェに戻ってレンに報告する')]},
      {id:'art',title:'かたちの記憶',tag:'03 / ART WALK',description:'学芸員のアヤを訪ね、美術館の中にある彫刻を撮影する。',reward:100,steps:[talk('aya','美術館のアヤと話す'),{type:'photo',text:'美術館1階・左奥の彫刻を撮影',x:this.museum.x-this.museum.w*.33,z:this.museum.z-this.museum.d/2+9,y:2.6,floor:0,b:this.museum,radius:26},talk('aya','アヤに撮影したことを伝える')]},
      {id:'skyline',title:'街がひとつになる場所',tag:'04 / ABOVE THE CITY',description:'アトラス・タワーの屋上から、南側に広がる街並みを撮影する。',reward:180,steps:[{type:'photo',text:'アトラス屋上から南側の街並みを撮影',x:this.atlas.x,z:this.atlas.z+6,y:this.atlas.height+2,floor:this.atlas.floors,b:this.atlas,radius:24,look:{x:0,y:65,z:160}}]}
    ];
    for(const m of this.missions){const v=this.data.progress[m.id];this.data.progress[m.id]=Number.isInteger(v)?Math.max(0,Math.min(m.steps.length,v)):0;}
    if(!this.missions.some(m=>m.id===this.data.active))this.data.active='garden';
    this.createResidents();this.createBeacon();this.bind();this.openDatabase();this.renderHUD();
    if(this.data.position)document.getElementById('resume-button').classList.remove('hidden');
  }
  static blank(){return {version:3,active:'garden',progress:{},claimed:[],credits:0,position:null,weather:'clear',time:'golden',autoTime:false};}
  readSave(){try{const raw=JSON.parse(localStorage.getItem('evercity-stories-v3')||'null');if(!raw||raw.version!==3)return EvercityStories.blank();return {...EvercityStories.blank(),...raw,progress:raw.progress&&typeof raw.progress==='object'?raw.progress:{},claimed:Array.isArray(raw.claimed)?raw.claimed.filter(s=>['garden','delivery','art','skyline'].includes(s)):[],credits:Math.max(0,Math.min(99999,Math.floor(Number(raw.credits)||0)))};}catch(e){return EvercityStories.blank();}}
  save(includePosition=true){if(includePosition&&this.a.started()){const p=this.a.player;this.data.position={x:p.x,z:p.z,yaw:p.yaw,pitch:p.pitch,floor:p.floor,bid:(p.building||this.a.current())?.id||null};}
    this.data.time=this.a.getTime();this.data.weather=this.a.environment()?.weather||'clear';this.data.autoTime=this.a.environment()?.autoTime||false;
    try{localStorage.setItem('evercity-stories-v3',JSON.stringify(this.data));document.getElementById('save-status').textContent='この端末に保存済み';return true;}catch(e){document.getElementById('save-status').textContent='保存不可：ブラウザの容量・設定を確認';return false;}}
  active(){return this.missions.find(m=>m.id===this.data.active);}
  step(){const m=this.active();return m?.steps[this.data.progress[m.id]||0]||null;}
  goal(){const s=this.step();if(!s)return null;if(s.type==='talk'){const p=this.people.find(p=>p.id===s.npc);return {...p,floor:0,text:s.text};}return s;}
  advance(type,detail){const m=this.active(),s=this.step();if(!s||s.type!==type)return false;if(type==='talk'&&s.npc!==detail)return false;
    this.data.progress[m.id]++;
    if(this.data.progress[m.id]===m.steps.length&&!this.data.claimed.includes(m.id)){this.data.claimed.push(m.id);this.data.credits+=m.reward;this.a.toast(`STORY COMPLETE / ${m.title}　＋${m.reward} EC`);}else this.a.toast('NEXT / '+this.step().text);
    this.save();this.renderHUD();return true;
  }
  createResidents(){const {THREE:T,scene,materials}=this.a;const box=new T.BoxGeometry(1,1,1),sphere=new T.SphereGeometry(1,12,10);
    for(const p of this.people){const g=new T.Group(),shirt=new T.MeshStandardMaterial({color:p.color,roughness:.9}),skin=new T.MeshStandardMaterial({color:'#cda481'});
      const piece=(geo,mat,x,y,z,sx,sy,sz)=>{const mesh=new T.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);g.add(mesh);return mesh;};
      piece(sphere,skin,0,1.68,0,.19,.23,.19);piece(sphere,materials.dark,0,1.84,-.015,.195,.1,.19);piece(box,shirt,0,1.11,0,.51,.82,.31);
      for(const side of [-1,1]){piece(box,materials.navy,side*.13,.46,0,.19,.85,.22);piece(box,skin,side*.33,1.08,0,.12,.68,.16);piece(box,materials.dark,side*.13,.08,.06,.2,.12,.35);}
      if(p.id==='ren')piece(box,materials.woodLight,0,1.03,.175,.42,.62,.05);
      const pin=new T.Mesh(new T.OctahedronGeometry(.17),new T.MeshBasicMaterial({color:'#a5efd0'}));pin.position.y=2.55;g.add(pin);g.position.set(p.x,.32,p.z);scene.add(g);this.npcs.push({...p,g,pin});
      this.a.label(p.name+' / '+p.role,p.x,2.45,p.z+.4,3.7,'#dcf1e2','#25433e');
    }
  }
  createBeacon(){const T=this.a.THREE;this.beacon=new T.Mesh(new T.TorusGeometry(.48,.045,8,32),new T.MeshBasicMaterial({color:'#f4cc8b',depthTest:false,transparent:true,opacity:.8}));this.beacon.rotation.x=Math.PI/2;this.beacon.renderOrder=8;this.a.scene.add(this.beacon);}
  blocked(x,z,floor){return floor===0&&this.people.some(p=>Math.hypot(p.x-x,p.z-z)<.64);}
  near(){const p=this.a.player;if(p.floor===0){const npc=this.people.find(n=>Math.hypot(n.x-p.x,n.z-p.z)<3.4);if(npc)return {kind:'npc',npc,label:npc.name+'と話す'};}
    const s=this.step();if(s?.type==='deliver'&&this.atGoal(s,2.5))return {kind:'deliver',label:'401号室前に荷物を届ける'};return null;
  }
  atGoal(g,radius=g.radius||3){const p=this.a.player;return p.floor===g.floor&&(!g.b||this.a.current()===g.b)&&Math.hypot(p.x-g.x,p.z-g.z)<=radius;}
  use(){const near=this.near();if(!near)return false;if(near.kind==='deliver'){this.advance('deliver');return true;}this.talk(near.npc);return true;}
  talk(npc){const $=id=>document.getElementById(id),s=this.step();$('resident-name').textContent=npc.name;$('resident-role').textContent=npc.role;$('resident-words').textContent=npc.hello;
    const actions=$('resident-actions');actions.replaceChildren();const button=(text,action)=>{const b=document.createElement('button');b.className='primary-button';b.textContent=text;b.onclick=action;actions.append(b);};
    if(s?.type==='talk'&&s.npc===npc.id){const m=this.active();$('resident-words').textContent=this.data.progress[m.id]>0?'見せてくれてありがとう。この街を、少し好きになってくれたなら嬉しいです。':npc.hello;button(this.data.progress[m.id]>0?'報告して報酬を受け取る':npc.id==='ren'?'コーヒー豆の荷物を受け取る':'話を聞いて依頼を進める',()=>{this.advance('talk',npc.id);$('resident-dialog').close();});}
    else button('この人の依頼を確認',()=>{$('resident-dialog').close();this.openJournal();});
    if(npc.id==='ren')button('散歩のコーヒーを買う / 30 EC',()=>{if(this.data.credits<30){this.a.toast('ECが足りません。依頼を完了すると獲得できます。');return;}this.data.credits-=30;this.coffeeUntil=this.time+180;this.save();this.a.toast('コーヒーで一息。3分間、徒歩の速度が少し上がります。');$('resident-dialog').close();});
    this.a.openDialog('resident-dialog');
  }
  openJournal(){const $=id=>document.getElementById(id);$('journal-credits').textContent=this.data.credits+' EC';const list=$('mission-list');list.replaceChildren();
    for(const m of this.missions){const progress=this.data.progress[m.id],done=progress===m.steps.length,card=document.createElement('article');card.className='mission-card'+(this.data.active===m.id?' selected':'');
      const top=document.createElement('div');top.className='eyebrow';top.textContent=m.tag;const h=document.createElement('h3');h.textContent=m.title;const p=document.createElement('p');p.textContent=m.description;const b=document.createElement('button');b.className='secondary-button';b.textContent=done?'完了 ✓':this.data.active===m.id?'追跡中 / '+(progress+1)+'段階目':'この依頼を追跡する';b.disabled=done;b.onclick=()=>{this.data.active=m.id;this.save();this.renderHUD();this.openJournal();};const meta=document.createElement('small');meta.textContent=`${Math.min(progress,m.steps.length)} / ${m.steps.length}　報酬 ${m.reward} EC`;card.append(top,h,p,meta,b);list.append(card);}
    this.a.openDialog('journal-dialog');
  }
  renderHUD(){const $=id=>document.getElementById(id),s=this.step(),g=this.goal(),p=this.a.player,m=this.active();$('story-title').textContent=m?.title||'自由に街を歩こう';$('story-objective').textContent=s?.text||'依頼完了！ 手帳から次の物語へ。';$('story-credits').textContent=this.data.credits+' EC';
    $('parcel-badge').classList.toggle('hidden',!(this.data.progress.delivery===1));
    if(g){const dist=Math.hypot(p.x-g.x,p.z-g.z);let guide=Math.round(dist)+' m';if(g.b&&this.a.current()!==g.b)guide+=' / 建物の入口へ';else if(p.floor!==g.floor)guide+=' / エレベーターで'+(g.floor===g.b?.floors?'RF':g.floor+1+'F')+'へ';else if(dist<3)guide+=' / 到着';$('destination-distance').textContent=guide;const bearing=Math.atan2(-(g.x-p.x),-(g.z-p.z));$('destination-arrow').style.transform=`rotate(${(p.yaw-bearing)*180/Math.PI}deg)`;
      this.beacon.visible=p.floor===g.floor&&(!g.b||this.a.current()===g.b);this.beacon.position.set(g.x,.38+g.floor*5.6,g.z);this.beacon.scale.setScalar(1+Math.sin(this.time*2)*.08);
    }else{$('destination-distance').textContent='すべての場所に、新しい発見を。';this.beacon.visible=false;}
    if(this.photoMode)$('photo-hint').textContent=this.canPhotograph()?'✓ 依頼の被写体を捉えています':'自由に撮影 / 依頼の被写体を中央に入れてください';
  }
  canPhotograph(){const s=this.step();if(s?.type!=='photo'||!this.atGoal(s))return false;const T=this.a.THREE,target=s.look||s;const dir=new T.Vector3();this.a.camera.getWorldDirection(dir);const to=new T.Vector3(target.x-this.a.player.x,target.y-this.a.player.y,target.z-this.a.player.z).normalize();return dir.dot(to)>.82;}
  toggleCamera(force){this.photoMode=force===undefined?!this.photoMode:!!force;document.body.classList.toggle('photo-mode',this.photoMode);document.getElementById('photo-controls').classList.toggle('hidden',!this.photoMode);this.a.start();this.renderHUD();}
  async openDatabase(){try{this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('evercity-photo-album',1);r.onupgradeneeded=()=>r.result.createObjectStore('photos',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}catch(e){this.db=null;}}
  async putPhoto(record){if(!this.db){this.sessionPhotos.unshift(record);this.sessionPhotos=this.sessionPhotos.slice(0,24);return false;}return new Promise(resolve=>{const tx=this.db.transaction('photos','readwrite');tx.objectStore('photos').put(record);tx.oncomplete=()=>resolve(true);tx.onerror=()=>{this.sessionPhotos.unshift(record);resolve(false);};});}
  async photos(){if(!this.db)return [...this.sessionPhotos];return new Promise(resolve=>{const r=this.db.transaction('photos').objectStore('photos').getAll();r.onsuccess=()=>resolve([...r.result,...this.sessionPhotos].sort((a,b)=>b.time-a.time));r.onerror=()=>resolve([...this.sessionPhotos]);});}
  async capture(){if(this.busy)return;this.busy=true;document.getElementById('shutter-button').disabled=true;
    try{const valid=this.canPhotograph();this.a.render();const blob=await new Promise((resolve,reject)=>this.a.renderer.domElement.toBlob(b=>b?resolve(b):reject(Error('capture')),'image/jpeg',.88));const p=this.a.player,record={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),time:Date.now(),title:this.a.current()?.jp||'エバーシティの街角',floor:p.floor,weather:this.a.environment()?.weather||'clear',blob};const saved=await this.putPhoto(record);
      document.getElementById('shutter-flash').classList.add('flash');setTimeout(()=>document.getElementById('shutter-flash').classList.remove('flash'),180);
      if(valid)this.advance('photo');else this.a.toast(saved?'アルバムに写真を保存しました':'写真は今回のセッション内に保存しました');this.trimAlbum();
    }catch(e){this.a.toast('写真を保存できませんでした。ブラウザの保存設定を確認してください。');}finally{this.busy=false;document.getElementById('shutter-button').disabled=false;}}
  async trimAlbum(){const records=await this.photos();for(const record of records.slice(24))this.deletePhoto(record.id);}
  async deletePhoto(id){this.sessionPhotos=this.sessionPhotos.filter(p=>p.id!==id);if(this.db)await new Promise(resolve=>{const tx=this.db.transaction('photos','readwrite');tx.objectStore('photos').delete(id);tx.oncomplete=tx.onerror=()=>resolve();});}
  async openAlbum(){this.a.openDialog('album-dialog');const list=document.getElementById('album-grid');list.textContent='写真を読み込んでいます…';this.photoURLs.forEach(URL.revokeObjectURL);this.photoURLs=[];const records=await this.photos();list.replaceChildren();if(!records.length){const p=document.createElement('p');p.textContent='まだ写真がありません。カメラで街の一枚を撮ってみましょう。';list.append(p);}
    for(const record of records){const card=document.createElement('article'),img=document.createElement('img'),url=URL.createObjectURL(record.blob);this.photoURLs.push(url);img.src=url;img.alt=record.title;img.loading='lazy';const p=document.createElement('p');p.textContent=record.title+' / '+(record.floor+1)+'F';const link=document.createElement('a');link.href=url;link.download='evercity-'+record.id+'.jpg';link.textContent='写真を保存 ↓';const del=document.createElement('button');del.textContent='削除';del.onclick=async()=>{if(confirm('この写真をアルバムから削除しますか？')){await this.deletePhoto(record.id);this.openAlbum();}};card.append(img,p,link,del);list.append(card);}}
  resume(){const saved=this.data.position;if(!saved){this.a.toast('再開できる記録がありません');return;}if(![saved.x,saved.z,saved.yaw,saved.pitch,saved.floor].every(Number.isFinite)){this.a.toast('位置記録が壊れているため再開できません');return;}
    const b=this.a.buildings.find(b=>b.id===saved.bid);if(saved.floor>0&&!b){this.a.toast('保存した建物が見つかりません');return;}if(saved.floor>0)this.a.loadFloor(b,Math.max(1,Math.min(b.floors,Math.floor(saved.floor))));else this.a.teleport({park:true,x:0,z:72,jp:'セントラル・ガーデン'});
    const p=this.a.player;if(Math.abs(saved.x)<=329&&Math.abs(saved.z)<=330&&!this.a.blocked(saved.x,saved.z)){p.x=saved.x;p.z=saved.z;}p.yaw=saved.yaw;p.pitch=Math.max(-1.35,Math.min(1.35,saved.pitch));this.a.setTime(['day','golden','night'].includes(this.data.time)?this.data.time:'golden');document.getElementById('time-select').value=this.a.getTime();const env=this.a.environment();if(env){env.setWeather(this.data.weather);env.autoTime=!!this.data.autoTime;document.getElementById('auto-time').checked=env.autoTime;}this.a.start();this.a.closeDialogs();this.a.toast('前回の探索から再開しました');}
  bind(){const $=id=>document.getElementById(id);$('journal-button').onclick=()=>this.openJournal();$('story-card').onclick=()=>this.openJournal();$('camera-button').onclick=()=>this.toggleCamera();$('camera-close').onclick=()=>this.toggleCamera(false);$('shutter-button').onclick=()=>this.capture();$('album-button').onclick=() =>this.openAlbum();$('photo-album-button').onclick=()=>this.openAlbum();$('resume-button').onclick=()=>this.resume();$('save-button').onclick=()=>{this.a.toast(this.save()?'現在地と依頼を保存しました':'保存に失敗しました');};
    addEventListener('keydown',e=>{if(this.a.dialogOpen()||e.repeat)return;if(e.code==='KeyJ')this.openJournal();if(e.code==='KeyP')this.toggleCamera();if(e.code==='Enter'&&this.photoMode){e.preventDefault();this.capture();}if(e.code==='Escape'&&this.photoMode)this.toggleCamera(false);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.save();});
  }
  update(dt){this.time+=dt;this.saveTimer+=dt;if(this.saveTimer>10){this.saveTimer=0;this.save();}if(Math.floor(this.time*5)!==this.lastHUD){this.lastHUD=Math.floor(this.time*5);this.renderHUD();}for(const n of this.npcs){n.pin.position.y=2.55+Math.sin(this.time*1.6)*.07;n.pin.rotation.y+=dt*.7;}}
  drawGoal(ctx,px,pz){const g=this.goal();if(!g)return;ctx.strokeStyle='#f3cb86';ctx.fillStyle='#f3cb86';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(px(g.x),pz(g.z),4,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(px(g.x),pz(g.z),1.5,0,Math.PI*2);ctx.fill();}
  selfTest(){const copy=structuredClone(this.data),position={...this.a.player},tests={};const originalToast=this.a.toast,originalSave=this.save;this.a.toast=()=>{};this.save=()=>true;
    try{this.data=EvercityStories.blank();this.data.progress={garden:0,delivery:0,art:0,skyline:0};tests.wrongPersonRejected=!this.advance('talk','ren');tests.firstTalkAdvances=this.advance('talk','hana')&&this.data.progress.garden===1;tests.cannotSkipPhoto=!this.advance('talk','hana');this.advance('photo');this.advance('talk','hana');tests.rewardPaid=this.data.credits===60;this.advance('talk','hana');tests.noDuplicateReward=this.data.credits===60;this.data.active='delivery';this.advance('talk','ren');tests.parcelTracked=this.data.progress.delivery===1;const s=this.step();this.a.player.floor=0;tests.wrongFloorRejected=!this.atGoal(s);this.advance('deliver');this.advance('talk','ren');tests.deliveryReward=this.data.credits===200;tests.fourStories=this.missions.length===4;tests.threeResidents=this.npcs.length===3;}
    finally{this.data=copy;Object.assign(this.a.player,position);this.a.toast=originalToast;this.save=originalSave;this.renderHUD();}return tests;
  }
};

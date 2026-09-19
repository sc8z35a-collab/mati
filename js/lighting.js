'use strict';
window.EvercityLighting = class EvercityLighting {
  // Three r158 hook: only the sun uses the radius > 100 sentinel. Spotlights retain PCF.
  static installSunFilter(T) {
    const marker='float getShadow( sampler2D shadowMap';
    const chunk=T.ShaderChunk.shadowmap_pars_fragment;
    if(chunk.includes('evercityPCSS'))return;
    if(!chunk.includes(marker))throw new Error('Unsupported Three.js shadow shader');
    const filter=`
      vec2 evercityDisk(int i, float count) {
        float angle = float(i) * 2.39996323;
        return vec2(cos(angle), sin(angle)) * sqrt((float(i) + .5) / count);
      }
      float evercityPCSS(sampler2D map, vec2 size, vec3 coord, float lightSize, bool ultra) {
        // Receiver-plane bias preserves contact on sloping surfaces.
        vec2 gradient=vec2(0.0);
        #if __VERSION__ >= 300
          vec3 dx=dFdx(coord), dy=dFdy(coord);
          float det=dx.x*dy.y-dx.y*dy.x;
          if(ultra && abs(det)>1e-10)
            gradient=clamp(vec2(dy.y*dx.z-dx.y*dy.z,dx.x*dy.z-dy.x*dx.z)/det,vec2(-2.),vec2(2.));
        #endif
        float angle=ultra?fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453)*6.283185:0.;
        mat2 rotation=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
        float blocker=0.0, blockers=0.0;
        float searchRadius=max(3.0/size.x,lightSize*.18);
        float searchCount=ultra?32.0:12.0;
        vec2 border=1.0/size;
        for(int i=0;i<32;i++) {
          if(float(i)>=searchCount)break;
          vec2 uv=clamp(coord.xy+rotation*evercityDisk(i,searchCount)*searchRadius,border,1.0-border);
          float receiver=coord.z+clamp(dot(gradient,uv-coord.xy),-.003,.003);
          float depth=unpackRGBAToDepth(texture2D(map,uv));
          if(depth<receiver){blocker+=receiver-depth;blockers+=1.0;}
        }
        if(blockers<.5)return 1.0;
        // Orthographic receiver/blocker separation controls the contact-hardening penumbra.
        float radius=clamp((blocker/blockers)*lightSize,.8/size.x,ultra?.016:.008);
        float count=ultra?64.0:(size.x>=4096.0?24.0:16.0);
        float visibility=0.0;
        for(int i=0;i<64;i++) {
          if(float(i)>=count)break;
          vec2 uv=clamp(coord.xy+rotation*evercityDisk(i,count)*radius,border,1.0-border);
          float receiver=coord.z+clamp(dot(gradient,uv-coord.xy),-.003,.003);
          visibility+=texture2DCompare(map,uv,receiver);
        }
        return visibility/count;
      }
    `;
    T.ShaderChunk.shadowmap_pars_fragment=chunk.replace(marker,filter+'\n'+marker)
      .replace('if ( frustumTest ) {',`if ( frustumTest ) {
        if(shadowRadius > 100.0) {
          float edge=min(min(shadowCoord.x,1.0-shadowCoord.x),min(shadowCoord.y,1.0-shadowCoord.y));
          return mix(1.0,evercityPCSS(shadowMap,shadowMapSize,shadowCoord.xyz,shadowRadius-(shadowRadius>200.0?200.0:100.0),shadowRadius>200.0),smoothstep(0.0,.035,edge));
        }`);
  }
  constructor({THREE:T,scene,renderer,player,streetFixtures,vehicles,people,ambient,sun,buildings,batchMeshes}){
    Object.assign(this,{T,scene,renderer,player,streetFixtures,vehicles,people,ambient,sun,buildings,batchMeshes});
    this.elapsed=1;this.shadowElapsed=1;this.shadowUpdates=0;this.lastRoom='';this.quality='high';
    this.direction=new T.Vector3();this.right=new T.Vector3();this.up=new T.Vector3();this.focus=new T.Vector3();this.worldUp=new T.Vector3(0,1,0);
    const makeSpot=(color,angle,range,shadow=false)=>{
      const light=new T.SpotLight(color,0,range,angle,.85,2);light.castShadow=shadow;
      light.shadow.mapSize.set(1024,1024);light.shadow.bias=-.00008;light.shadow.normalBias=.022;
      light.shadow.camera.near=.15;light.shadow.autoUpdate=false;scene.add(light,light.target);return light;
    };
    this.streetLights=Array.from({length:6},()=>makeSpot('#ffdba5',1.15,27));
    this.roomLights=Array.from({length:6},(_,i)=>makeSpot('#ffe6bf',1.2,17,i<2));
    this.headlights=Array.from({length:2},()=>makeSpot('#d9edff',.46,32));
    sun.shadow.autoUpdate=false;
    this.bounce=new T.PointLight('#ffe4c5',0,35,2);scene.add(this.bounce);
    this.fill=new T.DirectionalLight('#a7d4e2',.12);this.fill.position.set(90,100,-160);scene.add(this.fill);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,'rgba(255,234,186,.75)');g.addColorStop(.12,'rgba(255,226,162,.23)');g.addColorStop(1,'rgba(255,216,142,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
    const tex=new T.CanvasTexture(canvas);
    this.halos=this.streetLights.map(()=>{const sprite=new T.Sprite(new T.SpriteMaterial({map:tex,transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:0}));sprite.scale.set(2.4,2.4,1);scene.add(sprite);return sprite;});
  }
  setQuality(value){
    this.quality=['hdr-ultra','ultra','high','balanced'].includes(value)?value:'high';
    this.span={'hdr-ultra':112,ultra:112,high:140,balanced:170}[this.quality];
    const localSize=Math.min(this.renderer.capabilities.maxTextureSize,this.quality==='hdr-ultra'?2048:1024);
    for(const light of [...this.streetLights,...this.roomLights,...this.headlights]){
      if(light.shadow.mapSize.x!==localSize){light.shadow.map?.dispose();light.shadow.map=null;light.shadow.mapSize.set(localSize,localSize);}
      light.shadow.needsUpdate=true;
    }
    const c=this.sun.shadow.camera;
    Object.assign(c,{left:-this.span,right:this.span,top:this.span,bottom:-this.span,near:1,far:900});c.updateProjectionMatrix();
    this.sun.shadow.bias=-.000025;this.sun.shadow.normalBias=this.quality==='balanced'?.1:this.quality==='hdr-ultra'?.018:.035;
    this.buildings.forEach(b=>{b.shadowProxy.visible=this.quality==='balanced';});
    // Transparent glass must not become opaque in the depth map. Real slabs/walls cast instead.
    this.batchMeshes.forEach((mesh,key)=>{mesh.castShadow=!mesh.material.transparent&&
      (this.quality!=='balanced'||/:(leaf|leaf2|trunk):/.test(key));});
    this.elapsed=1;this.shadowElapsed=1;this.renderer.shadowMap.needsUpdate=true;
  }
  followSun(mode,weather){
    const {sun,player:p,direction,right,up,focus}=this;
    direction.set(mode==='day'?90:-130,mode==='day'?300:200,95).normalize();
    right.crossVectors(this.worldUp,direction).normalize();up.crossVectors(direction,right).normalize();
    focus.set(p.x,Math.max(0,p.y-1.7),p.z);
    const texel=this.span*2/sun.shadow.mapSize.x;
    const x=Math.round(focus.dot(right)/texel)*texel,y=Math.round(focus.dot(up)/texel)*texel,z=Math.round(focus.dot(direction)/texel)*texel;
    sun.target.position.copy(right).multiplyScalar(x).addScaledVector(up,y).addScaledVector(direction,z);
    sun.position.copy(sun.target.position).addScaledVector(direction,420);
    // Sun angular radius ~0.27 degrees; overcast increases the effective source size.
    const angular=weather==='clear'?.0047:weather==='cloudy'?.014:.022;
    sun.shadow.radius=this.quality==='balanced'?1:(this.quality==='hdr-ultra'?200:100)+angular*899/(2*this.span);
  }
  update(dt,building,mode,weather='clear'){
    this.elapsed+=dt;this.shadowElapsed+=dt;
    const p=this.player,night=mode==='night',golden=mode==='golden',indoor=!!building&&p.floor<building.floors;
    const interval={'hdr-ultra':0,ultra:1/30,high:1/20,balanced:1/10}[this.quality];
    if(this.shadowElapsed>=interval){
      this.followSun(mode,weather);
      const range=this.quality==='hdr-ultra'?1200:this.quality==='ultra'?85:this.quality==='high'?60:32;
      for(const actor of [...this.vehicles,...this.people]){
        const near=(actor.g.position.x-p.x)**2+(actor.g.position.z-p.z)**2<range*range;
        actor.g.traverse(mesh=>{if(mesh.isMesh)mesh.castShadow=near&&!mesh.material.transparent;});
      }
      this.sun.shadow.needsUpdate=true;
      for(const l of [...this.roomLights,...this.streetLights,...this.headlights])if(l.castShadow&&l.intensity>0)l.shadow.needsUpdate=true;
      this.renderer.shadowMap.needsUpdate=true;this.shadowElapsed=0;this.shadowUpdates++;
    }
    if(this.elapsed<(this.quality==='hdr-ultra'?0:.18))return;this.elapsed=0;
    const nearby=[...this.streetFixtures].sort((a,b)=>(a.x-p.x)**2+(a.z-p.z)**2-((b.x-p.x)**2+(b.z-p.z)**2));
    this.streetLights.forEach((light,i)=>{const f=nearby[i];if(!f)return;light.position.set(f.x,6.35,f.z);light.target.position.set(f.x,.12,f.z+.4);const distance=Math.hypot(f.x-p.x,f.z-p.z);light.intensity=distance<85&&!indoor?(night?420:golden?65:0):0;light.castShadow=i<(this.quality==='hdr-ultra'?6:this.quality==='ultra'?2:this.quality==='high'?1:0)&&night&&!indoor;this.halos[i].position.copy(light.position);this.halos[i].material.opacity=light.intensity>0?(night?.34:.08):0;});
    const fixtures=indoor?[...(building.lights?.[p.floor]||[])].filter(f=>f.enabled!==false&&(building.type!=='residential'||Math.abs(p.x-building.x)<3.4||Math.abs(f.x-building.x)<3.4||Math.sign(f.x-building.x)===Math.sign(p.x-building.x))).sort((a,b)=>(a.x-p.x)**2+(a.z-p.z)**2-((b.x-p.x)**2+(b.z-p.z)**2)):[];
    this.roomLights.forEach((light,i)=>{const f=fixtures[i];light.intensity=f?f.intensity*(night?2:1.4):0;light.castShadow=!!f&&i<(this.quality==='hdr-ultra'?6:this.quality==='balanced'?1:2);if(f){light.position.set(f.x,f.y,f.z);light.target.position.set(f.x,f.y-4.5,f.z);light.color.set(f.color);}});
    this.bounce.intensity=indoor?(night?16:9):0;if(indoor)this.bounce.position.set(building.x,p.floor*5.6+3.3,building.z+building.d*.26);
    this.fill.intensity=night?.025:golden?.1:.14;
    const nearestCars=[...this.vehicles].sort((a,b)=>(a.g.position.x-p.x)**2+(a.g.position.z-p.z)**2-((b.g.position.x-p.x)**2+(b.g.position.z-p.z)**2));
    this.headlights.forEach((light,i)=>{const v=nearestCars[i];if(!v)return;const x=v.axis?v.pos:v.lane,z=v.axis?v.lane:v.pos;light.position.set(x+(v.axis?v.dir*2:0),.83,z+(v.axis?0:v.dir*2));light.target.position.set(x+(v.axis?v.dir*20:0),.15,z+(v.axis?0:v.dir*20));light.intensity=night&&!indoor?190:0;light.castShadow=this.quality==='hdr-ultra'&&night&&!indoor;});
    for(const light of [...this.streetLights,...this.roomLights,...this.headlights])if(light.castShadow)light.shadow.needsUpdate=true;
    this.renderer.shadowMap.needsUpdate=true;
  }
  snapshot(){return {quality:this.quality,pcssSamples:this.quality==='hdr-ultra'?[32,64]:[12,this.quality==='ultra'?24:16],localShadowSize:this.roomLights[0].shadow.mapSize.x,filter:this.quality==='balanced'?'PCF':'PCSS',shadowSize:this.sun.shadow.mapSize.x,shadowTexelMeters:2*this.span/this.sun.shadow.mapSize.x,shadowUpdates:this.shadowUpdates,registeredStreetFixtures:this.streetFixtures.length,streetLights:this.streetLights.filter(l=>l.intensity>0).length,streetShadows:this.streetLights.filter(l=>l.castShadow).length,roomLights:this.roomLights.filter(l=>l.intensity>0).length,roomShadows:this.roomLights.filter(l=>l.castShadow).length,headlights:this.headlights.filter(l=>l.intensity>0).length,dynamicCasters:[...this.vehicles,...this.people].filter(a=>a.g.children.some(m=>m.castShadow)).length};}
};

// Linear half-float scene -> bright-pass + separable bloom -> contact AO -> ACES -> sRGB.
// BALANCED/WebGL1 retains the direct rendering path and allocates no HDR buffers.
window.EvercityHDR = class EvercityHDR {
  constructor(T,renderer,camera){
    Object.assign(this,{T,renderer,camera});this.quality='balanced';this.size=new T.Vector2();this.supported=renderer.capabilities.isWebGL2&&renderer.extensions.has('EXT_color_buffer_float');
    this.screen=new T.Scene();this.screenCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
    this.quad=new T.Mesh(new T.PlaneGeometry(2,2));this.quad.frustumCulled=false;this.screen.add(this.quad);
    const vertexShader='varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
    this.blur=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,vertexShader,uniforms:{source:{value:null},stepUV:{value:new T.Vector2()},extract:{value:0}},fragmentShader:`
      varying vec2 vUv;uniform sampler2D source;uniform vec2 stepUV;uniform float extract;
      vec3 sampleLight(vec2 uv){vec3 c=texture2D(source,uv).rgb;float l=max(max(c.r,c.g),c.b);return extract>.5?c*smoothstep(1.1,2.8,l):c;}
      void main(){vec3 c=sampleLight(vUv)*.227027;
        c+=(sampleLight(vUv+stepUV*1.384615)+sampleLight(vUv-stepUV*1.384615))*.316216;
        c+=(sampleLight(vUv+stepUV*3.230769)+sampleLight(vUv-stepUV*3.230769))*.070270;
        gl_FragColor=vec4(c,1.);}`});
    this.composite=new T.ShaderMaterial({depthTest:false,depthWrite:false,vertexShader,uniforms:{sceneColor:{value:null},sceneDepth:{value:null},bloom:{value:null},inverseProjection:{value:new T.Matrix4()},pixel:{value:new T.Vector2()},projectionScale:{value:1},aoStrength:{value:.6},bloomStrength:{value:.07},samples:{value:12}},fragmentShader:`
      varying vec2 vUv;uniform sampler2D sceneColor,sceneDepth,bloom;uniform mat4 inverseProjection;
      uniform vec2 pixel;uniform float projectionScale,aoStrength,bloomStrength,samples;
      vec3 viewPosition(vec2 uv){float d=texture2D(sceneDepth,uv).x;vec4 p=inverseProjection*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}
      void main(){
        float depth=texture2D(sceneDepth,vUv).x;vec3 p=viewPosition(vUv);
        vec3 dx1=viewPosition(vUv+vec2(pixel.x,0.))-p,dx2=p-viewPosition(vUv-vec2(pixel.x,0.));
        vec3 dy1=viewPosition(vUv+vec2(0.,pixel.y))-p,dy2=p-viewPosition(vUv-vec2(0.,pixel.y));
        vec3 normal=cross(abs(dx1.z)<abs(dx2.z)?dx1:dx2,abs(dy1.z)<abs(dy2.z)?dy1:dy2);
        vec3 n=normal/max(length(normal),.000001);
        float occlusion=0.;
        if(depth<.99999 && -p.z<95.){
          float screenRadius=min(.09,.7*projectionScale/max(-p.z,.3));
          for(int i=0;i<64;i++){
            if(float(i)>=samples)break;
            float a=float(i)*2.39996323;
            float radiusScale=samples>32.?(mod(float(i),2.)<.5?.4:1.7):1.;
            vec2 uv=vUv+vec2(cos(a)*pixel.x/pixel.y,sin(a))*screenRadius*radiusScale*sqrt((float(i)+.5)/samples);
            if(uv.x<=0.||uv.y<=0.||uv.x>=1.||uv.y>=1.)continue;
            vec3 delta=viewPosition(uv)-p;float dist=length(delta);
            float horizon=max(dot(n,delta)/max(dist,.001)-.12,0.);
            occlusion+=horizon*(1.-smoothstep(.12,.85*radiusScale,dist))*smoothstep(.02,.08,dist);
          }
        }
        float ao=1.-clamp(occlusion/samples*aoStrength*3.,0.,.42);
        vec3 color=texture2D(sceneColor,vUv).rgb*ao+texture2D(bloom,vUv).rgb*bloomStrength;
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  }
  release(){
    if(this.target){this.target.dispose();this.bloomA.dispose();this.bloomB.dispose();this.target=null;this.bloomA=null;this.bloomB=null;}
  }
  setQuality(value){this.quality=value;this.enabled=this.supported&&value!=='balanced';if(!this.enabled)this.release();else this.resize();}
  resize(){
    if(!this.enabled)return;
    const {T,renderer}=this;renderer.getDrawingBufferSize(this.size);
    // Only legacy presets have a pixel budget. Offline capture uses 8x jittered SSAA instead of redundant MSAA.
    const scale=this.quality==='hdr-ultra'?1:Math.min(1,Math.sqrt(3200000/(this.size.x*this.size.y)));
    const w=Math.max(1,Math.floor(this.size.x*scale)),h=Math.max(1,Math.floor(this.size.y*scale));
    const samples=this.captureActive?0:Math.min(this.quality==='hdr-ultra'?4:2,renderer.capabilities.maxSamples);
    if(this.target?.width===w&&this.target?.height===h&&this.target.samples===samples)return;
    this.release();
    this.target=new T.WebGLRenderTarget(w,h,{type:T.HalfFloatType,depthBuffer:true});
    this.target.depthTexture=new T.DepthTexture(w,h,T.UnsignedIntType);
    this.target.samples=samples;
    this.bloomA=new T.WebGLRenderTarget(Math.max(1,w>>2),Math.max(1,h>>2),{type:T.HalfFloatType,depthBuffer:false});this.bloomB=this.bloomA.clone();
    // Some WebGL2 drivers expose float support but cannot render this framebuffer combination.
    renderer.setRenderTarget(this.target);
    const gl=renderer.getContext(),complete=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
    renderer.setRenderTarget(null);
    if(!complete){this.release();this.enabled=false;console.warn('HDR framebuffer unavailable; using direct ACES rendering.');return;}
    this.composite.uniforms.pixel.value.set(1/w,1/h);
  }
  render(scene,mode){
    const r=this.renderer;
    const exposure=mode==='night'?1.35:mode==='day'?1.02:1.12;
    r.toneMappingExposure+= (exposure-r.toneMappingExposure)*.035;
    if(!this.enabled){r.render(scene,this.camera);return;}
    r.setRenderTarget(this.target);r.render(scene,this.camera);
    this.lastSceneCalls=r.info.render.calls;
    this.finish(mode);
  }
  finish(mode,source=this.target.texture){
    const r=this.renderer;
    this.quad.material=this.blur;
    const b=this.blur.uniforms;b.source.value=source;b.extract.value=1;b.stepUV.value.set(1/this.bloomA.width,0);
    r.setRenderTarget(this.bloomA);r.render(this.screen,this.screenCamera);
    b.source.value=this.bloomA.texture;b.extract.value=0;b.stepUV.value.set(0,1/this.bloomA.height);
    r.setRenderTarget(this.bloomB);r.render(this.screen,this.screenCamera);
    this.quad.material=this.composite;
    const u=this.composite.uniforms;u.sceneColor.value=source;u.sceneDepth.value=this.target.depthTexture;u.bloom.value=this.bloomB.texture;
    u.inverseProjection.value.copy(this.camera.projectionMatrixInverse);u.projectionScale.value=this.camera.projectionMatrix.elements[5]*.5;
    u.samples.value=this.quality==='hdr-ultra'?64:this.quality==='ultra'?16:8;u.aoStrength.value=this.quality==='hdr-ultra'?.85:this.quality==='ultra'?.7:.5;u.bloomStrength.value=mode==='night'?.1:.055;
    r.setRenderTarget(null);r.render(this.screen,this.screenCamera);
  }
  async capture(scene,mode,{progress=()=>{},signal}={}){
    if(!this.enabled||this.quality!=='hdr-ultra')throw Error('4K HDR ULTRAにはWebGL2と浮動小数点HDR描画が必要です。');
    const {T,renderer:r}=this,w=3840,h=2160,gl=r.getContext();
    // Render true-resolution tiles, never upscale. Guard pixels cover the maximum AO
    // footprint (0.09 * 1.7 * tileHeight), bloom taps and subpixel jitter.
    const tileW=1280,tileH=720,pad=192,renderW=tileW+pad*2,renderH=tileH+pad*2;
    const maxViewport=gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    if(Math.min(r.capabilities.maxTextureSize,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),maxViewport[0])<renderW||maxViewport[1]<renderH)
      throw Error('このGPUではHDR撮影用の描画領域を確保できません。通常撮影をご利用ください。');
    const original={camera:this.camera,size:r.getSize(new T.Vector2()),ratio:r.getPixelRatio(),exposure:r.toneMappingExposure,autoClear:r.autoClear,clearColor:r.getClearColor(new T.Color()),clearAlpha:r.getClearAlpha()};
    const photoCamera=this.camera.clone(),aspect=w/h;
    // Match the centered 16:9 crop shown by the photo guide, without stretching.
    photoCamera.fov=T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(photoCamera.fov/2))*Math.min(1,photoCamera.aspect/aspect)));
    photoCamera.aspect=aspect;photoCamera.clearViewOffset();photoCamera.updateProjectionMatrix();
    let sum,accumulate;
    const output=document.createElement('canvas');output.width=w;output.height=h;
    const context=output.getContext('2d');if(!context)throw Error('4K画像の保存領域を確保できませんでした。');
    const check=()=>{if(signal?.aborted)throw new DOMException('撮影を中止しました。','AbortError');if(gl.isContextLost())throw Error('GPUの描画が中断されました。ページを再読み込みしてください。');};
    const yieldFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    try{
      this.captureActive=true;this.camera=photoCamera;r.setPixelRatio(1);r.setSize(renderW,renderH,false);this.resize();check();
      if(!this.enabled||!this.target)throw Error('4K HDR用メモリを確保できませんでした。');
      if(gl.drawingBufferWidth!==renderW||gl.drawingBufferHeight!==renderH)throw Error('4K描画領域を確保できませんでした。');
      sum=new T.WebGLRenderTarget(renderW,renderH,{type:T.HalfFloatType,depthBuffer:false});
      r.setRenderTarget(sum);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('HDR合成用メモリを確保できませんでした。');
      accumulate=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,transparent:true,
        blending:T.CustomBlending,blendEquation:T.AddEquation,blendSrc:T.OneFactor,blendDst:T.OneFactor,vertexShader:this.blur.vertexShader,
        uniforms:{current:{value:null}},fragmentShader:`
          varying vec2 vUv;uniform sampler2D current;
          void main(){gl_FragColor=vec4(texture2D(current,vUv).rgb/8.,0.);}`});
      r.toneMappingExposure=mode==='night'?1.35:mode==='day'?1.02:1.12;
      // Symmetric eight-point pattern; actors, weather and light exposure remain frozen.
      const offsets=[[-.375,-.125],[.375,.125],[-.125,.375],[.125,-.375],[-.375,.375],[.375,-.375],[-.125,-.125],[.125,.125]];
      let tile=0;
      for(let y=0;y<h;y+=tileH)for(let x=0;x<w;x+=tileW){
        check();r.setRenderTarget(sum);r.setClearColor(0,0);r.clear();r.setClearColor(original.clearColor,original.clearAlpha);
        for(let i=0;i<offsets.length;i++){
          progress(`4K HDR ULTRA / タイル ${tile+1}/9 · サンプル ${i+1}/8`,(tile*8+i)/80);
          await yieldFrame();check();
          photoCamera.setViewOffset(w,h,x-pad+offsets[i][0],y-pad+offsets[i][1],renderW,renderH);
          r.setRenderTarget(this.target);r.render(scene,photoCamera);
          this.quad.material=accumulate;accumulate.uniforms.current.value=this.target.texture;
          r.autoClear=false;r.setRenderTarget(sum);r.render(this.screen,this.screenCamera);r.autoClear=original.autoClear;
        }
        // Unjittered depth for AO, then tone map exactly once. Crop the guard pixels.
        photoCamera.setViewOffset(w,h,x-pad,y-pad,renderW,renderH);
        r.setRenderTarget(this.target);r.render(scene,photoCamera);this.finish(mode,sum.texture);check();
        // Copy synchronously before the non-preserved WebGL drawing buffer is cleared.
        context.drawImage(r.domElement,pad,pad,tileW,tileH,x,y,tileW,tileH);tile++;
      }
      const encoded=new Promise((resolve,reject)=>output.toBlob(blob=>blob?resolve(blob):reject(Error('PNGの生成に失敗しました。')),'image/png'));
      progress('4K PNGを書き出し中',.95);
      const blob=await encoded;check();
      return {blob,width:w,height:h,format:'png',quality:'HDR ULTRA',samples:8,tiles:9,shadowSize:scene.children.find(o=>o.isDirectionalLight&&o.castShadow)?.shadow.mapSize.x,colorSpace:'sRGB / SDR (ACES from linear HDR)'};
    }finally{
      r.setRenderTarget(null);sum?.dispose();accumulate?.dispose();
      output.width=output.height=1;this.captureActive=false;r.autoClear=original.autoClear;r.setClearColor(original.clearColor,original.clearAlpha);
      this.quad.material=this.composite;this.camera=original.camera;r.toneMappingExposure=original.exposure;
      // Drop the large attachments before restoring the interactive resolution.
      this.release();r.setPixelRatio(original.ratio);r.setSize(original.size.x,original.size.y,false);
      if(!gl.isContextLost())this.resize();
    }
  }
  snapshot(){return {enabled:!!this.enabled,supported:this.supported,quality:this.quality,msaa:this.target?.samples||0,aoSamples:this.quality==='hdr-ultra'?64:this.quality==='ultra'?16:8,pipeline:this.enabled?'RGBA16F / ACES / SSAO / BLOOM':'DIRECT / ACES',resolution:this.target?[this.target.width,this.target.height]:null,exposure:this.renderer.toneMappingExposure,sceneCalls:this.lastSceneCalls};}
};

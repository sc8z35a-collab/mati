"use strict";
// EVERCITY detail plugin: 空・大気・自然・音 (owner: agent D). Contract: .collab/ASSIGNMENTS.md
// - Physically-inspired sky (scattering gradient, Mie glow, procedural fbm clouds, distant ranges)
// - Night sky: twinkling procedural stars, ESO Milky Way panorama (CC BY 4.0), NASA LROC moon (PD)
// - Animated sea / pond water (waves, fresnel sky reflection, sun & moon glitter, city light streaks)
// - Wildlife: flocks, gulls, ground pigeons that flee, butterflies, koi, fireflies, lamp moths
// - Weather detail: rain ripples, wind-borne leaves, golden-hour dust motes, passing cloud shade
// - Procedural ambience (Web Audio, no external audio): birdsong, crickets, surf, gulls, wind, city hum
// Everything is deterministic (seeded) so screenshots are reproducible.
(() => {
  const ASSET = "assets/atmos/";
  // Deterministic PRNG (mulberry32).
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Shared GLSL helpers (hash / value noise / fbm).
  const NOISE = `
    float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
    float h31(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yxz+33.33);return fract((p.x+p.y)*p.z);}
    float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
      return mix(mix(h21(i),h21(i+vec2(1.,0.)),u.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),u.x),u.y);}
    float fbm(vec2 p,float oct){float v=0.,a=.5;mat2 r=mat2(1.6,1.2,-1.2,1.6);
      for(int i=0;i<8;i++){if(float(i)>=oct)break;v+=a*vnoise(p);p=r*p+vec2(3.1,1.7);a*=.5;}return v;}
  `;

  const SKY_FRAG = `
    varying vec3 vPos;
    uniform vec3 top,bottom,sunColor,sunDirection,fogColor,moonDirection,cloudLight,cloudShade;
    uniform float time,night,golden,coverage,octaves,rain,hasMilky,hasMoon,moonPhase,wind;
    uniform sampler2D milky,moonMap;
    uniform mat3 galaxy;
    ${NOISE}
    vec3 stars(vec3 p,float scale,float thresh,float gain){
      vec3 sp=p*scale,cell=floor(sp),f=fract(sp)-.5;
      float r=h31(cell);
      if(r<thresh)return vec3(0.);
      vec3 off=vec3(h31(cell+1.7),h31(cell+5.3),h31(cell+9.1))-.5;
      float d=length(f-off*.6);
      float b=(r-thresh)/(1.-thresh);
      float tw=.55+.45*sin(time*(1.7+r*9.)+r*61.);
      vec3 col=mix(vec3(1.,.78,.58),vec3(.68,.8,1.),h31(cell+3.3));
      float core=smoothstep(.32,0.,d);
      return col*core*core*(b*b*2.6+.25)*tw*gain;
    }
    void main(){
      vec3 p=normalize(vPos);
      float h=p.y, hp=max(h,0.);
      // --- base scattering gradient (palette driven by the existing time/weather system)
      vec3 c=mix(bottom,top,pow(hp,.5));
      float haze=exp(-hp*7.5);
      c=mix(c,mix(bottom,fogColor,.55)*1.04,haze*.42);
      vec2 az=normalize(p.xz+1e-5), saz=normalize(sunDirection.xz+1e-5);
      float azd=dot(az,saz)*.5+.5;
      float sd=max(dot(p,sunDirection),0.);
      float day=1.-night;
      // golden hour: warm horizon toward the sun, pink "belt of Venus" opposite
      c+=vec3(1.,.42,.14)*golden*haze*pow(azd,3.)*.62;
      c+=vec3(.95,.52,.62)*golden*haze*(1.-azd)*.16;
      // zenith deepening + Rayleigh-ish blue saturation in clear daylight
      c*=mix(1.,.86,hp*day*(1.-coverage));
      // --- night: light pollution, Milky Way, stars
      c+=vec3(1.,.55,.26)*night*haze*.085*(1.+rain);
      if(night>.002){
        float clear=night*(1.-smoothstep(.55,.98,coverage));
        float alt=smoothstep(.02,.45,h);
        if(hasMilky>.5){
          vec3 q=galaxy*p;
          vec2 uv=vec2(atan(q.x,-q.z)*.15915494+.5,asin(clamp(q.y,-1.,1.))*.31830989+.5);
          vec3 mw=texture2D(milky,uv).rgb;
          c+=mw*mw*1.25*clear*alt;
        }
        c+=(stars(p,260.,.955,1.)+stars(p,520.,.975,.55))*clear*smoothstep(-.02,.25,h);
      }
      // --- distant mountain ranges (periodic in azimuth), hazed into the fog colour
      float a=atan(p.z,p.x);
      vec2 ring=vec2(cos(a),sin(a));
      float far=.018+.05*fbm(ring*2.3+vec2(7.,3.),5.);
      float near=.006+.032*fbm(ring*4.1+vec2(1.,9.),5.);
      vec3 farCol=mix(fogColor,top,.28)*mix(1.,.55,night);
      vec3 nearCol=mix(fogColor,top*.7+bottom*.1,.42)*mix(.92,.42,night);
      float edge=fwidth(h)*1.5+.0008;
      c=mix(c,farCol,smoothstep(far+edge,far-edge,h));
      c=mix(c,nearCol,smoothstep(near+edge,near-edge,h));
      // --- procedural clouds on a curved layer
      float dens=0.;
      if(h>-.02){
        vec2 cuv=p.xz/(hp+.11)*.62+vec2(time*.0045*wind,time*.0016*wind);
        float base=fbm(cuv,octaves);
        float detail=fbm(cuv*3.1-vec2(time*.006,0.),max(octaves-2.,2.));
        float shape=base*.78+detail*.22;
        float thr=1.-coverage;
        dens=smoothstep(thr*.95,thr*.95+.32,shape);
        float toward=fbm(cuv+saz*.09,max(octaves-1.,2.))*.78+detail*.22;
        float lit=clamp(.62+(shape-toward)*3.2,0.,1.);
        float thick=smoothstep(.0,.55,shape-thr);
        vec3 cc=mix(cloudLight,cloudShade,clamp(thick*.85+(1.-lit)*.45,0.,1.));
        // silver lining + golden underside
        cc+=sunColor*pow(sd,5.)*(1.-thick)*.9*day;
        cc+=vec3(1.,.48,.22)*golden*pow(azd,2.)*(1.-thick)*.5;
        // moonlit rims
        cc+=vec3(.55,.62,.8)*night*pow(max(dot(p,moonDirection),0.),6.)*(1.-thick)*.35*hasMoon;
        dens*=smoothstep(-.02,.16,h);
        c=mix(c,cc,dens*.96);
      }
      // --- sun glow + disc (occluded by clouds)
      float sunUp=smoothstep(-.06,.08,sunDirection.y)*day;
      c+=sunColor*(pow(sd,6.)*.10+pow(sd,48.)*.30)*sunUp*(1.-dens*.6);
      c+=sunColor*smoothstep(.99995,.99998,sd)*14.*sunUp*(1.-dens);
      // --- moon (textured, phase-lit, halo)
      if(hasMoon>.5 && night>.002){
        float md=dot(p,moonDirection);
        c+=vec3(.5,.58,.78)*(pow(max(md,0.),700.)*.32+pow(max(md,0.),40.)*.035)*night*(1.-dens*.5);
        const float R=.0135;
        if(md>.9997){
          vec3 rt=normalize(cross(vec3(0.,1.,0.),moonDirection));
          vec3 up=cross(moonDirection,rt);
          vec2 lp=vec2(dot(p,rt),dot(p,up))/R;
          float r2=dot(lp,lp);
          if(r2<1.08){
            vec3 n=vec3(lp,sqrt(max(1.-r2,0.)));
            vec2 muv=vec2(.5+atan(n.x,n.z)*.15915494,.5+asin(clamp(n.y,-1.,1.))*.31830989);
            vec3 alb=texture2D(moonMap,muv).rgb;
            vec3 L=normalize(vec3(sin(moonPhase),.12,cos(moonPhase)));
            float lam=smoothstep(-.06,.18,dot(n,L));
            vec3 mc=alb*(lam*2.6+.035)*vec3(1.,.97,.92);
            float limb=smoothstep(1.02,.94,sqrt(r2));
            c=mix(c,c*.25+mc,limb*night*(1.-dens*.92));
          }
        }
      }
      // below the horizon blend into the city haze so the edge never shows
      c=mix(c,fogColor,smoothstep(.0,-.06,h));
      gl_FragColor=vec4(max(c,vec3(0.)),1.);
    }
  `;

  const WATER_VERT = `
    varying vec3 vWorld;
    void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}
  `;
  const WATER_FRAG = `
    varying vec3 vWorld;
    uniform vec3 top,bottom,sunColor,sunDirection,fogColor,moonDirection,deep,shallow;
    uniform float time,night,golden,fogDensity,scale,rain,alpha,cityLights,shoreZ,choppy,ripple;
    ${NOISE}
    vec2 wave(vec2 x,vec2 d,float k,float w,float a,inout float hgt){
      float ph=dot(d,x)*k+time*w; hgt+=a*sin(ph); return d*(a*k*cos(ph));
    }
    void main(){
      vec2 x=vWorld.xz*scale;
      float hgt=0.;
      vec2 g=vec2(0.);
      g+=wave(x,normalize(vec2(1.,.35)),.21,1.1,.55,hgt);
      g+=wave(x,normalize(vec2(-.4,1.)),.33,1.45,.32,hgt);
      g+=wave(x,normalize(vec2(.8,-.6)),.57,1.9,.18,hgt);
      g+=wave(x,normalize(vec2(-.9,-.2)),.91,2.6,.10,hgt);
      g+=wave(x,normalize(vec2(.2,.98)),1.43,3.3,.06,hgt);
      // fine capillary ripples (finite difference of animated noise)
      vec2 rx=x*2.2+vec2(time*.35,time*.22);
      float n0=fbm(rx,3.),nx=fbm(rx+vec2(.07,0.),3.),nz=fbm(rx+vec2(0.,.07),3.);
      g+=vec2(nx-n0,nz-n0)*(1.2+rain*2.5)*ripple;
      vec3 eye=cameraPosition-vWorld;
      float dist=length(eye);
      vec3 V=eye/dist;
      g*=choppy/(1.+dist*.006);
      vec3 n=normalize(vec3(-g.x,1.,-g.y));
      vec3 R=reflect(-V,n);
      R.y=abs(R.y);
      float hp=max(R.y,0.);
      vec3 sky=mix(bottom,top,pow(hp,.5));
      sky=mix(sky,fogColor,exp(-hp*7.)*.45);
      sky+=vec3(1.,.42,.14)*golden*exp(-hp*6.)*pow(max(dot(normalize(R.xz+1e-5),normalize(sunDirection.xz+1e-5)),0.),3.)*.5;
      float fres=.02+.98*pow(1.-max(dot(n,V),0.),5.);
      float lum=dot(top+bottom,vec3(.3,.5,.2))*.9+.04;
      vec3 body=mix(deep,shallow,clamp(.5+hgt*.35,0.,1.))*lum;
      vec3 col=mix(body,sky,clamp(fres*1.05,0.,1.));
      float day=1.-night;
      float ss=max(dot(R,sunDirection),0.);
      col+=sunColor*(pow(ss,700.)*28.+pow(ss,90.)*.6)*day*(1.-rain*.8);
      float ms=max(dot(R,moonDirection),0.);
      col+=vec3(.75,.82,1.)*(pow(ms,420.)*7.+pow(ms,60.)*.12)*night;
      // warm city-light streaks on the sea at night, shimmering on the swell
      if(cityLights>.001){
        float off=max(shoreZ-vWorld.z,0.);
        float st=vnoise(vec2(vWorld.x*.09,vWorld.z*1.2+time*.6))*vnoise(vec2(vWorld.x*.33+3.,vWorld.z*.4-time*.3));
        float cols=smoothstep(.55,.95,vnoise(vec2(vWorld.x*.045,1.7)));
        col+=vec3(1.,.66,.32)*pow(st,2.2)*cols*exp(-off*.012)*cityLights*1.6;
      }
      // foam where the swell crests near the sea wall
      float foam=smoothstep(.75,1.05,hgt*.6+fbm(x*1.7+time*.2,3.))*exp(-max(shoreZ-vWorld.z,0.)*.08)*cityLights*0.+
                 smoothstep(1.,1.25,hgt*.5+fbm(x*1.3-time*.15,3.))*exp(-max(shoreZ-vWorld.z,0.)*.06)*choppy;
      col=mix(col,vec3(.86,.9,.92)*lum*1.4,clamp(foam,0.,1.)*.55);
      float f=1.-exp(-fogDensity*fogDensity*dist*dist);
      col=mix(col,fogColor,f);
      gl_FragColor=vec4(col,alpha+fres*(1.-alpha));
    }
  `;

  const plugin = {
    name: "atmos",
    owner: "D",
    stats: {},
    flags: {},
    t: 0,
    city(api) {
      // City-time geometry is fine to add here; everything we make is dynamic, so create in ready().
      this.parks = api.parks.map((p) => ({ x: p.x, z: p.z }));
    },
    ready(api) {
      const T = api.THREE;
      this.api = api;
      this.T = T;
      this.time = { value: 0 };
      this.loader = new T.TextureLoader();
      this.mode = api.getTime();
      this.state = { night: 0, golden: 0, coverage: 0.4, light: new T.Color(), shade: new T.Color() };
      this.moonDirection = new T.Vector3(-0.28, 0.5, -0.82).normalize();
      this.buildingGrid = new Map();
      for (const b of api.buildings)
        this.buildingGrid.set(Math.round(b.x / 72) + ":" + Math.round(b.z / 72), b);
      this.setupSky();
      this.setupWater();
      this.setupBirds();
      this.setupPigeons();
      this.setupButterflies();
      this.setupKoi();
      this.setupGlows();
      this.setupLeaves();
      this.setupRipples();
      this.setupAudio();
      this.timeChanged(api, api.getTime());
      this.update(0.016, api, false);
    },
  };
  window.__atmosPlugin = plugin;
  (window.EvercityDetails ||= []).push(plugin);
})();

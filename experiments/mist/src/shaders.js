// GLSL for MinoxPak: the mist. Everything on screen is drawn here.

export const COMMON = /* glsl */`
float hash11(float p){p=fract(p*.1031);p*=p+33.33;p*=p+p;return fract(p);}
vec2 hash21(float p){vec3 p3=fract(vec3(p)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
vec3 hash31(float p){vec3 p3=fract(vec3(p)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xxy+p3.yzz)*p3.zyx);}
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),f.x),f.y);}
float follX(float cell){return (cell+.5+(hash11(cell+40.)-.5)*.45)*.62;}
`;

// Studio: one large soft source upper left, a strip on the right, pale floor bounce.
export const ENV = /* glsl */`
vec3 env(vec3 d){
  float az=atan(d.x,d.z); float el=d.y;
  vec3 c=vec3(.50,.52,.52)*(.75+.35*el);
  float key=smoothstep(.07,.0,abs(az+.80)-.17)*smoothstep(.80,.62,abs(el-.10));
  float strip=smoothstep(.03,.0,abs(az-1.05)-.05)*smoothstep(.85,.7,abs(el-.05));
  float top=smoothstep(.55,.95,el);
  float back=smoothstep(.5,.0,abs(abs(az)-2.7)-.15)*smoothstep(.6,.2,abs(el));
  c+=key*vec3(7.5,7.6,7.8)+strip*vec3(4.2,4.2,4.4)+top*1.4+back*.6;
  c+=smoothstep(-.2,-.9,el)*vec3(.5,.5,.48);
  return c;
}
`;

export const QUAD_VS = /* glsl */`
varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,.99999,1.);}
`;

// ---------------------------------------------------------------- backdrop
export const BG_FS = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform float uTime,uAspect,uGY,uU,uReveal,uGrow,uSeep;
uniform vec4 uBottle;
${COMMON}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
void main(){
  vec2 uv=vUv; vec2 p=(uv-.5)*vec2(uAspect,1.);
  vec3 col=mix(vec3(.842,.853,.846),vec3(.928,.934,.928),smoothstep(-.15,1.05,uv.y));
  vec2 lp=p-vec2(-.42*uAspect,.42);
  col+=exp(-dot(lp,lp)*1.1)*.045;
  float band=vnoise(vec2((p.x*.9+p.y*.55)*1.3-uTime*.018,2.7))*.6+vnoise(vec2((p.x+p.y*.6)*3.1+uTime*.012,9.1))*.4;
  col*=1.-.05*smoothstep(.35,.8,band);
  float veil=vnoise(vec2(p.x*1.1-uTime*.035,p.y*2.3+uTime*.01))*vnoise(vec2(p.x*2.7+uTime*.02,p.y*4.-4.));
  col+=smoothstep(.18,.6,veil)*.045;
  // the bottle takes the light and gives some of it back, warm
  vec2 d=(uv-uBottle.xy)*vec2(uAspect,1.)-vec2(.5,-.34)*uBottle.z;
  vec2 e=d*vec2(1.,.52);
  float sh=exp(-dot(e,e)/(uBottle.z*uBottle.z*.55));
  col*=1.-.20*sh*uBottle.w;
  vec2 e2=(d-vec2(.05,-.1)*uBottle.z)*vec2(1.6,.6);
  float ca=exp(-dot(e2,e2)/(uBottle.z*uBottle.z*.10));
  col+=vec3(.42,.20,.02)*ca*.09*uBottle.w;

  float D=(uGY-uv.y)/uU;            // world units under the scalp surface
  if(D>0.){
    float X=(uv.x-.5)*uAspect/uU;
    vec3 slab=mix(vec3(.800,.806,.796),vec3(.858,.864,.856),smoothstep(0.,2.2,D));
    vec3 skin=mix(vec3(.815,.800,.782),vec3(.872,.868,.858),smoothstep(.05,1.9,D));
    float grain=vnoise(vec2(X*14.,D*14.))*.6+vnoise(vec2(X*40.,D*40.))*.4;
    skin*=.985+.03*grain;
    float epi=smoothstep(.115,.075,D+.012*sin(X*9.)+.01*sin(X*23.));
    skin=mix(skin,vec3(.770,.742,.715),epi*.85);
    skin=mix(skin,vec3(.70,.67,.64),smoothstep(.022,.0,D)*.6);
    vec3 c=mix(slab,skin,uReveal);
    c+=smoothstep(.012,.0,D)*.05;
    if(uReveal>.002){
      float sp=.62; float ci=floor(X/sp);
      float seepAcc=0.;
      for(int j=-1;j<=1;j++){
        float cell=ci+float(j);
        float cx=follX(cell);
        float lean=(hash11(cell+9.)-.5)*.30;
        float depth=mix(.9,1.25,hash11(cell+3.));
        float g=clamp(uGrow*1.25-hash11(cell+77.)*.25,0.,1.);
        vec2 q=vec2(X-cx-lean*D*(1.-.35*D/depth),D);
        float tr=mix(.040,.066,smoothstep(0.,depth,D));
        float tube=max(abs(q.x)-tr,D-depth);
        float bulb=length(vec2(q.x,(D-depth)*.72))-.125;
        float sd=smin(tube,bulb,.10);
        // sebaceous gland, a soft lobe on one side
        float side=hash11(cell+21.)>.5?1.:-1.;
        float gl=length(vec2(q.x-side*.115,(D-depth*.33)*.8))-.062;
        float sdg=smin(sd,gl,.07);
        float fill=smoothstep(.012,-.012,sdg);
        float rim=smoothstep(.02,.0,abs(sdg));
        float core=smoothstep(.0,-.07,sd);
        vec3 form=mix(vec3(.70,.735,.72),vec3(.90,.915,.905),core*.8);
        c=mix(c,c*.93,smoothstep(.14,.0,sdg)*.5*uReveal);
        c=mix(c,form,fill*.62*uReveal);
        c=mix(c,vec3(.46,.52,.50),rim*.42*uReveal);
        // glassy highlight along the left wall
        c+=smoothstep(.014,.0,abs(sd+.022))*step(q.x,0.)*.10*fill*uReveal;
        // papilla: the small dome the hair grows from
        float pap=length(vec2(q.x,(D-depth-.085)*1.25))-.052;
        float pulse=.75+.25*sin(uTime*1.4+cell*2.1);
        c=mix(c,vec3(.055,.33,.265),smoothstep(.012,-.012,pap)*.85*uReveal);
        c+=vec3(.05,.20,.15)*exp(-max(pap,0.)*26.)*.5*pulse*uSeep*uReveal;
        // the hair shaft climbs from the bulb to the surface
        float topD=mix(depth-.10,-.05,smoothstep(0.,.5,g));
        float sw=mix(.015,.011,smoothstep(depth,0.,D));
        float shaft=smoothstep(sw+.006,sw-.004,abs(q.x))*step(topD,D)*step(D,depth-.03);
        vec3 hair=vec3(.075,.062,.058)+vec3(.30,.26,.22)*smoothstep(sw,.0,abs(q.x+sw*.4))*.5;
        c=mix(c,hair,shaft*uReveal);
        seepAcc+=exp(-abs(q.x)*9.)*exp(-D*1.6);
      }
      float seep=uSeep*(exp(-D*5.)*.55+seepAcc*.5);
      c=mix(c,vec3(.60,.80,.73),clamp(seep,0.,1.)*.34*uReveal);
    }
    col=c;
  }
  float vg=dot(p,p);
  col*=1.-.07*vg;
  gl_FragColor=vec4(col,1.);
}
`;

// ---------------------------------------------------------------- type
export const TYPE_VS = /* glsl */`
uniform vec4 uRect; uniform vec2 uView;
varying vec2 vUv; varying float vY;
void main(){
  vUv=uv;
  vec2 px=uRect.xy+(position.xy*vec2(1.,-1.)+.5)*uRect.zw;
  vY=px.y;
  vec2 n=px/uView*2.-1.;
  gl_Position=vec4(n.x,-n.y,.9995,1.);
}
`;
export const TYPE_FS = /* glsl */`
precision highp float;
uniform sampler2D map; uniform vec3 uInk; uniform float uMask,uLedge,uFadeH,uOpacity;
varying vec2 vUv; varying float vY;
void main(){
  float a=texture2D(map,vUv).a*uOpacity;
  a*=mix(1.,smoothstep(uLedge-4.,uLedge+uFadeH,vY),uMask);
  if(a<.003)discard;
  gl_FragColor=vec4(uInk,a);
}
`;

// ---------------------------------------------------------------- strands
export const STRAND_LIB = /* glsl */`
uniform float uTime,uGrow,uShift,uAspect,uLen;
uniform vec4 uField;   // edgeZ, farZ, groundY, tan(fov/2)*aspect
uniform vec3 uPtr; uniform vec2 uPtrVel;
uniform mat4 uVP;
${COMMON}
vec3 strandPos(float id,float cell,float s,out vec3 tg,out float len){
  vec3 h=hash31(id*1.31+5.);
  vec3 root;
  if(cell>-500.){
    root=vec3(follX(cell),uField.z,uField.x-.03);
    float g=clamp(uGrow*1.25-hash11(cell+77.)*.25,0.,1.);
    len=mix(.42,.70,h.z)*smoothstep(.45,1.,g);
  }else{
    float z=mix(uField.x-.06,uField.y,h.y);
    root=vec3((h.x*2.-1.)*(10.-z)*uField.w*1.1,uField.z,z);
    float g=smoothstep(0.,1.,uGrow*1.35-h.z*.35);
    len=mix(.38,1.02,fract(h.z*13.7))*g*uLen;
  }
  vec2 w=vec2(vnoise(root.xz*.38+vec2(uTime*.22,0.))-.5,vnoise(root.xz*.38+vec2(5.,uTime*.17))-.5)*.75;
  w.x+=sin(root.x*.7-uTime*.8+root.z*.4)*.10;
  w+=(hash21(id+3.)-.5)*.55;
  vec4 c=uVP*vec4(root+vec3(0.,len*.7,0.),1.); c.y+=uShift*c.w;
  vec2 d=(c.xy/c.w-uPtr.xy)*vec2(uAspect,1.);
  float f=exp(-dot(d,d)*4.5)*uPtr.z;
  w.x+=(uPtrVel.x*1.7+sign(d.x)*.42)*f;
  w.y+=(uPtrVel.y*.7-.25)*f;
  float bb=min(dot(w,w),1.6);
  vec3 side=vec3(w.x,0.,w.y);
  vec3 p=root+vec3(0.,1.,0.)*len*s*(1.-.24*bb*s)+side*len*s*s;
  float s2=s+.03;
  vec3 p2=root+vec3(0.,1.,0.)*len*s2*(1.-.24*bb*s2)+side*len*s2*s2;
  tg=normalize(p2-p+vec3(0.,1e-5,0.));
  return p;
}
`;

export const STRAND_VS = /* glsl */`
attribute float aId; attribute float aCell;
uniform vec2 uRes; uniform float uPx,uDpr;
varying vec3 vT; varying vec3 vW; varying float vEdge,vS,vA,vFog,vFront,vRnd;
${STRAND_LIB}
void main(){
  vec3 tg; float len;
  vec3 P=strandPos(aId,aCell,position.x,tg,len);
  vec4 c=uVP*vec4(P,1.); c.y+=uShift*c.w;
  vec4 c2=uVP*vec4(P+tg*.03,1.); c2.y+=uShift*c2.w;
  vec2 sd=(c2.xy/c2.w-c.xy/c.w)*vec2(uAspect,1.);
  sd=normalize(sd+vec2(0.,1e-6));
  vec2 nr=vec2(-sd.y,sd.x);
  float front=step(-500.,aCell);
  float wW=mix(.0125,.026,front)*mix(1.,.12,pow(position.x,1.6));
  float px=wW*uPx/c.w;
  float pxc=max(px,1.3*uDpr);
  vA=min(1.,px/pxc)*step(.012,len);
  c.xy+=nr*position.y*pxc/uRes*c.w;
  vEdge=position.y; vT=tg; vW=P; vS=position.x; vFront=front; vRnd=hash11(aId+.5);
  vFog=smoothstep(uField.x-1.,uField.y,P.z);
  gl_Position=c;
}
`;

export const STRAND_FS = /* glsl */`
precision highp float;
uniform vec3 uCam; uniform float uReveal;
varying vec3 vT; varying vec3 vW; varying float vEdge,vS,vA,vFog,vFront,vRnd;
void main(){
  vec3 T=normalize(vT); vec3 V=normalize(uCam-vW);
  vec3 L=normalize(vec3(-.45,.62,.64));
  vec3 H=normalize(L+V);
  vec3 N=normalize(cross(cross(T,V),T));
  float TL=dot(T,L);
  float diff=mix(.30,1.,sqrt(max(1.-TL*TL,0.)));
  float sh=(vRnd-.5)*.22;
  vec3 T1=normalize(T+N*(-.10+sh)); vec3 T2=normalize(T+N*(.22+sh));
  float a1=dot(T1,H), a2=dot(T2,H);
  float s1=pow(sqrt(max(1.-a1*a1,0.)),110.);   // R lobe: white, toward the root
  float s2=pow(sqrt(max(1.-a2*a2,0.)),16.);    // TRT lobe: coloured, toward the tip
  vec3 base=mix(vec3(.060,.048,.044),vec3(.105,.078,.064),vRnd);
  vec3 col=base*diff*1.25;
  col+=vec3(1.,.985,.96)*s1*.62;
  col+=vec3(.52,.34,.22)*s2*.40;
  vec3 L2=normalize(vec3(.6,.35,-.7));        // back light, for the rim through the tips
  float tt=pow(max(dot(-V,L2)*.5+.5,0.),3.)*sqrt(max(1.-dot(T,L2)*dot(T,L2),0.));
  col+=vec3(.36,.25,.17)*tt*.30*vS;
  col*=mix(.55,1.,smoothstep(0.,.35,vS));     // roots sit in each other's shadow
  vec3 fog=vec3(.884,.892,.886);
  col=mix(col,fog,vFog*.86);
  float a=(1.-smoothstep(.35,1.,abs(vEdge)))*vA*smoothstep(0.,.04,vS);
  a*=1.-vFog*.55;
  a*=mix(1.,max(vFront,step(.86,vRnd)*(1.-vFog)*.8),uReveal);
  if(a<.004)discard;
  gl_FragColor=vec4(col,a);
}
`;

export const GROUND_VS = /* glsl */`
uniform vec4 uField; uniform mat4 uVP; uniform float uShift;
varying vec3 vP;
void main(){
  float z=mix(uField.x,uField.y,position.y*.5+.5);
  vec3 P=vec3(position.x*(10.-z)*uField.w*1.2,uField.z,z);
  vP=P; vec4 c=uVP*vec4(P,1.); c.y+=uShift*c.w; gl_Position=c;
}
`;
export const GROUND_FS = /* glsl */`
precision highp float;
uniform vec4 uField; uniform float uTime;
varying vec3 vP;
${COMMON}
void main(){
  float t=smoothstep(uField.x,uField.y,vP.z);
  float n=vnoise(vP.xz*5.)*.5+vnoise(vP.xz*17.)*.5;
  vec3 col=vec3(.790,.782,.768)*(.96+.07*n);
  col*=.93+.07*vnoise(vP.xz*.9+3.);
  col+=smoothstep(uField.x-.05,uField.x,vP.z)*.03;
  float a=(1.-smoothstep(.0,.72,t))*.9;
  gl_FragColor=vec4(col,a);
}
`;

// ---------------------------------------------------------------- bottle
export const BODY_VS = /* glsl */`
varying vec3 vL; varying vec3 vN; varying vec3 vWp; varying vec3 vNw;
void main(){vL=position;vN=normal;vNw=mat3(modelMatrix)*normal;vec4 w=modelMatrix*vec4(position,1.);vWp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}
`;
export const BODY_FS = /* glsl */`
precision highp float;
uniform sampler2D uBg; uniform sampler2D uLabel;
uniform vec2 uRes; uniform vec3 uCamL; uniform vec3 uLiqN; uniform float uLevel,uScale,uTime;
varying vec3 vL; varying vec3 vN; varying vec3 vWp; varying vec3 vNw;
${ENV}
const float R=.42;
vec4 labelAt(vec3 p){
  float ang=atan(p.x,p.z);
  vec2 uv=vec2(ang/3.2+.5,(p.y-.34)/.96);
  float m=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.)*step(.40,length(p.xz));
  return vec4(texture2D(uLabel,uv).rgb,m);
}
void main(){
  vec3 n=normalize(vN); vec3 rd=normalize(vL-uCamL);
  float flip=dot(n,rd)>0.?-1.:1.; n*=flip;
  float ndv=max(dot(n,-rd),0.);
  vec3 rf=refract(rd,n,1./1.36);
  float a=dot(rf.xz,rf.xz); float b=dot(vL.xz,rf.xz); float c=dot(vL.xz,vL.xz)-R*R;
  float t=(-b+sqrt(max(b*b-a*c,0.)))/max(a,1e-4);
  t=min(t,1.4);
  vec3 q=vL+rf*t;
  vec3 lc=vec3(0.,uLevel,0.);
  float lp=dot(vL-lc,uLiqN), lq=dot(q-lc,uLiqN);
  float inP=step(lp,0.), inQ=step(lq,0.);
  float frac=inP==inQ?inP:(inP>.5?abs(lp):abs(lq))/(abs(lp)+abs(lq)+1e-4);
  float surf=abs(inP-inQ);
  vec3 nW=normalize(vNw)*flip;
  vec3 nV=normalize(mat3(viewMatrix)*nW);
  vec3 V=normalize(cameraPosition-vWp);
  vec2 suv=gl_FragCoord.xy/uRes;
  // a filled bottle is a strong lens; the empty part above the liquid is a weak one
  vec2 off=-nV.xy*mix(.030,.115,frac)*uScale*vec2(uRes.y/uRes.x,1.);
  vec3 bg=textureLod(uBg,suv+off,mix(.6,1.7,frac)).rgb;
  float path=clamp(t/(2.*R),0.,1.6);
  vec3 amber=vec3(.66,.29,.055);
  vec3 trans=pow(amber,vec3(.85+1.6*path+.6*frac));
  vec3 col=bg*trans*1.16;
  col*=mix(.30,1.,smoothstep(0.,.55,ndv));
  // light gathers on the side away from the key
  vec3 Lk=normalize(vec3(-.55,.5,.6));
  float gl=pow(max(dot(nW,normalize(vec3(.75,-.15,.45))),0.),2.2);
  col+=vec3(.95,.44,.06)*gl*.42*(.5+.5*frac);
  col+=vec3(.9,.5,.12)*smoothstep(.16,.0,vL.y)*.20;
  // liquid surface, seen through the wall
  col=mix(col,col*1.5+vec3(.20,.11,.03),surf*.55);
  float men=smoothstep(.022,.0,abs(lp))*.5; col+=vec3(.9,.6,.3)*men*.35;
  // dip tube
  float da=abs(vL.x*rf.z-vL.z*rf.x)/max(length(rf.xz),1e-4);
  float ty=vL.y+rf.y*(-b/max(a,1e-4));
  float tube=smoothstep(.034,.022,da)*step(.10,ty)*step(ty,2.05);
  col=mix(col,col*1.25+vec3(.16,.10,.045),tube*.6);
  // back of the label, through the glass
  vec4 lb=labelAt(q);
  col=mix(col,vec3(.93,.90,.84)*trans*(.75+.5*gl),lb.a*.9*step(vL.y,1.7));
  // printed label
  vec4 lf=labelAt(vL);
  float lam=dot(nW,Lk)*.5+.5;
  vec3 paper=lf.rgb*(.50+.60*lam*lam);
  paper+=vec3(.04,.03,.02)*(1.-lam);
  col=mix(col,paper,lf.a);
  // studio reflections
  vec3 Rr=reflect(-V,nW);
  float F=.055+.945*pow(1.-max(dot(nW,V),0.),5.);
  vec3 e=env(Rr);
  col+=e*F*mix(1.8,.10,lf.a);
  gl_FragColor=vec4(col,1.);
}
`;

export const PLASTIC_FS = /* glsl */`
precision highp float;
uniform vec3 uCol; uniform float uRibs;
varying vec3 vL; varying vec3 vN; varying vec3 vWp; varying vec3 vNw;
${ENV}
void main(){
  vec3 n=normalize(vNw); vec3 V=normalize(cameraPosition-vWp);
  if(dot(n,V)<0.)n=-n;
  float ang=atan(vL.x,vL.z);
  float rib=sin(ang*46.);
  float ribM=uRibs*smoothstep(.5,.9,abs(normalize(vN).y)<.5?1.:0.);
  vec3 tang=normalize(cross(vec3(0.,1.,0.),n)+1e-5);
  n=normalize(n+tang*rib*.35*ribM);
  vec3 L=normalize(vec3(-.55,.6,.6));
  float d=dot(n,L)*.5+.5; d*=d;
  vec3 col=uCol*(.40+.66*d);
  col+=uCol*.07*max(-n.y,0.);
  col*=1.-.12*ribM*(.5-.5*rib);
  vec3 Rr=reflect(-V,n);
  float F=.035+.965*pow(1.-max(dot(n,V),0.),5.);
  col+=min(env(Rr),vec3(3.))*F*.42;
  gl_FragColor=vec4(col,1.);
}
`;

export const CAP_FS = /* glsl */`
precision highp float;
varying vec3 vL; varying vec3 vN; varying vec3 vWp; varying vec3 vNw;
${ENV}
void main(){
  vec3 n=normalize(vNw); vec3 V=normalize(cameraPosition-vWp);
  if(dot(n,V)<0.)n=-n;
  float ndv=max(dot(n,V),0.);
  float F=pow(1.-ndv,2.6);
  vec3 e=env(reflect(-V,n));
  float lum=dot(e,vec3(.333));
  float a=.07+.58*F+clamp((lum-1.2)*.16,0.,.55);
  vec3 col=mix(vec3(.97,.985,.98),vec3(.52,.58,.57),smoothstep(.55,1.,F)*.8);
  col=mix(col,vec3(1.),clamp((lum-1.2)*.3,0.,1.));
  a+=smoothstep(2.115,2.10,vL.y)*.25;
  gl_FragColor=vec4(col,clamp(a,0.,.92));
}
`;

export const BUBBLE_FS = /* glsl */`
precision highp float;
uniform float uAlpha;
varying vec3 vL; varying vec3 vN; varying vec3 vWp; varying vec3 vNw;
void main(){
  vec3 n=normalize(vNw); vec3 V=normalize(cameraPosition-vWp);
  float ndv=abs(dot(n,V));
  float rim=pow(1.-ndv,1.8);
  vec3 col=mix(vec3(.45,.20,.04),vec3(1.,.82,.55),rim);
  float sp=pow(max(dot(n,normalize(vec3(-.5,.6,.6))),0.),40.);
  col+=sp;
  gl_FragColor=vec4(col,(.18+.75*rim+sp)*uAlpha);
}
`;

// ---------------------------------------------------------------- droplets
export const DROP_VS = /* glsl */`
attribute vec4 aSeed;  // id, kind, rnd, rnd
uniform vec2 uRes; uniform float uPx,uDpr;
uniform vec2 uHalf;
uniform vec3 uNoz,uNozDir;
uniform float uSprayAge,uSprayAmt,uSettle,uStrandN,uAmb,uBeads,uFocus,uDof;
varying vec2 vUv; varying float vFade,vKind,vPx,vBlur;
${STRAND_LIB}
void main(){
  float kind=aSeed.y;
  vec3 h=hash31(aSeed.x*1.37+aSeed.z*71.);
  float h4=aSeed.w;
  float fade=1.; vec3 P=vec3(0.); vec4 clip;
  float sizeW=mix(.0055,.034,pow(h4,kind<.5?5.:9.));
  bool ndcSpace=false; float push=1.;
  if(kind<.5){
    vec3 range=vec3(uHalf.x*2.5,uHalf.y*2.4,6.);
    vec3 b=h*range;
    b.y+=uTime*mix(.015,.06,h4);
    b.x+=uTime*.02+sin(uTime*.21+h.z*30.)*.14;
    P=mod(b,range)-range*.5; P.z+=.6;
    fade=uAmb*smoothstep(0.,.18,1.-abs(P.y)/(range.y*.5))*smoothstep(0.,.1,1.-abs(P.x)/(range.x*.5));
  }else if(kind<1.5||(kind>2.5&&kind<3.5)){
    bool haze=kind>2.5;
    float age=uSprayAge-h.x*(haze?.55:.85);
    float life=mix(4.2,6.6,h.y);
    vec3 dir=normalize(uNozDir);
    vec3 ax=normalize(cross(dir,vec3(.2,1.,.3))); vec3 ay=cross(dir,ax);
    float an=h.z*6.2832; float sr=sqrt(fract(h4*17.3))*(haze?.26:.36);
    vec3 dd=normalize(dir+(ax*cos(an)+ay*sin(an))*sr);
    float v0=mix(1.9,6.6,fract(h.x*9.7))*(1.-.45*sr);
    float k=1.9;
    float dist=v0/k*(1.-exp(-k*max(age,0.)));
    P=uNoz+dd*dist;
    float heavy=pow(h4,3.);
    P.y-=(.05+.16*heavy)*age+.008*age*age;
    float sw=.045*age;
    P+=vec3(sin(age*.7+h.x*40.+uTime*.35),cos(age*.55+h.y*40.+uTime*.28),sin(age*.6+h.z*40.))*sw;
    fade=smoothstep(0.,.06,age)*(1.-smoothstep(life*.55,life,age))*step(0.,age)*uSprayAmt;
    if(haze){sizeW=.07+.62*(1.-exp(-age*.9))*(.6+.8*h4);}
  }else if(kind<2.5){
    float sid=floor(h.x*uStrandN); float s=mix(.30,.97,h.y);
    vec3 tg; float len;
    P=strandPos(sid,-999.,s,tg,len);
    fade=smoothstep(h.z*.9,h.z*.9+.1,uSettle)*step(.2,len);
    sizeW=mix(.010,.030,pow(h4,2.2));
    push=0.;
  }else{
    // beads on the lens: they hold, then run
    ndcSpace=true;
    float ph=uTime*mix(.05,.11,h.z)+h.y*20.;
    float run=floor(ph)+smoothstep(.72,1.,fract(ph));
    float y0=h.y*2.4-run*.26*mix(.5,1.,h4);
    float yy=mod(y0+1.2,2.4)-1.2;
    float xx=(h.x*2.-1.)*.96+sin(run*2.+h.z*9.)*.012;
    clip=vec4(xx,yy,0.,1.);
    fade=uBeads*smoothstep(1.2,1.0,abs(yy));
    sizeW=mix(.035,.105,pow(h4,1.6));
    push=.25;
  }
  if(!ndcSpace){
    clip=uVP*vec4(P,1.);
    if(kind>1.5&&kind<2.5)clip.y+=uShift*clip.w;
  }
  vec2 nd=clip.xy/clip.w;
  vec2 d=(nd-uPtr.xy)*vec2(uAspect,1.);
  float f=exp(-dot(d,d)*7.)*uPtr.z*push;
  nd+=normalize(d+1e-4)*f*.075/vec2(uAspect,1.);
  clip.xy=nd*clip.w;
  float px=ndcSpace?sizeW*uPx*.1:sizeW*uPx/clip.w;
  float coc=ndcSpace?0.:abs(clip.w-uFocus)*uDof*uDpr;
  if(kind>2.5&&kind<3.5)coc=0.;
  float r=max(px+coc,1.45*uDpr);
  fade*=mix(1.,clamp(px/r,0.,1.),.72);
  vBlur=clamp(coc/r,0.,1.); vPx=r; vKind=kind; vFade=fade; vUv=position.xy;
  if(fade<.004){gl_Position=vec4(2.,2.,2.,1.);return;}
  clip.xy+=position.xy*r/uRes*2.*clip.w;
  gl_Position=clip;
}
`;

export const DROP_FS = /* glsl */`
precision highp float;
uniform sampler2D uScene; uniform vec2 uRes;
varying vec2 vUv; varying float vFade,vKind,vPx,vBlur;
void main(){
  float r2=dot(vUv,vUv); if(r2>1.)discard;
  float r=sqrt(r2);
  vec2 suv=gl_FragCoord.xy/uRes;
  if(vKind>2.5&&vKind<3.5){
    float g=exp(-r2*3.2)*(1.-r2);
    gl_FragColor=vec4(vec3(.985,.995,.99),g*vFade*.15);
    return;
  }
  float z=sqrt(1.-r2);
  // a drop is a small strong lens: it shows the scene inverted and enlarged
  vec2 off=-vUv*(.42+.95*r2)*vPx/uRes*1.55;
  vec3 refr=texture2D(uScene,suv+off).rgb;
  vec3 base=texture2D(uScene,suv).rgb;
  float fres=pow(1.-z,2.4);
  vec3 col=refr*(1.-.55*fres);
  col+=fres*vec3(.22,.24,.24);
  vec2 l=normalize(vec2(-.52,.70));
  float cres=smoothstep(.15,.95,dot(vUv,-l))*smoothstep(1.,.72,r)*smoothstep(.35,.8,r);
  col+=cres*.16;
  float sp=smoothstep(.22,.0,length(vUv-l*.50));
  col+=sp*sp*1.25;
  float sp2=smoothstep(.10,.0,length(vUv+l*.62)); col+=sp2*.35;
  float edge=1.-smoothstep(1.-max(.10,2.2/vPx),1.,r);
  vec3 bok=base+vec3(.06)*(.75+.25*smoothstep(.6,.95,r));
  col=mix(col,bok,vBlur);
  float a=edge*vFade*mix(1.,.6,vBlur);
  gl_FragColor=vec4(col,a);
}
`;

export const POST_FS = /* glsl */`
precision highp float;
uniform sampler2D uScene; uniform float uTime; uniform vec2 uRes;
varying vec2 vUv;
float h12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
void main(){
  vec3 c=texture2D(uScene,vUv).rgb;
  float g=h12(gl_FragCoord.xy+fract(uTime)*91.7)-.5;
  c+=g*.022;
  gl_FragColor=vec4(c,1.);
}
`;

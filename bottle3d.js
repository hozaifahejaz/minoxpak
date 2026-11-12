/* Minoxpak 3D bottle
   A self-contained ES module. Include it once with a module script tag pointing at bottle3d.js.
   It mounts into #hero-3d (or any element with data-bottle3d), keeps that element's existing
   children as the fallback, and only fetches three.js when the mount nears the viewport.
   Everything (frosted glass, liquid, collar, pump, printed label) is built in code; no model files.
   Options on the mount element:
     data-model="signature|monolith|prism|pebble"   bottle design (default signature)
     data-variant="men|women"   start variant (default men)
     data-controls="off"        hide the 5% / 2% switch
     data-plinth="off"          hide the stone plinth
     data-ui="right"            stack the switch at the middle right instead of bottom centre
     data-zoom="0.8"            draw the bottle smaller (or larger) than the default fit
     data-backdrop="#BFE8E0"    colour the frosted glass shows through, when the panel behind is a gradient or photo
   Fires a "bottle3d:variant" event on the mount with detail {variant, id} when the switch changes. */

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

const CSS = `
.mx3d{position:relative;isolation:isolate;min-height:280px;-webkit-user-select:none;user-select:none}
.mx3d-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .9s ease;cursor:grab;touch-action:pan-y;outline:none}
.mx3d-canvas:active{cursor:grabbing}
.mx3d-canvas:focus-visible{outline:2px solid currentColor;outline-offset:-6px;border-radius:inherit}
.mx3d.mx3d-ready .mx3d-canvas{opacity:1}
.mx3d > .mx3d-fallback{transition:opacity .5s ease}
.mx3d.mx3d-ready > .mx3d-fallback{opacity:0;pointer-events:none}
.mx3d-ui{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:3;display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:none}
.mx3d-switch{pointer-events:auto;display:inline-flex;gap:3px;padding:4px;border-radius:999px;background:rgba(255,255,255,.72);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 10px 30px -14px rgba(0,0,0,.35),inset 0 0 0 1px rgba(0,0,0,.05)}
.mx3d-switch button{font:700 13px/1 var(--f,"Sora",system-ui,sans-serif);letter-spacing:-.01em;border:0;border-radius:999px;padding:10px 15px;min-height:44px;background:transparent;color:#5c5852;cursor:pointer;white-space:nowrap;transition:background .25s,color .25s}
.mx3d-switch button[aria-pressed="true"]{background:#141414;color:#fff}
.mx3d-hint{font:700 10.5px/1 var(--f,"Sora",system-ui,sans-serif);letter-spacing:.16em;text-transform:uppercase;color:rgba(20,20,20,.5);display:flex;gap:9px;align-items:center;opacity:0;transition:opacity .6s .8s;white-space:nowrap}
.mx3d-hint::before,.mx3d-hint::after{content:"";width:18px;height:1px;background:currentColor}
.mx3d.mx3d-ready .mx3d-hint{opacity:1}
.mx3d.mx3d-touched .mx3d-hint{opacity:0;transition-delay:0s}
.mx3d[data-ui="right"] .mx3d-ui{left:auto;bottom:auto;top:50%;right:max(14px,env(safe-area-inset-right,0px));transform:translateY(-50%)}
.mx3d[data-ui="right"] .mx3d-switch{flex-direction:column;border-radius:22px}
.mx3d[data-ui="right"] .mx3d-switch button{border-radius:18px;padding:10px 13px}
.mx3d[data-ui="right"] .mx3d-hint{display:none}
@media (max-width:480px){.mx3d-switch button{font-size:12px;padding:9px 12px}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .mx3d-switch{background:rgba(30,30,28,.7)}:root:not([data-theme="light"]) .mx3d-switch button{color:#bdb7ad}:root:not([data-theme="light"]) .mx3d-switch button[aria-pressed="true"]{background:#f2efea;color:#141414}:root:not([data-theme="light"]) .mx3d-hint{color:rgba(242,239,234,.55)}}
:root[data-theme="dark"] .mx3d-switch{background:rgba(30,30,28,.7)}:root[data-theme="dark"] .mx3d-switch button{color:#bdb7ad}:root[data-theme="dark"] .mx3d-switch button[aria-pressed="true"]{background:#f2efea;color:#141414}:root[data-theme="dark"] .mx3d-hint{color:rgba(242,239,234,.55)}
`;

const VARIANTS = {
  men:   { id: 'm5', pct: '5%', who: 'FOR MEN',   label: 'Men · 5%',   tint: '#0E4F5C' },
  women: { id: 'w2', pct: '2%', who: 'FOR WOMEN', label: 'Women · 2%', tint: '#B5584A' }
};

document.querySelectorAll('#hero-3d, [data-bottle3d]').forEach(m => { if (!m.dataset.mx3dMounted) setup(m); });

function setup(el) {
  el.dataset.mx3dMounted = '1';
  if (!document.getElementById('mx3d-style')) {
    const st = document.createElement('style'); st.id = 'mx3d-style'; st.textContent = CSS; document.head.appendChild(st);
  }
  if (!webglOK()) return; // keep the existing fallback art untouched
  const nav = navigator;
  if ((nav.connection && nav.connection.saveData) || (nav.deviceMemory && nav.deviceMemory <= 2)) return; // data saver or low-memory phone: stay on the fallback

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let variant = VARIANTS[el.dataset.variant] ? el.dataset.variant : 'men';
  let onVariant = null;

  el.classList.add('mx3d');
  [...el.children].forEach(c => c.classList.add('mx3d-fallback'));
  const canvas = document.createElement('canvas');
  canvas.className = 'mx3d-canvas'; canvas.tabIndex = 0; canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Minoxpak bottle in 3D. Drag, or use the arrow keys, to turn it.');
  el.appendChild(canvas);

  const ui = document.createElement('div'); ui.className = 'mx3d-ui';
  if (el.dataset.controls !== 'off') {
    const sw = document.createElement('div'); sw.className = 'mx3d-switch'; sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', 'Choose a formula');
    for (const [k, V] of Object.entries(VARIANTS)) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.v = k; b.textContent = V.label;
      b.setAttribute('aria-pressed', String(k === variant));
      b.addEventListener('click', () => setVariant(k));
      sw.appendChild(b);
    }
    ui.appendChild(sw);
  }
  const hint = document.createElement('span'); hint.className = 'mx3d-hint'; hint.setAttribute('aria-hidden', 'true'); hint.textContent = 'Drag to rotate';
  ui.appendChild(hint); el.appendChild(ui);

  function setVariant(v) {
    if (!VARIANTS[v] || v === variant) return;
    variant = v;
    ui.querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    el.dispatchEvent(new CustomEvent('bottle3d:variant', { bubbles: true, detail: { variant: v, id: VARIANTS[v].id } }));
    if (onVariant) onVariant(v);
  }
  el.bottle3d = { setVariant };

  const io = new IntersectionObserver(es => {
    if (es.some(e => e.isIntersecting)) {
      io.disconnect();
      init().catch(err => { console.warn('3D bottle unavailable:', err); el.classList.remove('mx3d'); canvas.remove(); ui.remove(); });
    }
  }, { rootMargin: '500px 0px' });
  io.observe(el);

  async function init() {
    const THREE = await import(THREE_URL);
    try {
      await Promise.all(['800 100px "Sora"', '500 36px "Sora"', '400 100px "Instrument Serif"', 'italic 400 100px "Instrument Serif"']
        .map(f => document.fonts.load(f)));
    } catch (e) { /* label falls back to system fonts */ }

    const C = hex => new THREE.Color(hex);
    const tintOf = v => {
      const V = VARIANTS[v], css = V.cssVar && getComputedStyle(document.documentElement).getPropertyValue(V.cssVar).trim();
      const c = new THREE.Color(V.tint);
      if (css) { try { c.setStyle(css); } catch (e) { /* keep default */ } }
      return c;
    };

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;   // keeps brand colours true, like a colour-managed product shot
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.shadowMap.autoUpdate = false;   // refreshed every few frames in the loop; the shadow barely changes as the bottle turns
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(15, 1, .1, 200);
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // Small procedural textures (no image downloads).
    const canvasTex = (w, h, draw, srgb = false, repeat = null) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
      t.anisotropy = maxAniso; return t;
    };
    const rand = (() => { let x = 1234567; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
    // Softbox: bright centre with a smooth falloff to its edges, like a diffused studio light.
    const softTex = canvasTex(256, 256, (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = Math.abs(x / w - .5) * 2, dy = Math.abs(y / h - .5) * 2;
        const f = Math.pow(Math.max(0, 1 - Math.pow(dx, 6)) * Math.max(0, 1 - Math.pow(dy, 6)), 1.4);
        const i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255 * f; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    });
    // Fine circular brushing for metal: streaks run around the part.
    const brushTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) { const v = 90 + rand() * 90 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.globalAlpha = .35; g.fillRect(0, rand() * h, w, rand() * 1.6 + .3); }
    }, false, [1, 3]);
    // Soft-touch grain for coated surfaces.
    const grainTex = canvasTex(256, 256, (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let i = 0; i < w * h; i++) { const v = 118 + rand() * 20; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
      g.putImageData(img, 0, 0);
    }, false, [6, 6]);
    // Honed travertine for the plinth: pale stone with faint horizontal veining and pores.
    const stoneTex = canvasTex(1024, 1024, (g, w, h) => {
      g.fillStyle = '#efebe4'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 14; i++) { const y = rand() * h; g.fillStyle = `rgba(150,138,120,${.015 + rand() * .02})`; g.fillRect(0, y, w, 2 + rand() * 14); }
      for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(120,108,92,${.05 + rand() * .12})`; g.beginPath(); g.ellipse(rand() * w, rand() * h, .6 + rand() * 2.6, .5 + rand() * 1.2, 0, 0, 7); g.fill(); }
    }, true);

    // Studio lighting baked into an environment map: a dim room, two tall softbox strips that draw
    // clean vertical highlights down the glass, a rim light behind for the edges and a big overhead box.
    const pm = new THREE.PMREMGenerator(renderer), env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: C('#2f2d2a'), side: THREE.BackSide })));
    const floorEnv = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: C('#8f8a82') }));
    floorEnv.rotation.x = -Math.PI / 2; floorEnv.position.y = -4; env.add(floorEnv);
    const softbox = (w, h, x, y, z, k, tint = '#ffffff') => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: softTex, color: C(tint).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 1, 0); env.add(m);
    };
    softbox(3.2, 14, -7, 1.5, 3.5, 11);            // key strip, front left
    softbox(2.2, 14, 7.5, 1.5, 2, 6);           // fill strip, right
    softbox(5, 13, 1.5, 2, -9, 4.5);              // rim, behind
    softbox(12, 12, 0, 12, 1, 5, '#fff8ef');    // overhead
    softbox(12, 5, 0, 0, 10, 1.6, '#fff4e6');  // low front bounce card
    scene.environment = pm.fromScene(env, .02).texture;
    scene.environmentIntensity = 1;

    const key = new THREE.DirectionalLight('#fffaf2', 1.6); key.position.set(-2.6, 7, 3.2);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 14; key.shadow.blurSamples = 24;
    key.shadow.bias = -.0004; key.shadow.intensity = .55;
    Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 3.5, bottom: -1, near: 1, far: 16 });
    scene.add(key);

    // The canvas is transparent, so glass would refract nothing. This backdrop is drawn only into
    // three's transmission buffer, in the colours of the page behind the mount, so refraction and
    // frosting pick up the real background.
    const backdropMat = new THREE.MeshBasicMaterial({ toneMapped: false, depthWrite: false });
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backdropMat);
    backdrop.renderOrder = -10;
    backdrop.onBeforeRender = r => { backdropMat.colorWrite = r.getRenderTarget() !== null; };
    scene.add(backdrop);
    function paintBackdrop(top, bottom) {
      backdropMat.map?.dispose();
      backdropMat.map = canvasTex(64, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(1, bottom);
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        const glow = g.createRadialGradient(w / 2, h * .42, 0, w / 2, h * .42, h * .45);
        glow.addColorStop(0, 'rgba(255,255,255,.22)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = glow; g.fillRect(0, 0, w, h);
      }, true);
      backdropMat.color.set('#ffffff'); backdropMat.needsUpdate = true;
    }

    // ---------- bottle models ----------
    const root = new THREE.Group(), spin = new THREE.Group(); root.add(spin); scene.add(root); root.position.y = .004;
    const V2 = (x, y) => new THREE.Vector2(x, y);
    const WHITE = C('#ffffff');
    const lathe = (pts, seg = 128, phiStart = 0, phiLength = Math.PI * 2) => new THREE.LatheGeometry(pts, seg, phiStart, phiLength);
    const add = (geo, m) => { const mesh = new THREE.Mesh(geo, m); spin.add(mesh); return mesh; };
    const aniso = renderer.capabilities.getMaxAnisotropy();
    const texCache = {};
    const labelTex = (kind, v) => {
      const k = kind + ':' + v;
      if (texCache[k]) return texCache[k];
      const cv = kind === 'wrap' ? drawLabel(VARIANTS[v]) : kind === 'pebble' ? drawFront(VARIANTS[v], 1400, 1260) : drawFront(VARIANTS[v], 1024, 1400);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
      return (texCache[k] = t);
    };
    const inkMaterial = (kind, extra = {}) => {
      const t = labelTex(kind, variant);
      return new THREE.MeshPhysicalMaterial({ map: t, bumpMap: t, bumpScale: .35, transparent: true, roughness: .34, clearcoat: .3, clearcoatRoughness: .3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, ...extra });
    };
    const metal = c => new THREE.MeshPhysicalMaterial({ color: c, metalness: 1, roughness: .22, bumpMap: brushTex, bumpScale: .15, envMapIntensity: 1.3 });
    const softBlack = () => new THREE.MeshPhysicalMaterial({ color: '#141414', roughness: .55, bumpMap: grainTex, bumpScale: .4, clearcoat: .25, clearcoatRoughness: .45 });
    const shadowed = o => { o.traverse?.(m => { if (m.isMesh && !m.material.transparent) m.castShadow = true; }); return o; };
    const roundedRect = (w, d, r) => {
      const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
      s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r);
      s.quadraticCurveTo(x + w, y + d, x + w - r, y + d); s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
    };
    // A rounded box standing on y0, built by extruding a rounded rectangle upward.
    const roundedBox = (w, d, h, r, bev, y0) => {
      const g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * bev, d - 2 * bev, r), { depth: h - 2 * bev, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 8, curveSegments: 24 });
      g.rotateX(-Math.PI / 2); g.translate(0, y0 + bev, 0); return g;
    };
    const collar = (y0, y1, r, m) => add(lathe([V2(r - .08, y0), V2(r - .012, y0), V2(r, y0 + .012), V2(r, y0 + .05), V2(r - .007, y0 + .056), V2(r, y0 + .062), V2(r, y1 - .012), V2(r - .012, y1), V2(r - .1, y1)]), m);
    const pump = (y0, r, h, m) => {
      shadowed(add(lathe([V2(0, y0), V2(r * .3, y0), V2(r * .3, y0 + .02), V2(r * .97, y0 + .02), V2(r, y0 + .03), V2(r, y0 + h - .065), V2(r * .956, y0 + h - .029), V2(r * .83, y0 + h - .009), V2(r * .59, y0 + h - .002), V2(0, y0 + h)]), m));
      const nz = new THREE.Mesh(new THREE.CylinderGeometry(.038, .038, .03, 32), m); nz.rotation.x = Math.PI / 2; nz.position.set(0, y0 + h * .63, r + .007); spin.add(nz);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(.012, 24), new THREE.MeshBasicMaterial({ color: '#000' })); hole.position.set(0, y0 + h * .63, r + .0226); spin.add(hole);
    };

    const MODELS = {
      // Frosted tinted glass over the serum, with a thick clear base, white screen-print wrapped round.
      signature() {
        const R = .62, shoulder = new THREE.QuadraticBezierCurve(V2(R, 1.92), V2(R, 2.26), V2(.215, 2.27)).getPoints(28);
        const glass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: .24, transmission: 1, thickness: 1.1, ior: 1.52, attenuationDistance: 1.35, clearcoat: 1, clearcoatRoughness: .04, specularIntensity: 1, envMapIntensity: 1.2 });
        const body = add(lathe([V2(0, 0), V2(.46, 0), V2(.55, .005), V2(.594, .022), V2(.614, .052), V2(R, .1), ...shoulder, V2(.205, 2.3), V2(.2, 2.33), V2(.205, 2.36), V2(0, 2.36)], 160), glass); body.castShadow = true;
        const liquid = new THREE.MeshPhysicalMaterial({ roughness: .3 });
        add(lathe([V2(0, .21), V2(.48, .21), V2(.535, .23), V2(.555, .28), V2(.556, 1.6), V2(.4, 1.585), V2(0, 1.58)], 128), liquid);
        const tube = add(new THREE.CylinderGeometry(.014, .014, 2.1, 16), new THREE.MeshStandardMaterial({ color: '#f1f3f1', roughness: .3 })); tube.position.y = 1.29;
        const ink = inkMaterial('wrap');
        const label = add(new THREE.CylinderGeometry(R + .003, R + .003, 1.4, 180, 1, true, -Math.PI, Math.PI * 2), ink); label.position.y = 1.06; label.renderOrder = 2;
        shadowed(collar(2.29, 2.52, .278, metal('#d6d3cd')));
        pump(2.525, .205, .37, softBlack());
        return { kind: 'wrap', ink, apply(c) { glass.attenuationColor.copy(c).lerp(WHITE, .08); liquid.color.copy(c).lerp(WHITE, .5); } };
      },
      // Opaque soft-touch coated bottle, gold-foil type, brushed gold collar under a clear overcap.
      monolith() {
        const R = .56;
        const body = new THREE.MeshPhysicalMaterial({ roughness: .58, bumpMap: grainTex, bumpScale: .5, sheen: .45, sheenRoughness: .55, sheenColor: '#ffffff', clearcoat: .1, clearcoatRoughness: .55 });
        add(lathe([V2(0, 0), V2(.5, 0), V2(.538, .008), V2(.555, .03), V2(R, .07), V2(R, 1.96), V2(.556, 2.0), V2(.54, 2.026), V2(.5, 2.042), V2(.3, 2.05), V2(.2, 2.055), V2(.2, 2.1), V2(0, 2.1)], 160), body).castShadow = true;
        const ink = inkMaterial('wrap', { color: '#E9CC92', metalness: 1, roughness: .22, clearcoat: 0, bumpScale: .6 });
        const label = add(new THREE.CylinderGeometry(R + .003, R + .003, 1.4, 180, 1, true, -Math.PI, Math.PI * 2), ink); label.position.y = 1.0; label.renderOrder = 2;
        shadowed(collar(2.06, 2.22, .235, metal('#dcbc80')));
        pump(2.22, .175, .3, softBlack());
        const acrylic = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: 1, roughness: .02, thickness: .35, ior: 1.49, clearcoat: 1, clearcoatRoughness: .02, specularIntensity: 1, envMapIntensity: 1.3 });
        add(lathe([V2(.248, 2.2), V2(.262, 2.205), V2(.266, 2.22), V2(.266, 2.89), V2(.26, 2.928), V2(.238, 2.948), V2(0, 2.952)]), acrylic);
        return { kind: 'wrap', ink, apply(c) { body.color.copy(c); } };
      },
      // Heavy clear glass: a reflective glass skin over refracting serum and a thick solid base.
      prism() {
        const W = .98, D = .62, Hb = 1.9;
        const skin = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: .02, metalness: 0, transparent: true, opacity: .16, clearcoat: 1, clearcoatRoughness: .01, specularIntensity: 1, envMapIntensity: 2.2, depthWrite: false });
        const skinBack = skin.clone(); skinBack.side = THREE.BackSide; skinBack.opacity = .1;
        add(roundedBox(W, D, Hb, .14, .07, 0), skinBack).renderOrder = 1;
        add(roundedBox(W, D, Hb, .14, .07, 0), skin).renderOrder = 3;
        const solid = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: 1, roughness: .02, thickness: 1.2, ior: 1.52, attenuationColor: '#e6f2ee', attenuationDistance: 2, specularIntensity: 1 });
        add(roundedBox(W - .02, D - .02, .36, .13, .05, .01), solid).castShadow = true;
        const liquid = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: 1, roughness: .03, thickness: .9, ior: 1.36, attenuationDistance: .55, specularIntensity: .6 });
        add(roundedBox(W - .16, D - .16, 1.1, .08, .02, .37), liquid).castShadow = true;
        add(new THREE.CylinderGeometry(.16, .16, .1, 48), solid).position.y = Hb + .03;
        const ink = inkMaterial('front', { color: '#16201f', roughness: .3, clearcoat: 0 });
        const label = add(new THREE.PlaneGeometry(.72, .985), ink); label.position.set(0, 1.0, D / 2 + .004); label.renderOrder = 4;
        shadowed(collar(Hb + .02, Hb + .14, .21, metal('#dcd9d3')));
        const cap = new THREE.MeshPhysicalMaterial({ color: '#0b0b0b', roughness: .18, clearcoat: 1, clearcoatRoughness: .03 });
        add(roundedBox(.52, .52, .72, .07, .035, Hb + .13), cap).castShadow = true;
        return { kind: 'front', ink, apply(c) { liquid.attenuationColor.copy(c).lerp(c.r > c.g ? C('#f08a74') : C('#3fb8b4'), .5); } };
      },
      // Flattened oval flask in opal frosted glass, coloured ink and a glossy ceramic cap.
      pebble() {
        const sp = new THREE.SplineCurve([V2(.42, 0), V2(.6, .08), V2(.71, .3), V2(.745, .7), V2(.715, 1.08), V2(.6, 1.48), V2(.42, 1.8), V2(.25, 2.0), V2(.2, 2.06)]).getPoints(90);
        const flat = g => { g.scale(1, 1, .64); return g; };
        const glass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: .26, transmission: 1, thickness: 1.5, ior: 1.5, attenuationColor: '#f2ebe3', attenuationDistance: 1.5, clearcoat: 1, clearcoatRoughness: .06, specularIntensity: 1, envMapIntensity: 1.2 });
        add(flat(lathe([V2(0, 0), ...sp, V2(.2, 2.1), V2(0, 2.1)], 180)), glass).castShadow = true;
        const liquid = new THREE.MeshPhysicalMaterial({ roughness: .2 });
        add(flat(lathe([V2(0, .16), ...sp.filter(p => p.y > .18 && p.y < 1.3).map(p => V2(p.x * .9, p.y)), V2(0, 1.3)], 96)), liquid);
        const band = sp.filter(p => p.y >= .5 && p.y <= 1.42).map(p => V2(p.x + .004, p.y));
        const ink = inkMaterial('pebble', { roughness: .4 });
        const label = add(flat(lathe(band, 64, -.78, 1.56)), ink); label.renderOrder = 2;
        shadowed(collar(2.08, 2.18, .23, metal('#dcbc80')));
        const cap = new THREE.MeshPhysicalMaterial({ roughness: .25, clearcoat: 1, clearcoatRoughness: .04 });
        add(lathe([V2(0, 2.17), V2(.27, 2.17), V2(.282, 2.19), V2(.282, 2.52), V2(.262, 2.7), V2(.2, 2.84), V2(.11, 2.92), V2(0, 2.94)], 128), cap).castShadow = true;
        return { kind: 'pebble', ink, apply(c) { ink.color.copy(c); cap.color.copy(c); liquid.color.copy(c).lerp(WHITE, .72); } };
      }
    };
    const model = (MODELS[el.dataset.model] || MODELS.signature)();
    const tintNow = tintOf(variant);
    model.apply(tintNow);

    // ---------- plinth and contact shadow ----------
    const showPlinth = el.dataset.plinth !== 'off';
    const plinthMat = new THREE.MeshPhysicalMaterial({ map: stoneTex, roughness: .78, bumpMap: stoneTex, bumpScale: .6, clearcoat: .15, clearcoatRoughness: .6 });
    const PR = 1.28;
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(PR, PR, .32, 160, 1), plinthMat); plinth.position.y = -.16;
    plinth.receiveShadow = true; plinth.visible = showPlinth; scene.add(plinth);
    // Tight contact shadow where the bottle meets the stone (ambient occlusion the shadow map can't give).
    const sc = document.createElement('canvas'); sc.width = sc.height = 256;
    const sg = sc.getContext('2d'), grd = sg.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(0,0,0,.7)'); grd.addColorStop(.38, 'rgba(0,0,0,.45)'); grd.addColorStop(.6, 'rgba(0,0,0,.12)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = grd; sg.fillRect(0, 0, 256, 256);
    const blob = new THREE.CanvasTexture(sc);
    const shadowMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, toneMapped: false });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.75), shadowMat);
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .002; scene.add(shadow);
    // Faint coloured light thrown through the glass onto the stone.
    const glowMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, color: tintNow.clone() });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), glowMat);
    glow.rotation.x = -Math.PI / 2; glow.rotation.z = .5; glow.position.set(.45, .003, -.35); glow.visible = showPlinth && model.kind !== 'wrap-opaque'; scene.add(glow);

    // ---------- match the page behind the mount (and follow light/dark changes) ----------
    let shadowBase = .7;
    function pageColor() {
      if (el.dataset.backdrop) return el.dataset.backdrop.split(',')[0].trim();
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor, m = bg && bg.match(/[\d.]+/g);
        if (m && (m.length < 4 || +m[3] > .5)) return bg;
      }
      return getComputedStyle(document.body).backgroundColor || '#F6F3EE';
    }
    function applyTheme() {
      const bg = new THREE.Color(); try { bg.setStyle(pageColor()); } catch (e) { bg.set('#EAE4DA'); }
      const parts = (el.dataset.backdrop || '').split(',').map(x => x.trim()).filter(Boolean);
      const top = '#' + bg.getHexString(), bottom = parts[1] || '#' + bg.clone().offsetHSL(0, 0, -.06).getHexString();
      paintBackdrop(top, bottom);
      const hsl = {}; bg.getHSL(hsl); const dark = hsl.l < .4;
      // stone takes a whisper of the page colour so it sits in the scene
      plinthMat.color.set('#f4f1ec').lerp(bg, dark ? .55 : .35); if (dark) plinthMat.color.multiplyScalar(.55);
      shadowBase = dark ? .85 : .6; glowMat.opacity = dark ? .08 : .14;
      tintNow.copy(tintOf(variant)); model.apply(tintNow); glowMat.color.copy(tintNow);
    }
    applyTheme();
    new MutationObserver(() => requestAnimationFrame(applyTheme)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => requestAnimationFrame(applyTheme));

    // ---------- variant switching ----------
    let tween = null, rotY = -.45, vel = 0, tiltX = 0, drag = null;
    onVariant = v => {
      const to = tintOf(v);
      tween = { t: 0, from: tintNow.clone(), to, tex: labelTex(model.kind, v), swapped: false };
      vel += reduced ? 0 : 7.5;
      if (reduced) tween.t = 1;
    };

    // ---------- framing ----------
    function resize() {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false);
      const aspect = w / h, fov = aspect < .9 ? 19 : 15, tan = Math.tan(fov * Math.PI / 360);
      const ctrl = ui.offsetHeight && el.dataset.ui !== 'right' ? (ui.offsetHeight + 24) / h : 0;      // keep clear of the switch
      const halfH = 1.72 / (1 - ctrl), halfW = (showPlinth ? 1.4 : 0.9);
      const zoom = Math.min(2, Math.max(.4, parseFloat(el.dataset.zoom) || 1)) * (w < 480 && el.dataset.ui === 'right' ? .9 : 1);
      const dist = Math.max(halfH / tan, halfW / (tan * aspect)) * 1.14 / zoom;
      camera.fov = fov; camera.aspect = aspect;
      const lookY = 1.3 - ctrl * halfH;
      camera.position.set(0, lookY + dist * .085, dist);
      camera.lookAt(0, lookY, 0);
      // backdrop fills the view a little way behind the bottle
      const bd = dist + 3, bh = 2 * Math.tan(fov * Math.PI / 360) * bd * 1.1;
      backdrop.position.set(0, lookY, -3); backdrop.scale.set(bh * aspect, bh, 1); backdrop.lookAt(camera.position);
      camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(el); resize();

    // ---------- drag, swipe and keys ----------
    const AUTO = reduced ? 0 : .16;
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, moved: false }; });
    addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now(), dt = Math.max(16, now - drag.t);
      if (!drag.moved && e.pointerType !== 'mouse' && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // vertical swipe scrolls the page
      if (!drag.moved) el.classList.add('mx3d-touched');
      drag.moved = true; rotY += dx * .011; vel = dx * .011 / (dt / 1000) * .6;
      drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
    });
    const end = () => { drag = null; };
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
    canvas.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { vel -= 3; e.preventDefault(); }
      if (e.key === 'ArrowRight') { vel += 3; e.preventDefault(); }
    });

    // ---------- render loop, only while on screen ----------
    let visible = true, raf = 0, last = performance.now(), frameNo = 0;
    const t0 = last;
    const start = () => { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    new IntersectionObserver(es => { visible = es[0].isIntersecting; start(); }).observe(el);
    document.addEventListener('visibilitychange', start);

    function frame(now) {
      raf = 0;
      const dt = Math.min(.05, (now - last) / 1000), t = (now - t0) / 1000; last = now;
      if (!drag) { vel += (AUTO - vel) * Math.min(1, dt * 1.6); rotY += vel * dt; tiltX *= Math.pow(.02, dt); }
      spin.rotation.y = rotY;
      shadowMat.opacity = shadowBase;
      if (tween) {
        tween.t = Math.min(1, tween.t + dt / .7);
        const k = tween.t < .5 ? 2 * tween.t * tween.t : 1 - Math.pow(-2 * tween.t + 2, 2) / 2;
        tintNow.lerpColors(tween.from, tween.to, k); model.apply(tintNow); glowMat.color.copy(tintNow);
        if (!tween.swapped && tween.t > .35) { model.ink.map = tween.tex; model.ink.needsUpdate = true; tween.swapped = true; }
        if (tween.t >= 1) tween = null;
      }
      if ((frameNo++ & 3) === 0) renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
      el.classList.add('mx3d-ready');
      start();
    }
    start();
  }
}

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch (e) { return false; }
}

/* Front-panel label for flat or curved fronts (prism, pebble): white ink on a transparent W x H canvas. */
function drawFront(V, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), sans = '"Sora", "Helvetica Neue", Arial, sans-serif', serif = '"Instrument Serif", Georgia, serif';
  const track = px => { try { g.letterSpacing = px + 'px'; } catch (e) { /* older browsers */ } };
  const cx = W / 2, u = H / 1400;
  g.fillStyle = g.strokeStyle = '#F7F3EC'; g.textAlign = 'center';
  g.font = `800 ${118 * u}px ${sans}`; track(-5 * u);
  const ww = g.measureText('minoxpak').width;
  g.fillText('minoxpak', cx + 38 * u, 200 * u);
  g.save(); g.translate(cx - ww / 2 - 34 * u, 158 * u); g.scale(3.1 * u, 3.1 * u); g.lineWidth = 2.3; g.lineCap = g.lineJoin = 'round';
  g.beginPath(); g.moveTo(0, 13); g.lineTo(0, -1);
  g.moveTo(0, 3); g.bezierCurveTo(-4, 2, -6, -1, -6, -5); g.bezierCurveTo(-2, -5, 0, -2, 0, 1);
  g.moveTo(0, 1); g.bezierCurveTo(0, -3, 2, -6, 6, -6); g.bezierCurveTo(6, -2, 4, 1, 0, 2);
  g.stroke(); g.restore();
  g.globalAlpha = .55; g.fillRect(cx - 200 * u, 280 * u, 400 * u, 3 * u); g.globalAlpha = 1;
  g.font = `400 ${470 * u}px ${serif}`; track(-9 * u); g.fillText(V.pct, cx, 790 * u);
  g.font = `italic 400 ${136 * u}px ${serif}`; track(0); g.fillText('Minoxidil', cx, 940 * u);
  g.font = `700 ${38 * u}px ${sans}`; track(11 * u); g.fillText(`TOPICAL SPRAY · ${V.who}`, cx, 1050 * u);
  g.globalAlpha = .8; g.font = `600 ${40 * u}px ${sans}`; track(4 * u); g.fillText('60 mL', cx, 1290 * u); g.globalAlpha = 1;
  return c;
}

/* Label artwork: white ink on a transparent 3072 x 1100 canvas that wraps 360 degrees.
   The centre (x = 1536) faces the viewer; the seam sits at the back. */
function drawLabel(V) {
  const W = 3072, H = 1100, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), sans = '"Sora", "Helvetica Neue", Arial, sans-serif', serif = '"Instrument Serif", Georgia, serif';
  const track = px => { try { g.letterSpacing = px + 'px'; } catch (e) { /* older browsers */ } };
  const cx = W / 2;
  g.fillStyle = g.strokeStyle = '#F7F3EC'; g.textAlign = 'center';

  // front: leaf mark + wordmark, rule, strength, name
  g.font = `800 118px ${sans}`; track(-5);
  const ww = g.measureText('minoxpak').width;
  g.fillText('minoxpak', cx + 38, 190);
  g.save(); g.translate(cx - ww / 2 - 34, 148); g.scale(3.1, 3.1); g.lineWidth = 2.3; g.lineCap = g.lineJoin = 'round';
  g.beginPath(); g.moveTo(0, 13); g.lineTo(0, -1);
  g.moveTo(0, 3); g.bezierCurveTo(-4, 2, -6, -1, -6, -5); g.bezierCurveTo(-2, -5, 0, -2, 0, 1);
  g.moveTo(0, 1); g.bezierCurveTo(0, -3, 2, -6, 6, -6); g.bezierCurveTo(6, -2, 4, 1, 0, 2);
  g.stroke(); g.restore();
  g.globalAlpha = .55; g.fillRect(cx - 210, 262, 420, 3); g.globalAlpha = 1;
  g.font = `400 400px ${serif}`; track(-8); g.fillText(V.pct, cx, 690);
  g.font = `italic 400 124px ${serif}`; track(0); g.fillText('Minoxidil', cx, 820);
  g.font = `700 38px ${sans}`; track(11); g.fillText(`TOPICAL SPRAY · ${V.who}`, cx, 915);
  g.globalAlpha = .8; g.font = `600 40px ${sans}`; track(4); g.fillText('60 mL', cx, 1030); g.globalAlpha = 1;

  // left side: directions
  g.textAlign = 'left';
  const block = (x, title, lines) => {
    g.font = `800 34px ${sans}`; track(9); g.fillText(title, x, 330);
    g.globalAlpha = .85; g.font = `500 36px ${sans}`; track(0);
    lines.forEach((l, i) => g.fillText(l, x, 400 + i * 54)); g.globalAlpha = 1;
  };
  block(W * .17, 'DIRECTIONS', ['Apply 1 mL (6 sprays) to a dry', 'scalp, twice a day. Spread gently', 'with your fingertips, then wash', 'your hands. Results build over', '3 to 4 months of daily use.']);

  // right side: active ingredient, warnings, barcode
  const rx = W * .69;
  block(rx, 'ACTIVE INGREDIENT', [`Minoxidil ${V.pct} w/v`, 'For external use only.', 'Keep out of reach of children.']);
  let bx = rx;
  for (let i = 0; i < 46; i++) { const w = [3, 3, 6, 3, 9][(i * 7 + 3) % 5]; g.fillRect(bx, 590, w, 120); bx += w + [4, 6, 4, 8][(i * 5) % 4]; }
  return c;
}

/* Minoxpak 3D bottle
   A self-contained ES module. Include it once with a module script tag pointing at bottle3d.js.
   It mounts into #hero-3d (or any element with data-bottle3d), keeps that element's existing
   children as the fallback, and only fetches three.js when the mount nears the viewport.
   Everything (frosted glass, liquid, collar, pump, printed label) is built in code; no model files.
   Options on the mount element:
     data-variant="men|women"   start variant (default men)
     data-controls="off"        hide the 5% / 2% switch
     data-plinth="off"          hide the stone plinth
   Fires a "bottle3d:variant" event on the mount with detail {variant, id} when the switch changes. */

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';

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
.mx3d-switch button{font:700 13px/1 var(--f,"Plus Jakarta Sans",system-ui,sans-serif);letter-spacing:-.01em;border:0;border-radius:999px;padding:10px 15px;background:transparent;color:#5c5852;cursor:pointer;white-space:nowrap;transition:background .25s,color .25s}
.mx3d-switch button[aria-pressed="true"]{background:#141414;color:#fff}
.mx3d-hint{font:700 10.5px/1 var(--f,"Plus Jakarta Sans",system-ui,sans-serif);letter-spacing:.16em;text-transform:uppercase;color:rgba(20,20,20,.5);display:flex;gap:9px;align-items:center;opacity:0;transition:opacity .6s .8s;white-space:nowrap}
.mx3d-hint::before,.mx3d-hint::after{content:"";width:18px;height:1px;background:currentColor}
.mx3d.mx3d-ready .mx3d-hint{opacity:1}
.mx3d.mx3d-touched .mx3d-hint{opacity:0;transition-delay:0s}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .mx3d-switch{background:rgba(30,30,28,.7)}:root:not([data-theme="light"]) .mx3d-switch button{color:#bdb7ad}:root:not([data-theme="light"]) .mx3d-switch button[aria-pressed="true"]{background:#f2efea;color:#141414}:root:not([data-theme="light"]) .mx3d-hint{color:rgba(242,239,234,.55)}}
:root[data-theme="dark"] .mx3d-switch{background:rgba(30,30,28,.7)}:root[data-theme="dark"] .mx3d-switch button{color:#bdb7ad}:root[data-theme="dark"] .mx3d-switch button[aria-pressed="true"]{background:#f2efea;color:#141414}:root[data-theme="dark"] .mx3d-hint{color:rgba(242,239,234,.55)}
`;

const VARIANTS = {
  men:   { id: 'm5', pct: '5%', who: 'FOR MEN',   label: 'Men · 5%',   tint: '#2c6a55', cssVar: '--brand' },
  women: { id: 'w2', pct: '2%', who: 'FOR WOMEN', label: 'Women · 2%', tint: '#a7685e' }
};

const mount = document.getElementById('hero-3d') || document.querySelector('[data-bottle3d]');
if (mount && !mount.dataset.mx3dMounted) setup(mount);

function setup(el) {
  el.dataset.mx3dMounted = '1';
  if (!document.getElementById('mx3d-style')) {
    const st = document.createElement('style'); st.id = 'mx3d-style'; st.textContent = CSS; document.head.appendChild(st);
  }
  if (!webglOK()) return; // keep the existing fallback art untouched

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
      await Promise.all(['800 100px "Plus Jakarta Sans"', '500 36px "Plus Jakarta Sans"', '400 100px "Instrument Serif"', 'italic 400 100px "Instrument Serif"']
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(24, 1, .1, 100);

    // Studio lighting baked into an environment map: tall softbox strips give the glass its highlights.
    const pm = new THREE.PMREMGenerator(renderer), env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(24, 24, 24), new THREE.MeshBasicMaterial({ color: C('#6f6a63'), side: THREE.BackSide })));
    const softbox = (w, h, x, y, z, k, tint = '#ffffff') => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: C(tint).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, y * .3, 0); env.add(m);
    };
    softbox(1.4, 14, -6.5, 1, 3, 9);          // key strip, left
    softbox(1, 14, 6.5, 1, 1.5, 5);           // fill strip, right
    softbox(3, 12, -2, 1, -8, 7);             // rim, behind
    softbox(10, 10, 0, 10, 0, 2.4, '#fff6ea'); // warm top
    softbox(8, 3, 0, -1, 9, .8, '#fff4e6');    // soft front bounce
    scene.environment = pm.fromScene(env, .035).texture;
    const key = new THREE.DirectionalLight('#ffffff', 1.2); key.position.set(-3, 6, 4); scene.add(key);

    // The canvas is transparent, so the frosted glass would refract nothing. This backdrop is drawn
    // only into three's transmission buffer, in the colour of the page behind the mount.
    const backdropMat = new THREE.MeshBasicMaterial({ toneMapped: false, depthWrite: false });
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), backdropMat);
    backdrop.position.z = -6; backdrop.renderOrder = -10;
    backdrop.onBeforeRender = r => { backdropMat.colorWrite = r.getRenderTarget() !== null; };
    scene.add(backdrop);

    // ---------- bottle ----------
    const root = new THREE.Group(), spin = new THREE.Group(); root.add(spin); scene.add(root);
    const V2 = (x, y) => new THREE.Vector2(x, y);
    const lathe = (pts, seg = 128) => new THREE.LatheGeometry(pts, seg);
    const R = .62, H = 1.92;
    const shoulder = new THREE.QuadraticBezierCurve(V2(R, H), V2(R, 2.26), V2(.215, 2.27)).getPoints(24);
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#ffffff', roughness: .3, transmission: 1, thickness: .7, ior: 1.5,
      attenuationColor: tintOf(variant), attenuationDistance: 1.1,
      clearcoat: 1, clearcoatRoughness: .05, specularIntensity: 1, envMapIntensity: 1.15
    });
    spin.add(new THREE.Mesh(lathe([V2(0, 0), V2(.48, 0), V2(.56, .006), V2(.598, .024), V2(.615, .055), V2(R, .1), ...shoulder, V2(.205, 2.3), V2(.205, 2.36), V2(0, 2.36)]), glass));

    // Liquid is opaque so it reads through the frosted glass, giving a soft fill line.
    const liquidOf = c => c.clone().lerp(C('#ffffff'), .28);
    const liquid = new THREE.MeshStandardMaterial({ color: liquidOf(tintOf(variant)), roughness: .25 });
    spin.add(new THREE.Mesh(lathe([V2(0, .12), V2(.5, .12), V2(.545, .14), V2(.56, .19), V2(.56, 1.58), V2(0, 1.58)], 96), liquid));
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, 2.2, 12), new THREE.MeshStandardMaterial({ color: '#e9ece8', roughness: .35 }));
    tube.position.y = 1.22; spin.add(tube);

    // White-ink label printed straight onto the glass, wrapping the whole bottle.
    const tex = {};
    const labelTex = v => {
      if (tex[v]) return tex[v];
      const t = new THREE.CanvasTexture(drawLabel(VARIANTS[v]));
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return (tex[v] = t);
    };
    const inkMat = new THREE.MeshStandardMaterial({ map: labelTex(variant), transparent: true, roughness: .42, depthWrite: false });
    const label = new THREE.Mesh(new THREE.CylinderGeometry(R + .003, R + .003, 1.4, 160, 1, true, -Math.PI, Math.PI * 2), inkMat);
    label.position.y = 1.06; label.renderOrder = 2; spin.add(label);

    // Brushed metal collar with two fine grooves.
    const cr = .278;
    spin.add(new THREE.Mesh(lathe([V2(.2, 2.29), V2(cr - .012, 2.29), V2(cr, 2.302), V2(cr, 2.35), V2(cr - .008, 2.356), V2(cr, 2.362), V2(cr, 2.45), V2(cr - .008, 2.456), V2(cr, 2.462), V2(cr, 2.508), V2(cr - .012, 2.52), V2(.17, 2.52)]),
      new THREE.MeshStandardMaterial({ color: '#d9d5cd', metalness: 1, roughness: .3 })));

    // Soft-touch black pump actuator with a nozzle.
    const black = new THREE.MeshPhysicalMaterial({ color: '#121212', roughness: .5, clearcoat: .35, clearcoatRoughness: .4 });
    spin.add(new THREE.Mesh(lathe([V2(0, 2.525), V2(.06, 2.525), V2(.06, 2.545), V2(.198, 2.545), V2(.205, 2.555), V2(.205, 2.83), V2(.196, 2.866), V2(.17, 2.886), V2(.12, 2.893), V2(0, 2.895)]), black));
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .03, 32), black);
    nozzle.rotation.x = Math.PI / 2; nozzle.position.set(0, 2.76, .212); spin.add(nozzle);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(.012, 24), new THREE.MeshBasicMaterial({ color: '#000' }));
    hole.position.set(0, 2.76, .2276); spin.add(hole);

    // ---------- plinth and contact shadow ----------
    const showPlinth = el.dataset.plinth !== 'off';
    const plinthMat = new THREE.MeshStandardMaterial({ roughness: .92 });
    const PR = 1.28;
    const plinth = new THREE.Mesh(lathe([V2(0, -.3), V2(PR - .02, -.3), V2(PR, -.28), V2(PR, -.02), V2(PR - .02, 0), V2(0, 0)]), plinthMat);
    plinth.visible = showPlinth; scene.add(plinth);
    const sc = document.createElement('canvas'); sc.width = sc.height = 256;
    const sg = sc.getContext('2d'), grd = sg.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(0,0,0,.55)'); grd.addColorStop(.45, 'rgba(0,0,0,.28)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = grd; sg.fillRect(0, 0, 256, 256);
    const blob = new THREE.CanvasTexture(sc);
    const shadowMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, toneMapped: false });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), shadowMat);
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .002; scene.add(shadow);
    const glowMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, color: glass.attenuationColor.clone() });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), glowMat);
    glow.rotation.x = -Math.PI / 2; glow.position.set(.35, .003, .25); glow.visible = showPlinth; scene.add(glow);

    // ---------- match the page behind the mount (and follow light/dark changes) ----------
    let shadowBase = .7;
    function pageColor() {
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor, m = bg && bg.match(/[\d.]+/g);
        if (m && (m.length < 4 || +m[3] > .5)) return bg;
      }
      return getComputedStyle(document.body).backgroundColor || '#F6F3EE';
    }
    function applyTheme() {
      const bg = new THREE.Color(); try { bg.setStyle(pageColor()); } catch (e) { bg.set('#EAE4DA'); }
      backdropMat.color.copy(bg);
      const hsl = {}; bg.getHSL(hsl); const dark = hsl.l < .4;
      plinthMat.color.copy(bg).offsetHSL(0, 0, dark ? .05 : -.04);
      shadowBase = dark ? .9 : .7; glowMat.opacity = dark ? .12 : .22;
      glass.attenuationColor.copy(tintOf(variant)); liquid.color.copy(liquidOf(glass.attenuationColor)); glowMat.color.copy(glass.attenuationColor);
    }
    applyTheme();
    new MutationObserver(() => requestAnimationFrame(applyTheme)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => requestAnimationFrame(applyTheme));

    // ---------- variant switching ----------
    let tween = null, rotY = -.9, vel = 0, tiltX = 0, drag = null;
    onVariant = v => {
      const to = tintOf(v);
      tween = { t: 0, fromA: glass.attenuationColor.clone(), toA: to, fromL: liquid.color.clone(), toL: liquidOf(to), tex: labelTex(v), swapped: false };
      vel += reduced ? 0 : 7.5;
      if (reduced) tween.t = 1;
    };

    // ---------- framing ----------
    function resize() {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false);
      const aspect = w / h, fov = aspect < .9 ? 30 : 24, tan = Math.tan(fov * Math.PI / 360);
      const ctrl = ui.offsetHeight ? (ui.offsetHeight + 24) / h : 0;      // keep clear of the switch
      const halfH = 1.75 / (1 - ctrl), halfW = (showPlinth ? 1.42 : 0.9);
      const dist = Math.max(halfH / tan, halfW / (tan * aspect)) * 1.08;
      camera.fov = fov; camera.aspect = aspect;
      camera.position.set(0, 1.35 + dist * .1, dist);
      camera.lookAt(0, 1.32 - ctrl * halfH, 0);
      camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(el); resize();

    // ---------- drag, swipe and keys ----------
    const AUTO = reduced ? 0 : .22;
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, moved: false }; });
    addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now(), dt = Math.max(16, now - drag.t);
      if (!drag.moved && e.pointerType !== 'mouse' && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // vertical swipe scrolls the page
      if (!drag.moved) el.classList.add('mx3d-touched');
      drag.moved = true; rotY += dx * .011; vel = dx * .011 / (dt / 1000) * .6;
      tiltX = Math.max(-.16, Math.min(.16, tiltX + dy * .002));
      drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
    });
    const end = () => { drag = null; };
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
    canvas.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { vel -= 3; e.preventDefault(); }
      if (e.key === 'ArrowRight') { vel += 3; e.preventDefault(); }
    });

    // ---------- render loop, only while on screen ----------
    let visible = true, raf = 0, last = performance.now();
    const t0 = last;
    const start = () => { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    new IntersectionObserver(es => { visible = es[0].isIntersecting; start(); }).observe(el);
    document.addEventListener('visibilitychange', start);

    function frame(now) {
      raf = 0;
      const dt = Math.min(.05, (now - last) / 1000), t = (now - t0) / 1000; last = now;
      if (!drag) { vel += (AUTO - vel) * Math.min(1, dt * 1.6); rotY += vel * dt; tiltX *= Math.pow(.02, dt); }
      spin.rotation.y = rotY; root.rotation.x = tiltX * .6;
      const f = reduced ? 0 : Math.sin(t * 1.1) * .035;
      root.position.y = .07 + f;
      const s = 1 - f * 2.2; shadow.scale.set(s, s, s); shadowMat.opacity = shadowBase * (1 - f * 4);
      if (tween) {
        tween.t = Math.min(1, tween.t + dt / .7);
        const k = tween.t < .5 ? 2 * tween.t * tween.t : 1 - Math.pow(-2 * tween.t + 2, 2) / 2;
        glass.attenuationColor.lerpColors(tween.fromA, tween.toA, k);
        liquid.color.lerpColors(tween.fromL, tween.toL, k);
        glowMat.color.copy(glass.attenuationColor);
        if (!tween.swapped && tween.t > .35) { inkMat.map = tween.tex; inkMat.needsUpdate = true; tween.swapped = true; }
        if (tween.t >= 1) tween = null;
      }
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

/* Label artwork: white ink on a transparent 3072 x 1100 canvas that wraps 360 degrees.
   The centre (x = 1536) faces the viewer; the seam sits at the back. */
function drawLabel(V) {
  const W = 3072, H = 1100, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), sans = '"Plus Jakarta Sans", "Helvetica Neue", Arial, sans-serif', serif = '"Instrument Serif", Georgia, serif';
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

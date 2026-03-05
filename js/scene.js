/**
 * scene.js
 *
 * OPENING RULES
 *   - Each opening owns its own style (op.style).
 *   - Openings on the same wall cannot overlap (MIN_BETWEEN_GAP clearance enforced).
 *   - Placement is blocked if no non-overlapping position exists.
 *   - Dragging snaps to the nearest gap that fits; if none, the handle won't move.
 */

// ─── RENDERER ──────────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.outputEncoding    = THREE.sRGBEncoding;

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sunLight = new THREE.DirectionalLight(0xfff8e7, 1.1);
sunLight.position.set(8, 12, 6);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = sunLight.shadow.camera.bottom = -14;
sunLight.shadow.camera.right = sunLight.shadow.camera.top  =  14;
scene.add(sunLight);
const fillLight = new THREE.DirectionalLight(0xd0e8ff, 0.35);
fillLight.position.set(-5, 3, -5);
scene.add(fillLight);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: 0x2a6016 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(24, 24, 0x5a9a50, 0x5a9a50);
grid.material.opacity = 0.2; grid.material.transparent = true;
scene.add(grid);

const buildingGroup = new THREE.Group();
const handlesGroup  = new THREE.Group();
scene.add(buildingGroup);
scene.add(handlesGroup);

// ─── SKY DOME ──────────────────────────────────────────────────────────────────
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(80, 32, 16),
  new THREE.ShaderMaterial({
    uniforms: {
      uTop:     { value: new THREE.Color(0x0e6ba8) },
      uHorizon: { value: new THREE.Color(0xc8e3f5) },
    },
    vertexShader: `
      varying float vY;
      void main() {
        vY = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      varying float vY;
      void main() {
        float t = clamp((vY + 0.12) / 1.12, 0.0, 1.0);
        gl_FragColor = vec4(mix(uHorizon, uTop, pow(t, 0.55)), 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  })
);
scene.add(skyDome);
scene.fog = new THREE.FogExp2(0xb8d8f0, 0.006);

// ─── WALL DIMENSION ARROWS ────────────────────────────────────────────────────
const wallArrowGroup = new THREE.Group();
scene.add(wallArrowGroup);
const wallLabels = {};

// ─── MATERIALS ─────────────────────────────────────────────────────────────────

const texLoader = new THREE.TextureLoader();

function makeWallMat(w, h) {
  const texFile = { timber:'assets/tex_timber.jpg', render:'assets/tex_render.jpg', composite:'assets/tex_composite.jpg', cedar:'assets/tex_cedar.jpg' }[state.cladding];
  const tex = texLoader.load(texFile);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.encoding = THREE.sRGBEncoding;
  if (state.cladding === 'timber' || state.cladding === 'cedar') {
    tex.rotation = Math.PI / 2; tex.center.set(0.5, 0.5); tex.repeat.set(h * 0.6, w * 0.5);
  } else {
    tex.repeat.set(Math.max(1, Math.round(w * 1.2)), Math.max(1, Math.round(h * 0.8)));
  }
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  if (state.claddingTint) mat.color.set(state.claddingTint);
  return mat;
}

function makeRoofMat() {
  const texFile = { epdm:'assets/roof_epdm.jpg', shingle_grey:'assets/roof_shingle_grey.jpg', shingle_red:'assets/roof_shingle_red.jpg', grass:'assets/roof_grass.jpg', pebbles:'assets/roof_pebbles.jpg', cedar:'assets/roof_cedar.jpg' }[state.roofFinish] || 'assets/roof_epdm.jpg';
  const tex = texLoader.load(texFile);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.encoding = THREE.sRGBEncoding; tex.repeat.set(4, 4);
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  if (state.claddingTint) mat.color.set(state.claddingTint);
  return mat;
}

const glassMat = new THREE.MeshPhongMaterial({ color: 0xa8d8ea, transparent: true, opacity: 0.2, shininess: 200, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false });
let frameMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
function getFrameMat() {
  frameMat.color.set(state.frameColour || '#1a1a1a');
  return frameMat;
}
const slabMat  = new THREE.MeshLambertMaterial({ color: 0xccccbb });
const floorMat = new THREE.MeshLambertMaterial({ color: 0xc8a87a });
const deckMat  = new THREE.MeshLambertMaterial({ color: 0x7a5210 });
const boardMat = new THREE.MeshLambertMaterial({ color: 0x6b4810 });

const HANDLE_DOOR_COLOR  = 0xf59e0b;
const HANDLE_WIN_COLOR   = 0x38bdf8;
const HANDLE_HOVER_COLOR = 0xffffff;
const HANDLE_SEL_COLOR   = 0xef4444;

// ─── GLB LOADER ────────────────────────────────────────────────────────────────

const gltfLoader = new THREE.GLTFLoader();
const modelCache = {};
function loadModel(file) {
  return new Promise(resolve => {
    if (modelCache[file]) { resolve(modelCache[file].clone()); return; }
    gltfLoader.load(file, gltf => { modelCache[file] = gltf.scene; resolve(gltf.scene.clone()); }, undefined, err => { console.warn('GLB:', file, err); resolve(null); });
  });
}

// ─── MODEL SPECS ───────────────────────────────────────────────────────────────

const DOOR_MODEL = {
  single:  { file: 'assets/door_french.glb',  naturalW: 1.6 },
  double:  { file: 'assets/door_french.glb',  naturalW: 1.6 },
  bifold:  { file: 'assets/door_bifold.glb',  naturalW: 2.4 },
  sliding: { file: 'assets/door_sliding.glb', naturalW: 2.4 },
};
const WINDOW_MODEL = {
  tilt:  { file: 'assets/win_tilt.glb',  naturalW: 0.90,  naturalH: 1.20, sill: 0.90 },
  long:  { file: 'assets/win_long.glb',  naturalW: 0.971, naturalH: 2.10, sill: 0.05 },
  vert:  { file: 'assets/win_vert.glb',  naturalW: 0.40,  naturalH: 1.20, sill: 0.90 },
  horiz: { file: 'assets/win_horiz.glb', naturalW: 1.20,  naturalH: 0.40, sill: 1.30 },
};

const DOOR_H       = 2.1;
const TK           = 0.08;          // wall thickness
const MIN_EDGE_GAP = 0.12;          // opening to wall corner
const MIN_BETWEEN  = 0.10;          // gap between adjacent openings

// ─── GEOMETRY HELPER ───────────────────────────────────────────────────────────

function box(W, H, D, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
  buildingGroup.add(m); return m;
}

// ─── COORDINATE TRANSFORMS ─────────────────────────────────────────────────────

function localToWorld(wallId, localX, localY, hw, hd) {
  const y = 0.18 + localY;
  switch (wallId) {
    case 'front': return { x: -hw + localX, y, z:  hd };
    case 'back':  return { x:  hw - localX, y, z: -hd };
    case 'left':  return { x: -hw,          y, z:  hd - localX };
    case 'right': return { x:  hw,          y, z: -hd + localX };
  }
}
function worldToLocalX(wallId, worldPt, hw, hd) {
  switch (wallId) {
    case 'front': return worldPt.x + hw;
    case 'back':  return hw - worldPt.x;
    case 'left':  return hd - worldPt.z;
    case 'right': return worldPt.z + hd;
  }
}
function wallWidth(wallId) {
  return (wallId === 'left' || wallId === 'right') ? state.depth : state.width;
}

// ─── OPENING GEOMETRY FROM STATE ───────────────────────────────────────────────

function openingW(op) {
  return op.type === 'door' ? DOOR[op.style].widthM : WINDOW_MODEL[op.style].naturalW;
}
function openingH(op) {
  return op.type === 'door' ? DOOR_H : WINDOW_MODEL[op.style].naturalH;
}
function openingSill(op) {
  return op.type === 'door' ? 0 : WINDOW_MODEL[op.style].sill;
}

function clampOffset(offset, wallW, ow) {
  const max = wallW / 2 - ow / 2 - MIN_EDGE_GAP;
  return max <= 0 ? 0 : Math.max(-max, Math.min(max, offset));
}

// LocalCx of an opening given its current offset
function opLocalCx(op) {
  const ww = wallWidth(op.wall);
  return ww / 2 + clampOffset(op.offset, ww, openingW(op));
}

// Convert op to descriptor for wall builder
function opToDescriptor(op) {
  const ww = wallWidth(op.wall);
  const ow = openingW(op);
  const localCx = ww / 2 + clampOffset(op.offset, ww, ow);
  const oh = openingH(op);
  const sill = openingSill(op);
  return {
    localCx,
    localCy: sill + oh / 2,
    w: ow, h: oh,
    isDoor: op.type === 'door',
    style: op.style,
    opId: op.id,
  };
}

// ─── OVERLAP DETECTION ─────────────────────────────────────────────────────────

/**
 * Given an opening (type, style, wall) at a candidate localCx,
 * does it overlap any other opening on the same wall?
 * excludeId: opening to skip (for drag — don't collide with yourself)
 */
function wouldOverlap(type, style, wallId, candidateLocalCx, excludeId = -1) {
  const ow    = type === 'door' ? DOOR[style].widthM : WINDOW_MODEL[style].naturalW;
  const left  = candidateLocalCx - ow / 2;
  const right = candidateLocalCx + ow / 2;

  for (const op of state.openings) {
    if (op.id === excludeId) continue;
    if (op.wall !== wallId) continue;
    const oow   = openingW(op);
    const ocx   = opLocalCx(op);
    const oleft  = ocx - oow / 2 - MIN_BETWEEN;
    const oright = ocx + oow / 2 + MIN_BETWEEN;
    if (left < oright && right > oleft) return true;
  }
  return false;
}

/**
 * Find the closest valid localCx to `targetLocalCx` on a wall where
 * (type, style) doesn't overlap any other opening (excluding excludeId).
 * Returns null if the wall has no room at all.
 */
function findValidPosition(type, style, wallId, targetLocalCx, excludeId = -1) {
  const ww  = wallWidth(wallId);
  const ow  = type === 'door' ? DOOR[style].widthM : WINDOW_MODEL[style].naturalW;
  const min = ow / 2 + MIN_EDGE_GAP;
  const max = ww - ow / 2 - MIN_EDGE_GAP;
  if (min > max) return null;

  // Build list of blocked ranges from other openings on same wall
  const blocked = state.openings
    .filter(o => o.id !== excludeId && o.wall === wallId)
    .map(o => {
      const oow = openingW(o);
      const ocx = opLocalCx(o);
      return { left: ocx - oow / 2 - MIN_BETWEEN - ow / 2, right: ocx + oow / 2 + MIN_BETWEEN + ow / 2 };
    })
    .sort((a, b) => a.left - b.left);

  // Build free intervals
  const free = [];
  let cursor = min;
  for (const b of blocked) {
    if (b.left > cursor) free.push({ from: cursor, to: Math.min(max, b.left) });
    cursor = Math.max(cursor, b.right);
  }
  if (cursor <= max) free.push({ from: cursor, to: max });
  if (!free.length) return null;

  // Pick interval whose clamped point is closest to target
  let bestPos = null, bestDist = Infinity;
  for (const seg of free) {
    const clamped = Math.max(seg.from, Math.min(seg.to, targetLocalCx));
    const dist = Math.abs(clamped - targetLocalCx);
    if (dist < bestDist) { bestDist = dist; bestPos = clamped; }
  }
  return bestPos;
}

// ─── WALL SEGMENTATION ─────────────────────────────────────────────────────────

function getWallPanels(wallW, wallH, descriptors) {
  if (!descriptors.length) return [{ cx: wallW / 2, cy: wallH / 2, w: wallW, h: wallH }];

  const ops = descriptors
    .map(o => ({ ...o, x0: o.localCx - o.w / 2, x1: o.localCx + o.w / 2 }))
    .sort((a, b) => a.x0 - b.x0);

  const xPts = [0];
  ops.forEach(o => xPts.push(o.x0, o.x1));
  xPts.push(wallW);
  const xs = [...new Set(xPts.map(v => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);

  const panels = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1];
    if (x1 - x0 < 0.005) continue;
    const cx = (x0 + x1) / 2, sw = x1 - x0;
    const inStrip = ops.filter(o => o.x0 <= x0 + 0.002 && o.x1 >= x1 - 0.002);
    if (!inStrip.length) {
      panels.push({ cx, cy: wallH / 2, w: sw, h: wallH });
    } else {
      let y = 0;
      for (const op of inStrip.sort((a, b) => (a.localCy - a.h / 2) - (b.localCy - b.h / 2))) {
        const y0 = op.localCy - op.h / 2, y1 = op.localCy + op.h / 2;
        if (y0 - y > 0.005) panels.push({ cx, cy: y + (y0 - y) / 2, w: sw, h: y0 - y });
        y = y1;
      }
      if (wallH - y > 0.005) panels.push({ cx, cy: y + (wallH - y) / 2, w: sw, h: wallH - y });
    }
  }
  return panels;
}

// ─── WALL FACE BUILDER ─────────────────────────────────────────────────────────

// Triangular wedge panel that fills the slanted top of left/right walls under tilted flat roof
// minH = back (low) wall height, maxH = front (high) wall height
function addSideWedge(wallId, minH, maxH, mat, hw, hd) {
  const x   = wallId === 'left' ? -hw : hw;
  const xIn = wallId === 'left' ? -hw + TK : hw - TK; // inner face offset
  const yBase = 0.18 + minH;
  const yTop  = 0.18 + maxH;
  // Wedge runs z: -hd (back/low) → +hd (front/high)
  // Two outer tris + two inner tris + three connecting quads
  const geo = new THREE.BufferGeometry();
  const v = new Float32Array([
    // outer face (4 verts, CW looking outward)
    x, yBase, -hd,   // 0 back-low
    x, yBase,  hd,   // 1 front-low
    x, yTop,   hd,   // 2 front-high
    // inner face
    xIn, yBase, -hd, // 3 back-low
    xIn, yBase,  hd, // 4 front-low
    xIn, yTop,   hd, // 5 front-high
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.setIndex([
    // outer tri
    0,2,1,
    // inner tri
    3,4,5,
    // bottom quad (back-low → front-low)
    0,1,4, 0,4,3,
    // front quad (vertical face at +hd)
    1,2,5, 1,5,4,
    // hypotenuse slant (back at yBase → front at yTop)
    0,3,5, 0,5,2,
  ]);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  buildingGroup.add(m);
}

function buildWallFace(wallId, wallW, wallH, descriptors, wallMat, hw, hd) {
  const isLR = wallId === 'left' || wallId === 'right';

  getWallPanels(wallW, wallH, descriptors).forEach(({ cx, cy, w, h }) => {
    const { x, y, z } = localToWorld(wallId, cx, cy, hw, hd);
    const geo = isLR ? new THREE.BoxGeometry(TK, h, w) : new THREE.BoxGeometry(w, h, TK);
    const m = new THREE.Mesh(geo, wallMat);
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
    buildingGroup.add(m);
  });

  descriptors.forEach(desc => {
    const wc = localToWorld(wallId, desc.localCx, desc.localCy, hw, hd);
    if (desc.isDoor) {
      placeDoorGLB(wc.x, desc.w, desc.style, hd);
    } else {
      const pane = new THREE.Mesh(
        isLR ? new THREE.BoxGeometry(0.015, desc.h, desc.w) : new THREE.BoxGeometry(desc.w, desc.h, 0.015),
        glassMat
      );
      pane.position.set(wc.x, wc.y, wc.z);
      buildingGroup.add(pane);
      placeWindowGLB(wallId, wc, desc.h, desc.w, desc.style, hw, hd);
    }
  });
}

// ─── GLB PLACEMENT (use op.style) ──────────────────────────────────────────────

function placeDoorGLB(worldCentreX, doorW, style, hd) {
  const dm = DOOR_MODEL[style];
  loadModel(dm.file).then(model => {
    if (!model) return;
    model.scale.set(doorW / dm.naturalW, 1, 1);
    model.rotation.y = Math.PI;
    model.position.set(worldCentreX + doorW / 2, 0.18, hd);
    model.traverse(c => { if (c.isMesh) { c.castShadow = c.receiveShadow = true; } });
    buildingGroup.add(model);
  });
}

function placeWindowGLB(wallId, worldCentre, oh, ow, style, hw, hd) {
  const wm = WINDOW_MODEL[style];
  loadModel(wm.file).then(model => {
    if (!model) return;
    model.traverse(c => { if (c.isMesh) { c.castShadow = c.receiveShadow = true; } });
    const { x, y, z } = worldCentre;
    const yB = y - oh / 2;
    switch (wallId) {
      case 'front': model.rotation.y = Math.PI;     model.position.set(x + wm.naturalW/2, yB,  hd); break;
      case 'back':  model.rotation.y = 0;           model.position.set(x - wm.naturalW/2, yB, -hd); break;
      case 'left':  model.rotation.y = Math.PI/2;   model.position.set(-hw, yB, z + wm.naturalW/2); break;
      case 'right': model.rotation.y = -Math.PI/2;  model.position.set( hw, yB, z - wm.naturalW/2); break;
    }
    buildingGroup.add(model);
  });
}

// ─── ROOF ──────────────────────────────────────────────────────────────────────

function buildRoof(w, d, h, hw, hd) {
  const roofY = 0.18 + h, ov = 0.3, panelD = d + ov * 2, rMat = makeRoofMat(), pT = 0.1;
  const rp = (W, D, x, y, z, rz=0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(W, pT, D), rMat); m.position.set(x,y,z); m.rotation.z=rz; m.castShadow=true; buildingGroup.add(m); };
  const fa = (W, H, D, x, y, z)    => { const m = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), getFrameMat()); m.position.set(x,y,z); buildingGroup.add(m); };

  if (state.roof === 'flat') {
    const tiltRad = ((state.roofTilt || 0) * Math.PI) / 180;
    // Panel: tilted along X axis so front edge is higher (back-to-front drainage)
    const panelM = new THREE.Mesh(new THREE.BoxGeometry(w+ov*2, pT, panelD), rMat);
    panelM.position.set(0, roofY+pT/2, 0);
    panelM.rotation.x = -tiltRad;  // negative: front(+Z) is HIGH, back(-Z) is LOW
    panelM.castShadow = true;
    buildingGroup.add(panelM);
    // Fascia heights adjust with tilt: front is higher, back lower
    const tiltRise = Math.tan(tiltRad) * (hd + ov);
    const fH = 0.25;
    // Front fascia (higher side)
    const fYFront = roofY + tiltRise - fH/2 + pT;
    fa(w+ov*2+0.05, fH, 0.06, 0, fYFront, hd+ov);
    // Back fascia (lower side)
    const fYBack = roofY - tiltRise - fH/2 + pT;
    fa(w+ov*2+0.05, fH, 0.06, 0, fYBack, -(hd+ov));
    // Side fascia: positioned at midpoint height (tilted roof edge visible from side)
    // We replace with a slanted trim that follows the tilt
    [-hw-ov, hw+ov].forEach(xPos => {
      // Build a thin quad matching the slant: back at roofY-tiltRise, front at roofY+tiltRise
      const geo = new THREE.BufferGeometry();
      const sZ = hd + ov, fD = 0.06, yB = roofY - tiltRise - fH/2 + pT, yF = roofY + tiltRise - fH/2 + pT;
      const v = new Float32Array([
        xPos-fD/2, yB,    -sZ,  xPos+fD/2, yB,    -sZ,
        xPos-fD/2, yB+fH, -sZ,  xPos+fD/2, yB+fH, -sZ,
        xPos-fD/2, yF,     sZ,  xPos+fD/2, yF,     sZ,
        xPos-fD/2, yF+fH,  sZ,  xPos+fD/2, yF+fH,  sZ,
      ]);
      geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
      geo.setIndex([
        0,2,1, 1,2,3,     // back face
        4,5,6, 5,7,6,     // front face
        0,1,5, 0,5,4,     // bottom
        2,6,7, 2,7,3,     // top
        0,4,6, 0,6,2,     // left side
        1,3,7, 1,7,5,     // right side
      ]);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, getFrameMat()); m.castShadow=true; buildingGroup.add(m);
    });
    if (state.extras.lantern) {
      const lw=w*0.38,ld=d*0.38,ly=roofY+pT;
      rp(lw+0.1,ld+0.1,0,ly+0.08,0);
      const lg=new THREE.Mesh(new THREE.BoxGeometry(lw,0.55,ld),new THREE.MeshPhongMaterial({color:0xd0ecff,transparent:true,opacity:0.45,shininess:120}));
      lg.position.set(0,ly+0.435,0); buildingGroup.add(lg);
      rp(lw+0.08,ld+0.08,0,ly+0.72,0);
    }
  } else if (state.roof === 'apex') {
    // Ridge runs along X axis; slopes pitch toward front (+Z) and back (-Z)
    const rh=1.0, spanZ=hd+ov, spanW=w+ov*2;
    const slopeLen=Math.sqrt(spanZ*spanZ+rh*rh), angle=Math.atan2(rh,spanZ);

    // ── Front slope panel ──
    const fp=new THREE.Mesh(new THREE.BoxGeometry(spanW,pT,slopeLen),rMat);
    fp.position.set(0,roofY+rh/2,spanZ/2); fp.rotation.x=angle; fp.castShadow=true; buildingGroup.add(fp);

    // ── Back slope panel ──
    const bp=new THREE.Mesh(new THREE.BoxGeometry(spanW,pT,slopeLen),rMat);
    bp.position.set(0,roofY+rh/2,-spanZ/2); bp.rotation.x=-angle; bp.castShadow=true; buildingGroup.add(bp);

    // ── Ridge beam ──
    const ridge=new THREE.Mesh(new THREE.BoxGeometry(spanW+0.1,0.10,0.10),getFrameMat());
    ridge.position.set(0,roofY+rh+pT/2,0); buildingGroup.add(ridge);

    // ── Gable end fills: flat BufferGeometry triangles, flush with wall faces ──
    // Span from z=-(hd+ov) to z=+(hd+ov) to cover the full overhang width
    const gMat = makeWallMat(w, h);
    [-hw, hw].forEach(x => {
      const geo = new THREE.BufferGeometry();
      const verts = new Float32Array([
        x, roofY,       -(hd+ov),
        x, roofY,        (hd+ov),
        x, roofY+rh,     0,
      ]);
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      // Double-sided: two triangles with opposite winding
      geo.setIndex([0,2,1, 0,1,2]);
      geo.computeVertexNormals();
      const g = new THREE.Mesh(geo, gMat);
      g.castShadow = true;
      buildingGroup.add(g);
    });

    // ── Front & back eave fascia boards ──
    const fH=0.20, eY=roofY;
    fa(spanW+0.06,fH,0.07, 0,eY-fH/2+0.02, +(hd+ov));
    fa(spanW+0.06,fH,0.07, 0,eY-fH/2+0.02, -(hd+ov));
  }

  // ── Guttering ──────────────────────────────────────────────────────────────
  buildGuttering(w, d, h, hw, hd, ov);
}

function buildGuttering(w, d, h, hw, hd, ov) {
  const gutMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const gutH = 0.09, gutD = 0.10, pipeR = 0.035;

  // Box is long along LOCAL X (span), shallow profile in Y (height) and Z (depth).
  // Side gutters pass rotY=PI/2 which rotates local-X → world-Z.
  function gutter(span, cx, cy, cz, rotY) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(span, gutH, gutD), gutMat);
    m.position.set(cx, cy, cz);
    if (rotY) m.rotation.y = rotY;
    m.castShadow = true;
    buildingGroup.add(m);
  }

  // Downpipe from y=0 (ground) up to topY (eave)
  function downpipe(cx, cz, topY) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(pipeR, pipeR, topY, 8), gutMat);
    m.position.set(cx, topY / 2, cz);
    m.castShadow = true;
    buildingGroup.add(m);
  }

  if (state.roof === 'flat') {
    const tiltRad  = ((state.roofTilt || 0) * Math.PI) / 180;
    const tiltRise = Math.tan(tiltRad) * (hd + ov);
    // Front is HIGH (+Z, rotation.x = -tiltRad makes +Z rise)
    const eaveYFront = 0.18 + h + tiltRise;
    // Back is LOW (drainage side)
    const eaveYBack  = 0.18 + h - tiltRise;
    const eaveYSide  = 0.18 + h; // sides are midpoint

    // Front gutter (high side) — box long in X, sits just outside front fascia
    gutter(w + ov*2, 0, eaveYFront - gutH/2, hd + ov + gutD/2);
    // Back gutter (low/drain side)
    gutter(w + ov*2, 0, eaveYBack  - gutH/2, -(hd + ov + gutD/2));
    // Left & right side gutters — rotY=PI/2 makes span run in Z
    gutter(d + ov*2, -(hw + ov + gutD/2), eaveYSide - gutH/2, 0, Math.PI/2);
    gutter(d + ov*2,   hw + ov + gutD/2,  eaveYSide - gutH/2, 0, Math.PI/2);
    // Downpipe at back-right corner (lowest point — drain side)
    downpipe(hw + ov, -(hd + ov + gutD/2), eaveYBack);

  } else if (state.roof === 'apex') {
    const eaveY = 0.18 + h;
    // Front & back eave gutters (apex pitches front/back so both are same height)
    gutter(w + ov*2, 0, eaveY - gutH/2,   hd + ov + gutD/2);
    gutter(w + ov*2, 0, eaveY - gutH/2, -(hd + ov + gutD/2));
    // Downpipes at back-left and back-right corners
    downpipe(-(hw + ov), -(hd + ov + gutD/2), eaveY);
    downpipe(  hw + ov,  -(hd + ov + gutD/2), eaveY);
  }
}

// ─── MAIN BUILD ────────────────────────────────────────────────────────────────

function buildRoom() {
  while (buildingGroup.children.length) buildingGroup.remove(buildingGroup.children[0]);
  const w=state.width, d=state.depth, h=state.height, hw=w/2, hd=d/2;
  const wallMat = makeWallMat(w,h);

  box(w+0.3,0.12,d+0.3,0,0.06,0,slabMat); box(w,0.06,d,0,0.15,0,floorMat);

  const wallOps = { front:[], back:[], left:[], right:[] };
  state.openings.forEach(op => wallOps[op.wall].push(opToDescriptor(op)));

  // Flat roof tilt: front wall (+Z) is HIGH, back wall (-Z) is LOW
  const flatTiltRad   = (state.roof==='flat') ? ((state.roofTilt||0)*Math.PI/180) : 0;
  const wallTiltRise  = Math.tan(flatTiltRad) * hd;   // rise at wall face z=±hd
  const frontH = h + wallTiltRise;
  const backH  = h - wallTiltRise;

  buildWallFace('front', w, frontH, wallOps.front, wallMat, hw, hd);
  buildWallFace('back',  w, backH,  wallOps.back,  wallMat, hw, hd);
  // Side walls: rectangle up to backH, plus triangle wedge on top if tilted
  buildWallFace('left',  d, backH, wallOps.left,  wallMat, hw, hd);
  buildWallFace('right', d, backH, wallOps.right, wallMat, hw, hd);
  if (wallTiltRise > 0.005) {
    addSideWedge('left',  backH, frontH, wallMat, hw, hd);
    addSideWedge('right', backH, frontH, wallMat, hw, hd);
  }

  // Corner posts — variable height per corner
  [[-hw,-hd,backH],[hw,-hd,backH],[-hw,hd,frontH],[hw,hd,frontH]]
    .forEach(([x,z,ph])=>box(0.1, ph, 0.1, x, 0.18+ph/2, z, getFrameMat()));

  buildRoof(w,d,h,hw,hd);

  if (state.extras.decking && state.deckingArea>0) {
    const da=state.deckingArea,dw=Math.min(w*1.5,Math.sqrt(da*(w/Math.max(w,3))*2)),dd=da/dw;
    box(dw,0.07,dd,0,0.18,hd+dd/2+0.02,deckMat);
    for(let i=0;i<Math.floor(dd/0.14);i++) box(dw,0.015,0.11,0,0.22,hd+i*0.14+0.09,boardMat);
  }

  rebuildHandles();
  rebuildWallArrows();
}

// ─── HANDLES ───────────────────────────────────────────────────────────────────

function rebuildHandles() {
  while (handlesGroup.children.length) handlesGroup.remove(handlesGroup.children[0]);
  const hw=state.width/2, hd=state.depth/2;
  state.openings.forEach(op => {
    const desc = opToDescriptor(op);
    const wc   = localToWorld(op.wall, desc.localCx, desc.localCy, hw, hd);
    const color = op.type==='door' ? HANDLE_DOOR_COLOR : HANDLE_WIN_COLOR;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,0.05,20), new THREE.MeshLambertMaterial({color}));
    disc.userData = { openingId: op.id, baseColor: color };
    const proud=0.09;
    disc.position.set(wc.x, wc.y, wc.z);
    switch(op.wall){
      case 'front': disc.rotation.x=Math.PI/2; disc.position.z+=proud; break;
      case 'back':  disc.rotation.x=Math.PI/2; disc.position.z-=proud; break;
      case 'left':  disc.rotation.z=Math.PI/2; disc.position.x-=proud; break;
      case 'right': disc.rotation.z=Math.PI/2; disc.position.x+=proud; break;
    }
    const inner=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.13,0.052,20), new THREE.MeshLambertMaterial({color: op.type==='door'?0xb45309:0x0369a1}));
    disc.add(inner);
    handlesGroup.add(disc);
  });
  refreshHandleColors();
}

// ─── WALL DIMENSION ARROWS (architectural style) ──────────────────────────────

function ensureWallLabels() {
  if (wallLabels.width) return;
  const vp = document.querySelector('.viewport');
  if (!vp) return;
  ['width','depth','height'].forEach(dim => {
    const d = document.createElement('div');
    d.style.cssText = [
      'position:absolute', 'pointer-events:none',
      'padding:3px 9px',
      'background:rgba(20,20,20,0.78)',
      'color:#fff',
      'border-radius:5px',
      'font-size:12px',
      'font-weight:600',
      'font-family:DM Sans,sans-serif',
      'white-space:nowrap',
      'transform:translate(-50%,-50%)',
      'display:none',
      'letter-spacing:0.03em',
    ].join(';');
    vp.appendChild(d);
    wallLabels[dim] = d;
  });
}

// ── DIMENSION ARROW HELPERS ───────────────────────────────────────────────────

const DIM_MAT = new THREE.MeshBasicMaterial({
  color: 0x333333, transparent: true, opacity: 0.88,
  side: THREE.DoubleSide, depthTest: false,
});

// Thin flat strip lying in the XZ plane, centred at origin, pointing along +X
function dimLine(length) {
  const g = new THREE.PlaneGeometry(length, 0.018);
  g.rotateX(-Math.PI / 2);
  return new THREE.Mesh(g, DIM_MAT);
}

// Small filled dot (disc) lying in XZ plane
function dimDot(r) {
  const g = new THREE.CircleGeometry(r, 14);
  g.rotateX(-Math.PI / 2);
  return new THREE.Mesh(g, DIM_MAT);
}

// Open chevron arrowhead pointing +X, flat in XZ plane
// Uses two thin strips at ±30° from axis
function dimChevronH() {
  const len = 0.28, w = 0.016, ang = Math.PI / 6;
  const grp = new THREE.Group();
  [1, -1].forEach(sign => {
    const strip = new THREE.PlaneGeometry(len, w);
    strip.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(strip, DIM_MAT);
    m.position.x = Math.cos(ang) * len / 2;
    m.position.z = sign * Math.sin(ang) * len / 2;
    m.rotation.y = sign * ang;
    grp.add(m);
  });
  return grp;
}

// Open chevron arrowhead pointing +Y (vertical)
function dimChevronV() {
  const len = 0.28, w = 0.016, ang = Math.PI / 6;
  const grp = new THREE.Group();
  [1, -1].forEach(sign => {
    const strip = new THREE.PlaneGeometry(w, len);
    const m = new THREE.Mesh(strip, DIM_MAT);
    m.position.y = Math.cos(ang) * len / 2;
    m.position.x = sign * Math.sin(ang) * len / 2;
    m.rotation.z = -sign * ang;
    grp.add(m);
  });
  return grp;
}

// Extension line: short perpendicular stub from wall corner to dim line
function dimExtH(extLen) {
  const g = new THREE.PlaneGeometry(0.018, extLen);
  g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2);
  return new THREE.Mesh(g, DIM_MAT);
}

/**
 * Full horizontal dimension indicator, spans `length` along +X,
 * at y=y0, offset from wall by `offZ` in local Z.
 * wallGap = distance from wall surface to the extension line start.
 */
function makeDimGroupH(length, wallGap, extLen) {
  const g = new THREE.Group();
  const half = length / 2;

  // Main dimension line
  const l = dimLine(length); g.add(l);

  // Chevron arrowheads
  const chL = dimChevronH(); chL.position.x = -half; chL.rotation.y = Math.PI; g.add(chL);
  const chR = dimChevronH(); chR.position.x =  half; g.add(chR);

  // End dots
  [-half, half].forEach(x => {
    const d = dimDot(0.055); d.position.x = x; g.add(d);
  });

  // Extension lines at both ends (in local Z, from wall edge out to dim line)
  [-half, half].forEach(x => {
    const ext = dimExtH(extLen);
    ext.position.x = x;
    ext.position.z = -(wallGap + extLen / 2); // reaches from wall surface to dim line
    g.add(ext);
  });

  // Wide invisible hit plane
  const hitG = new THREE.PlaneGeometry(length + 1.0, 0.7);
  hitG.rotateX(-Math.PI / 2);
  const hitM = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide });
  const hit = new THREE.Mesh(hitG, hitM); hit.userData.isHitBox = true; g.add(hit);

  return g;
}

/**
 * Full vertical dimension indicator, spans `length` along +Y,
 * centred at origin.
 */
function makeDimGroupV(length) {
  const g = new THREE.Group();
  const half = length / 2;

  // Main line
  const lineG = new THREE.PlaneGeometry(0.018, length);
  const line = new THREE.Mesh(lineG, DIM_MAT); g.add(line);

  // Chevrons
  const chT = dimChevronV(); chT.position.y =  half; g.add(chT);
  const chB = dimChevronV(); chB.position.y = -half; chB.rotation.z = Math.PI; g.add(chB);

  // End dots
  [half, -half].forEach(y => { const d = dimDot(0.055); d.position.y = y; g.add(d); });

  // Hit plane facing Z
  const hitG = new THREE.PlaneGeometry(0.7, length + 1.0);
  const hitM = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide });
  const hit = new THREE.Mesh(hitG, hitM); hit.userData.isHitBox = true; g.add(hit);

  return g;
}

function rebuildWallArrows() {
  while (wallArrowGroup.children.length) wallArrowGroup.remove(wallArrowGroup.children[0]);
  ensureWallLabels();
  const hw = state.width / 2, hd = state.depth / 2;
  const y0 = 0.12;
  const dimOff = 0.9;   // distance from wall face to dim line
  const extLen = 0.7;   // length of extension stubs

  // ── Width: spans along X, positioned in front (+Z side) ──
  const wArr = makeDimGroupH(state.width, dimOff, extLen);
  wArr.position.set(0, y0, hd + dimOff);
  wArr.userData = { isWallArrow: true, dimension: 'width' };
  wallArrowGroup.add(wArr);

  // ── Depth: spans along Z (via Y rotation), positioned on right (+X side) ──
  const dArr = makeDimGroupH(state.depth, dimOff, extLen);
  dArr.rotation.y = Math.PI / 2;
  dArr.position.set(hw + dimOff, y0, 0);
  dArr.userData = { isWallArrow: true, dimension: 'depth' };
  wallArrowGroup.add(dArr);

  // ── Height: vertical, at front-right corner ──
  const hArr = makeDimGroupV(state.height);
  hArr.position.set(hw + 1.1, 0.18 + state.height / 2, hd + 0.3);
  hArr.userData = { isWallArrow: true, dimension: 'height' };
  wallArrowGroup.add(hArr);
}

function raycastWallArrows(e) {
  raycaster.setFromCamera(getMouseNDC(e), camera);
  // Deep=true to hit hit-box meshes inside groups
  const hits = raycaster.intersectObjects(wallArrowGroup.children, true);
  if (!hits.length) return null;
  // Walk up to find the group with isWallArrow
  let obj = hits[0].object;
  while (obj && !obj.userData.isWallArrow) obj = obj.parent;
  return (obj && obj.userData.isWallArrow) ? obj : null;
}

function raycastGround(e) {
  raycaster.setFromCamera(getMouseNDC(e), camera);
  const plane = new THREE.Plane(new THREE.Vector3(0,1,0), -0.22);
  const target = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, target) ? target : null;
}

function updateWallLabels() {
  if (!wallLabels.width) return;
  const vp = document.querySelector('.viewport');
  if (!vp) return;
  const vr = vp.getBoundingClientRect();
  const hw=state.width/2, hd=state.depth/2;
  const labelData = [
    { key:'width',  pos: new THREE.Vector3(0,       0.55, hd+1.7),                  text: state.width.toFixed(1)+'m'  },
    { key:'depth',  pos: new THREE.Vector3(hw+1.7,  0.55, 0),                       text: state.depth.toFixed(1)+'m'  },
    { key:'height', pos: new THREE.Vector3(hw+1.1,  0.22+state.height*0.5, hd+0.9), text: state.height.toFixed(1)+'m' },
  ];
  labelData.forEach(({ key, pos, text }) => {
    const div = wallLabels[key];
    if (!div) return;
    const v = pos.clone().project(camera);
    if (v.z >= 1) { div.style.display='none'; return; }
    div.style.display = 'block';
    div.style.left = ((v.x*0.5+0.5)*vr.width)+'px';
    div.style.top  = ((-v.y*0.5+0.5)*vr.height)+'px';
    div.textContent = text;
  });
}

function syncDimensionUI() {
  // Sliders removed — wall arrows + labels are the dimension UI
  rebuildWallArrows();
}

// ─── RAYCASTING ────────────────────────────────────────────────────────────────

const raycaster = new THREE.Raycaster();

function getMouseNDC(e) {
  const r=canvas.getBoundingClientRect();
  return new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1, ((e.clientY-r.top)/r.height)*-2+1);
}

function raycastHandles(e) {
  raycaster.setFromCamera(getMouseNDC(e), camera);
  const hits = raycaster.intersectObjects(handlesGroup.children, true);
  if (!hits.length) return null;
  let obj=hits[0].object;
  while(obj && !obj.userData.openingId) obj=obj.parent;
  return obj ? { openingId: obj.userData.openingId, handleMesh: obj } : null;
}

function raycastWall(e) {
  const w=state.width,d=state.depth,h=state.height,hw=w/2,hd=d/2;
  raycaster.setFromCamera(getMouseNDC(e), camera);
  const ray=raycaster.ray;
  const walls=[
    {id:'front',normal:new THREE.Vector3(0,0,1),dist:hd,wallW:w},
    {id:'back', normal:new THREE.Vector3(0,0,-1),dist:hd,wallW:w},
    {id:'left', normal:new THREE.Vector3(-1,0,0),dist:hw,wallW:d},
    {id:'right',normal:new THREE.Vector3(1,0,0), dist:hw,wallW:d},
  ];
  let best=null,bestDist=Infinity;
  walls.forEach(({id,normal,dist,wallW})=>{
    if(ray.direction.dot(normal)>=0) return;
    const plane=new THREE.Plane(normal,-dist);
    const target=new THREE.Vector3();
    if(!ray.intersectPlane(plane,target)) return;
    const inBounds=(id==='left'||id==='right')
      ?(Math.abs(target.z)<=hd+0.01 && target.y>=0.17 && target.y<=0.18+h+0.01)
      :(Math.abs(target.x)<=hw+0.01 && target.y>=0.17 && target.y<=0.18+h+0.01);
    if(!inBounds) return;
    const d2=ray.origin.distanceTo(target);
    if(d2<bestDist){bestDist=d2;best={wallId:id,localX:worldToLocalX(id,target,hw,hd),wallW};}
  });
  return best;
}

// ─── INTERACTION STATE ─────────────────────────────────────────────────────────

let activePaletteType = null;
let dragState         = null;
let hoveredHandleId   = null;
let selectedHandleId  = null;

function refreshHandleColors() {
  handlesGroup.children.forEach(disc => {
    const id=disc.userData.openingId;
    let color=disc.userData.baseColor;
    if(id===selectedHandleId) color=HANDLE_SEL_COLOR;
    else if(id===hoveredHandleId) color=HANDLE_HOVER_COLOR;
    disc.material.color.setHex(color);
    // Scale up slightly on select/hover for visual feedback
    const s = (id===selectedHandleId||id===hoveredHandleId) ? 1.18 : 1.0;
    disc.scale.setScalar(s);
  });
}

function setActivePalette(type) {
  activePaletteType = type;
  canvas.style.cursor = type ? 'crosshair' : 'default';
  selectedHandleId = null;
  refreshHandleColors();
  if (typeof updatePaletteUI === 'function') updatePaletteUI();
  if (typeof renderSelectedOpening === 'function') renderSelectedOpening();
}

function selectHandle(id) {
  selectedHandleId = id;
  activePaletteType = null;
  if (typeof updatePaletteUI === 'function') updatePaletteUI();
  refreshHandleColors();
  if (typeof renderSelectedOpening === 'function') renderSelectedOpening();
}

// ─── PLACEMENT & DELETION ──────────────────────────────────────────────────────

function placeOpening(type, wallId, localX) {
  const style = type === 'door' ? state.defaultDoor : state.defaultWindow;
  const ww    = wallWidth(wallId);
  const ow    = type === 'door' ? DOOR[style].widthM : WINDOW_MODEL[style].naturalW;

  // Clamp to wall edges first
  const clampedCx = Math.max(ow/2 + MIN_EDGE_GAP, Math.min(ww - ow/2 - MIN_EDGE_GAP, localX));

  // Find a non-overlapping position near cursor
  const validCx = findValidPosition(type, style, wallId, clampedCx);
  if (validCx === null) {
    showPlacementError('Not enough space on that wall.');
    return;
  }

  const offset = validCx - ww / 2;
  const id = state.nextOpeningId++;
  state.openings.push({ id, type, wall: wallId, offset, style });
  selectHandle(id);
  buildRoom();
  updatePriceDisplay();
  renderOpeningsList();
}

function deleteOpening(id) {
  state.openings = state.openings.filter(o => o.id !== id);
  if (selectedHandleId === id) { selectedHandleId = null; if(typeof renderSelectedOpening==='function') renderSelectedOpening(); }
  if (hoveredHandleId  === id) hoveredHandleId = null;
  buildRoom();
  updatePriceDisplay();
  renderOpeningsList();
  if(typeof updatePaletteUI==='function') updatePaletteUI();
}

function changeOpeningStyle(id, newStyle) {
  const op = state.openings.find(o => o.id === id);
  if (!op) return;
  op.style = newStyle;
  // Re-clamp offset for the new size
  const ww = wallWidth(op.wall);
  const ow = openingW(op);
  op.offset = clampOffset(op.offset, ww, ow);
  // Check that new size doesn't now overlap something
  const newCx = ww/2 + op.offset;
  if (wouldOverlap(op.type, newStyle, op.wall, newCx, id)) {
    const validCx = findValidPosition(op.type, newStyle, op.wall, newCx, id);
    if (validCx !== null) op.offset = validCx - ww/2;
  }
  buildRoom();
  updatePriceDisplay();
  renderOpeningsList();
}

function showPlacementError(msg) {
  const el = document.getElementById('placementError');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.display='none'; }, 2500);
}

// ─── MOUSE EVENTS ──────────────────────────────────────────────────────────────

let orbitActive=false, panActive=false, prevMouseX=0, prevMouseY=0;
let wallArrowDragState = null;
let wallArrowHover = null;
let orbitTheta=0.45, orbitPhi=0.88, orbitRadius=14;
const orbitTarget = new THREE.Vector3(0, 1.5, 0);

function updateCamera() {
  camera.position.set(
    orbitTarget.x + orbitRadius*Math.sin(orbitPhi)*Math.sin(orbitTheta),
    orbitTarget.y + orbitRadius*Math.cos(orbitPhi),
    orbitTarget.z + orbitRadius*Math.sin(orbitPhi)*Math.cos(orbitTheta)
  );
  camera.lookAt(orbitTarget);
}

canvas.addEventListener('mousedown', e => {
  e.preventDefault();

  // 0. Wall dimension arrow → resize drag
  const rHit = raycastWallArrows(e);
  if (rHit) {
    wallArrowDragState = { dimension: rHit.userData.dimension, lastX: e.clientX, lastY: e.clientY };
    const dim = rHit.userData.dimension;
    canvas.style.cursor = dim === 'height' ? 'ns-resize' : 'ew-resize';
    return;
  }

  // 1. Hit an opening handle → drag or select
  const hit = raycastHandles(e);
  if (hit) {
    const op = state.openings.find(o => o.id === hit.openingId);
    if (!op) return;
    selectHandle(op.id);
    const ww = wallWidth(op.wall);
    dragState = { openingId: op.id, wall: op.wall, wallW: ww };
    canvas.style.cursor = 'grabbing';
    return;
  }

  // 2. Palette active → place on wall
  if (activePaletteType) {
    const wh = raycastWall(e);
    if (wh) placeOpening(activePaletteType, wh.wallId, wh.localX);
    return;
  }

  // 3. Shift+drag → pan camera
  if (e.shiftKey) {
    panActive = true; prevMouseX = e.clientX; prevMouseY = e.clientY;
    canvas.style.cursor = 'move';
    return;
  }

  // 4. Click empty space → deselect + orbit
  selectedHandleId = null;
  refreshHandleColors();
  if (typeof renderSelectedOpening === 'function') renderSelectedOpening();
  orbitActive=true; prevMouseX=e.clientX; prevMouseY=e.clientY;
});

canvas.addEventListener('dblclick', e => {
  if (!dragState && !wallArrowDragState) {
    orbitTarget.set(0, 1.5, 0);
    orbitTheta=0.45; orbitPhi=0.88; orbitRadius=14;
    updateCamera();
  }
});

window.addEventListener('mouseup', () => {
  orbitActive = false;
  panActive = false;
  if (wallArrowDragState) {
    wallArrowDragState = null;
    canvas.style.cursor = activePaletteType ? 'crosshair' : (hoveredHandleId ? 'grab' : 'default');
  }
  if (dragState) {
    dragState = null;
    canvas.style.cursor = activePaletteType ? 'crosshair' : (hoveredHandleId ? 'grab' : 'default');
  }
});

window.addEventListener('mousemove', e => {
  // Wall dimension arrow drag
  if (wallArrowDragState) {
    const { dimension } = wallArrowDragState;
    if (dimension === 'width') {
      const g = raycastGround(e);
      if (g) state.width = Math.round(Math.max(2, Math.min(10, Math.abs(g.x)*2)) * 4) / 4;
    } else if (dimension === 'depth') {
      const g = raycastGround(e);
      if (g) state.depth = Math.round(Math.max(2, Math.min(8, Math.abs(g.z)*2)) * 4) / 4;
    } else {
      const dy = e.clientY - wallArrowDragState.lastY;
      wallArrowDragState.lastY = e.clientY;
      state.height = Math.round(Math.max(2.2, Math.min(3.5, state.height - dy*0.008)) * 10) / 10;
    }
    buildRoom();
    if (typeof updatePriceDisplay === 'function') updatePriceDisplay();
    return;
  }

  // Pan camera (shift+drag)
  if (panActive) {
    const dx = e.clientX - prevMouseX;
    const dy = e.clientY - prevMouseY;
    prevMouseX = e.clientX; prevMouseY = e.clientY;
    const right = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    right.crossVectors(camDir, new THREE.Vector3(0,1,0)).normalize();
    const sp = orbitRadius * 0.001;
    orbitTarget.addScaledVector(right, -dx * sp);
    orbitTarget.y += dy * sp;
    updateCamera();
    return;
  }

  if (dragState) {
    const wh = raycastWall(e);
    if (!wh || wh.wallId !== dragState.wall) return;
    const op = state.openings.find(o => o.id === dragState.openingId);
    if (!op) return;

    const targetCx = wh.localX;
    const validCx  = findValidPosition(op.type, op.style, op.wall, targetCx, op.id);
    if (validCx === null) return;   // no room anywhere — don't move
    op.offset = validCx - dragState.wallW / 2;

    buildRoom();
    updatePriceDisplay();
    renderOpeningsList();
    if (typeof renderSelectedOpening === 'function') renderSelectedOpening();
    return;
  }

  if (orbitActive) {
    orbitTheta -= (e.clientX-prevMouseX)*0.008;
    orbitPhi    = Math.max(0.05, Math.min(1.4, orbitPhi-(e.clientY-prevMouseY)*0.008));
    prevMouseX=e.clientX; prevMouseY=e.clientY;
    updateCamera(); return;
  }

  // Wall arrow hover
  if (!activePaletteType && !dragState && !wallArrowDragState) {
    const rh = raycastWallArrows(e);
    if (rh !== wallArrowHover) {
      if (wallArrowHover) wallArrowHover.material.opacity = 0.72;
      wallArrowHover = rh;
      if (wallArrowHover) {
        wallArrowHover.material.opacity = 1.0;
        const dim = wallArrowHover.userData.dimension;
        canvas.style.cursor = dim === 'height' ? 'ns-resize' : 'ew-resize';
        showResizeTooltip(dim, e);
      } else {
        hideResizeTooltip();
      }
    } else if (!rh && !wallArrowHover) {
      hideResizeTooltip();
    }
  }

  const hh = raycastHandles(e);
  const newId = hh ? hh.openingId : null;
  if (newId !== hoveredHandleId) {
    hoveredHandleId = newId;
    refreshHandleColors();
    if (!wallArrowHover) {
      canvas.style.cursor = activePaletteType ? 'crosshair' : (hoveredHandleId ? 'grab' : 'default');
    }
  }
});

function showResizeTooltip(dim, e) {
  let el = document.getElementById('resizeTooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'resizeTooltip';
    el.style.cssText = 'position:fixed;background:rgba(0,0,0,0.75);color:#fff;font-size:12px;padding:5px 10px;border-radius:6px;pointer-events:none;z-index:50;font-family:DM Sans,sans-serif;white-space:nowrap;';
    document.body.appendChild(el);
  }
  const labels = { width: '↔ Width', depth: '↕ Depth', height: '↑ Height' };
  el.textContent = labels[dim] || dim;
  el.style.left = (e.clientX + 14) + 'px';
  el.style.top  = (e.clientY - 10) + 'px';
  el.style.display = 'block';
}
function hideResizeTooltip() {
  const el = document.getElementById('resizeTooltip');
  if (el) el.style.display = 'none';
}

canvas.addEventListener('contextmenu', e => { e.preventDefault(); const h=raycastHandles(e); if(h) deleteOpening(h.openingId); });

window.addEventListener('keydown', e => {
  if (e.key==='Delete'||e.key==='Backspace') {
    if (document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA') return;
    if (selectedHandleId!==null) deleteOpening(selectedHandleId);
  }
  if (e.key==='Escape') { setActivePalette(null); if(typeof updatePaletteUI==='function') updatePaletteUI(); }
});

canvas.addEventListener('wheel', e => { orbitRadius=Math.max(4,Math.min(30,orbitRadius+e.deltaY*0.02)); updateCamera(); e.preventDefault(); }, {passive:false});

// ─── TOUCH CONTROLS ────────────────────────────────────────────────────────────

let touchState = null;
// touchState types: 'orbit', 'pinch', 'handle', 'arrow'

function getTouchNDC(touch) {
  const r = canvas.getBoundingClientRect();
  return new THREE.Vector2(
    ((touch.clientX - r.left) / r.width)  *  2 - 1,
    ((touch.clientY - r.top)  / r.height) * -2 + 1
  );
}

function pinchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx*dx + dy*dy);
}

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t0 = e.touches[0];

  if (e.touches.length === 2) {
    // Two-finger: cancel any single-touch state, start pinch/pan
    touchState = {
      type: 'pinch',
      lastDist: pinchDist(e.touches),
      lastMidX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
      lastMidY: (e.touches[0].clientY + e.touches[1].clientY) / 2,
    };
    return;
  }

  // Single touch — check for arrow hit first
  const fakeEvent = { clientX: t0.clientX, clientY: t0.clientY };
  const arrowHit = raycastWallArrows(fakeEvent);
  if (arrowHit) {
    touchState = {
      type: 'arrow',
      dimension: arrowHit.userData.dimension,
      lastX: t0.clientX, lastY: t0.clientY,
    };
    return;
  }

  // Check for opening handle
  const handleHit = raycastHandles(fakeEvent);
  if (handleHit) {
    const op = state.openings.find(o => o.id === handleHit.openingId);
    if (op) {
      selectHandle(op.id);
      touchState = {
        type: 'handle',
        openingId: op.id,
        wall: op.wall,
        wallW: wallWidth(op.wall),
      };
      return;
    }
  }

  // Default: orbit
  touchState = { type: 'orbit', lastX: t0.clientX, lastY: t0.clientY };
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!touchState) return;

  if (e.touches.length === 2 && touchState.type !== 'arrow' && touchState.type !== 'handle') {
    // Pinch to zoom + two-finger pan
    const dist = pinchDist(e.touches);
    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

    if (touchState.type === 'pinch') {
      const scale = touchState.lastDist / dist;
      orbitRadius = Math.max(4, Math.min(30, orbitRadius * scale));

      // Two-finger pan
      const dx = midX - touchState.lastMidX;
      const dy = midY - touchState.lastMidY;
      const right = new THREE.Vector3();
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      right.crossVectors(camDir, new THREE.Vector3(0,1,0)).normalize();
      const sp = orbitRadius * 0.0012;
      orbitTarget.addScaledVector(right, -dx * sp);
      orbitTarget.y += dy * sp;
    }
    touchState.lastDist = dist;
    touchState.lastMidX = midX;
    touchState.lastMidY = midY;
    updateCamera();
    return;
  }

  const t0 = e.touches[0];

  if (touchState.type === 'arrow') {
    const fakeEvent = { clientX: t0.clientX, clientY: t0.clientY };
    const { dimension } = touchState;
    if (dimension === 'width' || dimension === 'depth') {
      const g = raycastGround(fakeEvent);
      if (g) {
        if (dimension === 'width')
          state.width = Math.round(Math.max(2, Math.min(10, Math.abs(g.x)*2)) * 4) / 4;
        else
          state.depth = Math.round(Math.max(2, Math.min(8,  Math.abs(g.z)*2)) * 4) / 4;
      }
    } else {
      // height: vertical drag
      const dy = t0.clientY - touchState.lastY;
      state.height = Math.round(Math.max(2.2, Math.min(3.5, state.height - dy*0.006)) * 10) / 10;
      touchState.lastY = t0.clientY;
    }
    buildRoom();
    if (typeof updatePriceDisplay === 'function') updatePriceDisplay();
    return;
  }

  if (touchState.type === 'handle') {
    const fakeEvent = { clientX: t0.clientX, clientY: t0.clientY };
    const wh = raycastWall(fakeEvent);
    if (!wh || wh.wallId !== touchState.wall) return;
    const op = state.openings.find(o => o.id === touchState.openingId);
    if (!op) return;
    const validCx = findValidPosition(op.type, op.style, op.wall, wh.localX, op.id);
    if (validCx === null) return;
    op.offset = validCx - touchState.wallW / 2;
    buildRoom(); updatePriceDisplay(); renderOpeningsList();
    if (typeof renderSelectedOpening === 'function') renderSelectedOpening();
    return;
  }

  if (touchState.type === 'orbit') {
    const dx = t0.clientX - touchState.lastX;
    const dy = t0.clientY - touchState.lastY;
    orbitTheta -= dx * 0.010;
    orbitPhi = Math.max(0.05, Math.min(1.4, orbitPhi - dy * 0.010));
    touchState.lastX = t0.clientX;
    touchState.lastY = t0.clientY;
    updateCamera();
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  if (e.touches.length === 0) touchState = null;
  else if (e.touches.length === 1 && touchState?.type === 'pinch') {
    // Dropped to one finger — switch to orbit
    touchState = { type: 'orbit', lastX: e.touches[0].clientX, lastY: e.touches[0].clientY };
  }
});

function setView(preset) {
  const v={front:[0,0.7,15],side:[Math.PI/2,0.7,15],top:[0,0.05,18],isometric:[0.45,0.88,14]}[preset];
  if(v){[orbitTheta,orbitPhi,orbitRadius]=v;} updateCamera();
}

updateCamera();

function onResize() {
  const vp=document.querySelector('.viewport');
  renderer.setSize(vp.clientWidth,vp.clientHeight);
  camera.aspect=vp.clientWidth/vp.clientHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize',onResize); onResize();
(function loop(){requestAnimationFrame(loop);renderer.render(scene,camera);updateWallLabels();})();

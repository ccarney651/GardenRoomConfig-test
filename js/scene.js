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

const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: 0x7aad6a }));
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
    rp(w+ov*2, panelD, 0, roofY+pT/2, 0);
    const fH=0.25, fY=roofY-fH/2+pT;
    fa(w+ov*2+0.05,fH,0.06, 0,fY,-(hd+ov)); fa(w+ov*2+0.05,fH,0.06, 0,fY,hd+ov);
    fa(0.06,fH,d+ov*2, -(hw+ov),fY,0);      fa(0.06,fH,d+ov*2, hw+ov,fY,0);
    if (state.extras.lantern) {
      const lw=w*0.38,ld=d*0.38,ly=roofY+pT;
      rp(lw+0.1,ld+0.1,0,ly+0.08,0);
      const lg=new THREE.Mesh(new THREE.BoxGeometry(lw,0.55,ld),new THREE.MeshPhongMaterial({color:0xd0ecff,transparent:true,opacity:0.45,shininess:120}));
      lg.position.set(0,ly+0.435,0); buildingGroup.add(lg);
      rp(lw+0.08,ld+0.08,0,ly+0.72,0);
    }
  } else if (state.roof === 'apex') {
    const rh=1.0,span=hw+ov,slope=Math.sqrt(span*span+rh*rh),angle=Math.atan2(rh,span);
    rp(slope,panelD,-span/2,roofY+rh/2,0,angle); rp(slope,panelD,span/2,roofY+rh/2,0,-angle);
    const ridge=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.12,panelD),getFrameMat()); ridge.position.set(0,roofY+rh+0.04,0); buildingGroup.add(ridge);
    const wm2=makeWallMat(w,h);
    [hd+ov,-(hd+ov)].forEach((zPos,i)=>{const shape=new THREE.Shape();shape.moveTo(-span,0);shape.lineTo(0,rh);shape.lineTo(span,0);shape.lineTo(-span,0);const g=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:0.08,bevelEnabled:false}),wm2);g.position.set(0,roofY,zPos);g.rotation.y=i===0?0:Math.PI;g.castShadow=true;buildingGroup.add(g);});
    const vMat=new THREE.MeshLambertMaterial({color:0x2a2a2a});
    [-(hd+ov+0.01),hd+ov+0.01].forEach(zPos=>{[-1,1].forEach(side=>{const v=new THREE.Mesh(new THREE.BoxGeometry(slope+0.06,0.06,0.05),vMat);v.position.set(side*span/2,roofY+rh/2,zPos);v.rotation.z=-side*angle;buildingGroup.add(v);});});
  } else if (state.roof === 'lean') {
    const hE=0.85,lE=0.1,rise=hE-lE,spanD=w+ov*2,slope=Math.sqrt(spanD*spanD+rise*rise),angle=Math.atan2(rise,spanD);
    const panel=new THREE.Mesh(new THREE.BoxGeometry(spanD,pT,slope),rMat); panel.position.set(0,roofY+(hE+lE)/2,0); panel.rotation.x=angle; panel.castShadow=true; buildingGroup.add(panel);
    const eY=roofY+lE; fa(spanD+0.05,0.22,0.06,0,eY-0.11,-(hd+ov)); fa(0.06,0.22,d+ov*2,-(hw+ov),eY-0.11,0); fa(0.06,0.22,d+ov*2,hw+ov,eY-0.11,0);
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

  buildWallFace('front',w,h,wallOps.front,wallMat,hw,hd);
  buildWallFace('back', w,h,wallOps.back, wallMat,hw,hd);
  buildWallFace('left', d,h,wallOps.left, wallMat,hw,hd);
  buildWallFace('right',d,h,wallOps.right,wallMat,hw,hd);

  [[-hw,-hd],[hw,-hd],[-hw,hd],[hw,hd]].forEach(([x,z])=>box(0.1,h,0.1,x,0.18+h/2,z, getFrameMat()));
  buildRoof(w,d,h,hw,hd);

  if (state.extras.decking && state.deckingArea>0) {
    const da=state.deckingArea,dw=Math.min(w*1.5,Math.sqrt(da*(w/Math.max(w,3))*2)),dd=da/dw;
    box(dw,0.07,dd,0,0.18,hd+dd/2+0.02,deckMat);
    for(let i=0;i<Math.floor(dd/0.14);i++) box(dw,0.015,0.11,0,0.22,hd+i*0.14+0.09,boardMat);
  }

  rebuildHandles();
}

// ─── HANDLES ───────────────────────────────────────────────────────────────────

function rebuildHandles() {
  while (handlesGroup.children.length) handlesGroup.remove(handlesGroup.children[0]);
  const hw=state.width/2, hd=state.depth/2;
  state.openings.forEach(op => {
    const desc = opToDescriptor(op);
    const wc   = localToWorld(op.wall, desc.localCx, desc.localCy, hw, hd);
    const color = op.type==='door' ? HANDLE_DOOR_COLOR : HANDLE_WIN_COLOR;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.18,0.045,20), new THREE.MeshLambertMaterial({color}));
    disc.userData = { openingId: op.id, baseColor: color };
    const proud=0.06;
    disc.position.set(wc.x, wc.y, wc.z);
    switch(op.wall){
      case 'front': disc.rotation.x=Math.PI/2; disc.position.z+=proud; break;
      case 'back':  disc.rotation.x=Math.PI/2; disc.position.z-=proud; break;
      case 'left':  disc.rotation.z=Math.PI/2; disc.position.x-=proud; break;
      case 'right': disc.rotation.z=Math.PI/2; disc.position.x+=proud; break;
    }
    const inner=new THREE.Mesh(new THREE.CylinderGeometry(0.10,0.10,0.048,20), new THREE.MeshLambertMaterial({color: op.type==='door'?0xb45309:0x0369a1}));
    disc.add(inner);
    handlesGroup.add(disc);
  });
  refreshHandleColors();
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

let orbitActive=false, prevMouseX=0, prevMouseY=0;
let orbitTheta=0.6, orbitPhi=0.5, orbitRadius=15;
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

  // 1. Hit a handle → drag or select
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

  // 3. Click empty space → deselect + orbit
  selectedHandleId = null;
  refreshHandleColors();
  if (typeof renderSelectedOpening === 'function') renderSelectedOpening();
  orbitActive=true; prevMouseX=e.clientX; prevMouseY=e.clientY;
});

window.addEventListener('mouseup', () => {
  orbitActive = false;
  if (dragState) { dragState = null; canvas.style.cursor = activePaletteType ? 'crosshair' : (hoveredHandleId ? 'grab' : 'default'); }
});

window.addEventListener('mousemove', e => {
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

  const hh = raycastHandles(e);
  const newId = hh ? hh.openingId : null;
  if (newId !== hoveredHandleId) {
    hoveredHandleId = newId;
    refreshHandleColors();
    canvas.style.cursor = activePaletteType ? 'crosshair' : (hoveredHandleId ? 'grab' : 'default');
  }
});

canvas.addEventListener('contextmenu', e => { e.preventDefault(); const h=raycastHandles(e); if(h) deleteOpening(h.openingId); });

window.addEventListener('keydown', e => {
  if (e.key==='Delete'||e.key==='Backspace') {
    if (document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA') return;
    if (selectedHandleId!==null) deleteOpening(selectedHandleId);
  }
  if (e.key==='Escape') { setActivePalette(null); if(typeof updatePaletteUI==='function') updatePaletteUI(); }
});

canvas.addEventListener('wheel', e => { orbitRadius=Math.max(4,Math.min(30,orbitRadius+e.deltaY*0.02)); updateCamera(); e.preventDefault(); }, {passive:false});

let lTX=0,lTY=0;
canvas.addEventListener('touchstart', e=>{lTX=e.touches[0].clientX;lTY=e.touches[0].clientY;});
canvas.addEventListener('touchmove', e=>{
  orbitTheta-=(e.touches[0].clientX-lTX)*0.012;
  orbitPhi=Math.max(0.05,Math.min(1.4,orbitPhi-(e.touches[0].clientY-lTY)*0.012));
  lTX=e.touches[0].clientX;lTY=e.touches[0].clientY;
  updateCamera();e.preventDefault();
},{passive:false});

function setView(preset) {
  const v={front:[0,0.7,15],side:[Math.PI/2,0.7,15],top:[0,0.05,18],isometric:[0.6,0.5,15]}[preset];
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
(function loop(){requestAnimationFrame(loop);renderer.render(scene,camera);})();

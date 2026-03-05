/**
 * ui.js
 * UI interactions. Openings have per-instance styles; the type picker
 * operates on the selected opening (edit) or the placement default (new).
 */

// ─── PRICE DISPLAY ─────────────────────────────────────────────────────────────

function fmt(n) { return '£' + Math.round(n).toLocaleString('en-GB'); }

function updatePriceDisplay() {
  const total = calcTotal(state);
  document.getElementById('totalPrice').textContent = fmt(total);

  const floorArea = state.width * state.depth;
  const wallArea  = 2 * (state.width + state.depth) * state.height;
  document.getElementById('lbl-reinforceFloor').textContent   = `${fmt(Math.round(floorArea * REINFORCEMENT.floor.perSqm))} (£${REINFORCEMENT.floor.perSqm}/m²)`;
  document.getElementById('lbl-reinforceWalls').textContent   = `${fmt(Math.round(wallArea  * REINFORCEMENT.walls.perSqm))} (£${REINFORCEMENT.walls.perSqm}/m²)`;
  document.getElementById('lbl-reinforceCeiling').textContent = `${fmt(Math.round(floorArea * REINFORCEMENT.ceiling.perSqm))} (£${REINFORCEMENT.ceiling.perSqm}/m²)`;

  document.getElementById('spec-width').textContent  = state.width.toFixed(1)  + 'm';
  document.getElementById('spec-depth').textContent  = state.depth.toFixed(1)  + 'm';
  document.getElementById('spec-height').textContent = state.height.toFixed(1) + 'm';
  document.getElementById('spec-area').textContent   = (state.width * state.depth).toFixed(1) + 'm²';
  document.getElementById('spec-roof').textContent   = ROOF_STYLE[state.roof]?.label ?? '—';
  document.getElementById('spec-found').textContent  = FOUNDATION[state.foundation]?.label ?? '—';
}

// ─── DIMENSION SLIDERS ─────────────────────────────────────────────────────────

['width', 'depth', 'height'].forEach(dim => {
  document.getElementById(dim + 'Slider').addEventListener('input', function () {
    state[dim] = parseFloat(this.value);
    document.getElementById(dim + 'Val').textContent = state[dim].toFixed(1) + 'm';
    buildRoom(); updatePriceDisplay();
  });
});

// ─── OPTION BUTTONS (structure, roof, cladding — NOT doors/windows) ────────────

function selectOpt(key, value, btn) {
  state[key] = value;
  const grid = btn.closest('.option-grid');
  if (grid) grid.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  buildRoom(); updatePriceDisplay();
}

// ─── COLOUR SWATCHES ───────────────────────────────────────────────────────────

function selectCladdingTint(hex, el) {
  state.claddingTint = hex;
  document.querySelectorAll('#claddingSwatches .swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  buildRoom();
}

function selectFrameColour(hex, el) {
  state.frameColour = hex;
  document.querySelectorAll('#frameSwatches .swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  buildRoom();
}

// Legacy — keep in case anything else calls it
function selectColour(hex, el) { selectCladdingTint(hex, el); }

// ─── TOGGLE EXTRAS ─────────────────────────────────────────────────────────────

function toggleExtra(key, btn) {
  state.extras[key] = !state.extras[key];
  btn.classList.toggle('on');
  buildRoom(); updatePriceDisplay();
}

function toggleDecking(btn) {
  state.extras.decking = !state.extras.decking;
  btn.classList.toggle('on');
  document.getElementById('deckingSection').style.display = state.extras.decking ? 'block' : 'none';
  buildRoom(); updatePriceDisplay();
}

// ─── NUMBER INPUTS ─────────────────────────────────────────────────────────────

function updateNum(field, el) {
  const value = Math.max(0, parseInt(el.value) || 0);
  el.value = value;
  switch (field) {
    case 'ethernetPoints': state.ethernetPoints = value; break;
    case 'internalLights': state.internalLights = value; break;
    case 'externalLights': state.externalLights = value; break;
    case 'deckingArea':    state.deckingArea = Math.max(1, value); buildRoom(); break;
  }
  updatePriceDisplay();
}

// ─── VIEW PRESETS ──────────────────────────────────────────────────────────────

function setViewPreset(name) { setView(name); }

// ─── OPENINGS — TYPE PICKER ───────────────────────────────────────────────────
//
// The type picker is a single panel that shows in the Openings section.
// It adapts based on context:
//   • Palette active  → picks the default style for NEW placements
//   • Opening selected → picks that specific opening's style
//
// activePaletteType and selectedHandleId are owned by scene.js.

/** Called by palette buttons at top of Openings section */
function activatePalette(type) {
  // Toggle off if same type already active
  if (activePaletteType === type) {
    setActivePalette(null);
  } else {
    setActivePalette(type); // scene.js clears selectedHandleId
  }
  updatePaletteUI();
}

/** Called from scene.js whenever interaction state changes */
function updatePaletteUI() {
  // Palette buttons
  ['door', 'window'].forEach(t => {
    const btn = document.getElementById('palBtn-' + t);
    if (btn) btn.classList.toggle('active', activePaletteType === t);
  });

  const hint   = document.getElementById('paletteHint');
  const picker = document.getElementById('openingTypePicker');
  const label  = document.getElementById('typePickerLabel');
  const doorOpts = document.getElementById('doorTypeOptions');
  const winOpts  = document.getElementById('windowStyleOptions');

  // Determine what context we're in
  const selOp      = state.openings.find(o => o.id === selectedHandleId) ?? null;
  const showForSel = selOp !== null;
  const paletteType = activePaletteType; // 'door'|'window'|null

  const showDoor   = (paletteType === 'door')   || (showForSel && selOp.type === 'door');
  const showWindow = (paletteType === 'window')  || (showForSel && selOp.type === 'window');
  const showPicker = showDoor || showWindow;

  if (picker) {
    picker.style.display = showPicker ? 'block' : 'none';
    if (doorOpts) doorOpts.style.display = showDoor   ? 'block' : 'none';
    if (winOpts)  winOpts.style.display  = showWindow ? 'block' : 'none';
  }

  if (hint) hint.style.display = paletteType ? 'block' : 'none';

  if (label) {
    if (showForSel) {
      const wallName = { front:'Front', back:'Back', left:'Left', right:'Right' }[selOp.wall];
      label.textContent = selOp.type === 'door'
        ? `Edit ${wallName} door:`
        : `Edit ${wallName} window:`;
    } else if (paletteType === 'door') {
      label.textContent = 'New door type:';
    } else if (paletteType === 'window') {
      label.textContent = 'New window style:';
    }
  }

  // Highlight the active style button for this context
  const activeStyle = showForSel ? selOp.style
                    : (paletteType === 'door' ? state.defaultDoor : state.defaultWindow);

  if (showDoor) {
    ['single','double','bifold','sliding'].forEach(s => {
      const b = document.getElementById('dtBtn-' + s);
      if (b) b.classList.toggle('active', s === activeStyle);
    });
    const bifoldNote = document.getElementById('bifoldNote');
    if (bifoldNote) bifoldNote.style.display = activeStyle === 'bifold' ? 'block' : 'none';

    // Sync material picker
    const matPicker = document.getElementById('doorMaterialPicker');
    if (matPicker) {
      const mat = showForSel ? (selOp.material ?? state.defaultDoorMat) : state.defaultDoorMat;
      matPicker.value = mat;
    }
  }

  if (showWindow) {
    ['tilt','long','vert','horiz'].forEach(s => {
      const b = document.getElementById('wsBtn-' + s);
      if (b) b.classList.toggle('active', s === activeStyle);
    });
  }
}

/**
 * Called when a type button (door or window style) is clicked.
 * If an opening is selected: changes that opening's style.
 * Otherwise: updates the default for new placements.
 */
function setOpeningStyle(style) {
  const selOp = state.openings.find(o => o.id === selectedHandleId) ?? null;

  if (selOp) {
    changeOpeningStyle(selOp.id, style); // scene.js — rebuilds room
  } else {
    // Update placement default
    if (activePaletteType === 'door') {
      state.defaultDoor = style;
    } else if (activePaletteType === 'window') {
      state.defaultWindow = style;
    }
  }
  updatePaletteUI();
}

/** Handle door material change — applies to selected door or sets default */
function setOpeningMaterial(value) {
  const selOp = state.openings.find(o => o.id === selectedHandleId && o.type === 'door') ?? null;
  if (selOp) {
    selOp.material = value;
  } else {
    state.defaultDoorMat = value;
  }
  updatePriceDisplay();
}

/** Called from scene.js (and ui.js) to keep the list up to date */
function renderOpeningsList() {
  const el = document.getElementById('openingsList');
  if (!el) return;

  if (!state.openings.length) {
    el.innerHTML = '<p class="openings-empty">No openings placed yet.</p>';
    return;
  }

  const wallLabel = { front:'Front', back:'Back', left:'Left', right:'Right' };

  el.innerHTML = state.openings.map(op => {
    const icon = op.type === 'door' ? '🚪' : '🪟';

    // Use op.style (per-opening), not global state.door / state.windowStyle
    const styleLabel = op.type === 'door'
      ? (DOOR[op.style]?.label ?? op.style)
      : (WINDOW_STYLE[op.style]?.label ?? op.style);

    const off = op.offset === 0 ? 'centre'
      : (op.offset > 0 ? `+${op.offset.toFixed(2)}m` : `${op.offset.toFixed(2)}m`);

    const isSelected = op.id === selectedHandleId;

    return `<div class="opening-row${isSelected ? ' opening-row--selected' : ''}"
                 id="oprow-${op.id}"
                 onclick="selectOpeningFromList(${op.id})">
        <span class="opening-icon">${icon}</span>
        <div class="opening-info">
          <span class="opening-label">${wallLabel[op.wall]} wall</span>
          <span class="opening-sub">${styleLabel} · ${off}</span>
        </div>
        <button class="opening-del" onclick="event.stopPropagation(); deleteOpening(${op.id})" title="Remove">✕</button>
      </div>`;
  }).join('');
}

/** Click on a list row — select it in the 3D view and show its type picker */
function selectOpeningFromList(id) {
  selectHandle(id); // scene.js
  renderOpeningsList();
  updatePaletteUI();
  // Scroll type picker into view
  const picker = document.getElementById('openingTypePicker');
  if (picker) picker.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Called by scene.js after interactions change selectedHandleId */
function renderSelectedOpening() {
  renderOpeningsList();
  updatePaletteUI();
}

// ─── SHAREABLE URL ─────────────────────────────────────────────────────────────

/**
 * Serialise the current configuration to a base64 URL hash.
 * Only encodes the design choices (not transient interaction state).
 */
function encodeStateToHash() {
  const snapshot = {
    v: 1, // schema version — bump if state shape changes
    width:        state.width,
    depth:        state.depth,
    height:       state.height,
    foundation:   state.foundation,
    roof:         state.roof,
    roofFinish:   state.roofFinish,
    cladding:     state.cladding,
    claddingTint: state.claddingTint,
    frameColour:  state.frameColour,
    defaultDoor:    state.defaultDoor,
    defaultWindow:  state.defaultWindow,
    defaultDoorMat: state.defaultDoorMat,
    openings: state.openings.map(o => ({
      id: o.id, type: o.type, wall: o.wall,
      offset: Math.round(o.offset * 1000) / 1000,
      style: o.style,
      ...(o.material ? { material: o.material } : {}),
    })),
    nextOpeningId: state.nextOpeningId,
    extras:        { ...state.extras },
    ethernetPoints: state.ethernetPoints,
    internalLights: state.internalLights,
    externalLights: state.externalLights,
    deckingArea:    state.deckingArea,
  };
  return btoa(JSON.stringify(snapshot));
}

function decodeHashToState(hash) {
  try {
    const snap = JSON.parse(atob(hash));
    if (snap.v !== 1) return false;

    state.width        = snap.width        ?? state.width;
    state.depth        = snap.depth        ?? state.depth;
    state.height       = snap.height       ?? state.height;
    state.foundation   = snap.foundation   ?? state.foundation;
    state.roof         = snap.roof         ?? state.roof;
    state.roofFinish   = snap.roofFinish   ?? state.roofFinish;
    state.cladding     = snap.cladding     ?? state.cladding;
    state.claddingTint = snap.claddingTint ?? state.claddingTint;
    state.frameColour  = snap.frameColour  ?? state.frameColour;
    state.defaultDoor    = snap.defaultDoor    ?? state.defaultDoor;
    state.defaultWindow  = snap.defaultWindow  ?? state.defaultWindow;
    state.defaultDoorMat = snap.defaultDoorMat ?? state.defaultDoorMat;
    state.openings     = snap.openings     ?? state.openings;
    state.nextOpeningId = snap.nextOpeningId ?? state.nextOpeningId;
    Object.assign(state.extras, snap.extras ?? {});
    state.ethernetPoints = snap.ethernetPoints ?? state.ethernetPoints;
    state.internalLights = snap.internalLights ?? state.internalLights;
    state.externalLights = snap.externalLights ?? state.externalLights;
    state.deckingArea    = snap.deckingArea    ?? state.deckingArea;
    return true;
  } catch(e) {
    console.warn('Failed to decode shared URL:', e);
    return false;
  }
}

/** Sync active swatch buttons to match decoded state */
function syncSwatchesToState() {
  // Cladding tint
  document.querySelectorAll('#claddingSwatches .swatch').forEach(sw => {
    const bg = sw.style.background;
    sw.classList.toggle('active', bg === state.claddingTint);
  });
  // Frame colour
  document.querySelectorAll('#frameSwatches .swatch').forEach(sw => {
    sw.classList.toggle('active', sw.style.background === state.frameColour);
  });
  // Dimension sliders
  ['width','depth','height'].forEach(dim => {
    const el = document.getElementById(dim + 'Slider');
    if (el) { el.value = state[dim]; document.getElementById(dim+'Val').textContent = state[dim].toFixed(1)+'m'; }
  });
  // Option buttons — mark active based on current state values
  const optMap = {
    foundation: state.foundation, roof: state.roof,
    roofFinish: state.roofFinish, cladding: state.cladding,
  };
  document.querySelectorAll('.option-btn[onclick]').forEach(btn => {
    const m = btn.getAttribute('onclick').match(/selectOpt\('(\w+)','([\w_]+)'/);
    if (m && optMap[m[1]] === m[2]) btn.classList.add('active');
    else if (m && optMap[m[1]] !== undefined) btn.classList.remove('active');
  });
  // Extras toggles
  Object.entries(state.extras).forEach(([key, val]) => {
    const btn = document.getElementById('toggle-' + key);
    if (btn) btn.classList.toggle('on', val);
  });
}

function shareDesign() {
  const hash = encodeStateToHash();
  const url  = window.location.href.split('#')[0] + '#' + hash;
  navigator.clipboard.writeText(url).then(() => {
    const copied = document.getElementById('shareCopied');
    if (copied) {
      copied.style.display = 'inline-block';
      setTimeout(() => { copied.style.display = 'none'; }, 2500);
    }
  }).catch(() => {
    // Fallback: show URL in prompt for manual copy
    prompt('Copy this link to share your design:', url);
  });
}

/** On load: check if URL has a shared hash and restore state from it */
function tryLoadFromURL() {
  const hash = window.location.hash.slice(1);
  if (!hash) return false;
  return decodeHashToState(hash);
}

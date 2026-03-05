/**
 * pricing.js
 * All pricing rules for the garden room configurator.
 * Edit this file to update any prices.
 */

// ─── FOUNDATION ────────────────────────────────────────────────────────────────

const FOUNDATION_BASE_AREA = 12; // m² included in base foundation price

const FOUNDATION = {
  concrete: { basePrice: 1800, extraPerSqm: 95,  label: 'Concrete Base' },
  block:    { basePrice: 550,  extraPerSqm: 45,   label: 'Block Base'    },
  screws:   { pricePerScrew: 120, screwsPerSqm: 0.4, minScrews: 4, label: 'Ground Screws' },
};

function calcFoundation(state) {
  const area = state.width * state.depth;
  const f = FOUNDATION[state.foundation];

  if (state.foundation === 'screws') {
    const count = Math.max(f.minScrews, Math.round(area * f.screwsPerSqm));
    return {
      total: count * f.pricePerScrew,
      label: f.label,
      screwCount: count,
      detail: `${count} screws × £${f.pricePerScrew}`,
    };
  }

  const extraArea = Math.max(0, area - FOUNDATION_BASE_AREA);
  const extraCost = extraArea * f.extraPerSqm;
  return {
    total: f.basePrice + extraCost,
    label: f.label,
    basePrice: f.basePrice,
    extraArea: parseFloat(extraArea.toFixed(2)),
    extraCost,
    extraPerSqm: f.extraPerSqm,
    detail: extraArea > 0
      ? `£${f.basePrice.toLocaleString()} base + ${extraArea.toFixed(1)}m² × £${f.extraPerSqm}`
      : `£${f.basePrice.toLocaleString()} (includes up to ${FOUNDATION_BASE_AREA}m²)`,
  };
}

// ─── ROOF ──────────────────────────────────────────────────────────────────────

const ROOF_STYLE = {
  flat: { addon: 0,    label: 'Flat Roof'     },
  apex: { addon: 1400, label: 'Apex Roof'     },
  lean: { addon: 800,  label: 'Lean-To Roof'  },
};

const ROOF_FINISH = {
  epdm:         { addon: 0,    label: 'EPDM Black'          },
  shingle_grey: { addon: 400,  label: 'Grey Shingle'        },
  shingle_red:  { addon: 400,  label: 'Red Shingle'         },
  grass:        { addon: 1200, label: 'Green Roof (Sedum)'  },
  pebbles:      { addon: 350,  label: 'Pebble Ballast'      },
  cedar:        { addon: 600,  label: 'Cedar Shingle'       },
};

const ROOF_LANTERN = 2200;

// ─── CLADDING ──────────────────────────────────────────────────────────────────

const CLADDING = {
  timber:    { addon: 0,   label: 'Timber Cladding'    },
  composite: { addon: 700, label: 'Composite Cladding' },
  render:    { addon: 500, label: 'Render Finish'      },
  cedar:     { addon: 950, label: 'Cedar Cladding'     },
};

// ─── DOORS ─────────────────────────────────────────────────────────────────────

const DOOR = {
  single:  { basePrice: 850,  widthM: 0.9, label: 'French Door (Single, 900mm)'   },
  double:  { basePrice: 1600, widthM: 1.8, label: 'French Door (Double, 1800mm)'  },
  bifold:  { basePrice: 3500, widthM: 2.4, label: 'Bi-Fold Door (2400mm)'         },
  sliding: { basePrice: 2800, widthM: 2.4, label: 'Sliding/Patio Door (2400mm)'   },
};

const DOOR_MATERIAL = {
  aluminium: { multiplier: 1.0, label: 'Aluminium' },
  pvc:       { multiplier: 1.2, label: 'PVC'        },
};

// Bi-fold doors carry an additional 70% uplift on top of base price
const BIFOLD_UPLIFT = 1.7;

function calcDoor(state) {
  const doors = state.openings.filter(o => o.type === 'door');
  if (doors.length === 0) return { total: 0, label: 'No doors placed', notes: [], count: 0 };

  // Price each door individually using its own style + material
  let total = 0;
  doors.forEach(op => {
    const door = DOOR[op.style] ?? DOOR['single'];
    const matKey = op.material ?? state.defaultDoorMat ?? 'aluminium';
    const mat  = DOOR_MATERIAL[matKey] ?? DOOR_MATERIAL['aluminium'];
    let price = door.basePrice;
    if (op.style === 'bifold') price *= BIFOLD_UPLIFT;
    if (matKey === 'pvc')      price *= mat.multiplier;
    total += price;
  });

  return {
    total: Math.round(total),
    label: doors.length === 1 ? (DOOR[doors[0].style]?.label ?? 'Door') : `${doors.length} doors`,
    count: doors.length,
    notes: [],
  };
}

// ─── WINDOWS ───────────────────────────────────────────────────────────────────

const WINDOW_STYLE = {
  tilt:  { addon: 0,   label: 'Tilt & Turn Windows'       },
  long:  { addon: 200, label: 'Long Panel Windows'         },
  vert:  { addon: 150, label: 'Narrow Vertical Windows'    },
  horiz: { addon: 150, label: 'Narrow Horizontal Windows'  },
};

// ─── STRUCTURAL REINFORCEMENT ──────────────────────────────────────────────────

const REINFORCEMENT = {
  floor:   { perSqm: 65, label: 'Reinforced Floor'   },
  walls:   { perSqm: 75, label: 'Reinforced Walls'   },
  ceiling: { perSqm: 60, label: 'Reinforced Ceiling' },
};

function calcReinforcement(state) {
  const floorArea = state.width * state.depth;
  const wallArea  = 2 * (state.width + state.depth) * state.height;
  const lines = [];
  let total = 0;

  if (state.extras.reinforceFloor) {
    const cost = Math.round(floorArea * REINFORCEMENT.floor.perSqm);
    total += cost;
    lines.push({ label: `${REINFORCEMENT.floor.label} (${floorArea.toFixed(1)}m² × £${REINFORCEMENT.floor.perSqm})`, cost });
  }
  if (state.extras.reinforceWalls) {
    const cost = Math.round(wallArea * REINFORCEMENT.walls.perSqm);
    total += cost;
    lines.push({ label: `${REINFORCEMENT.walls.label} (${wallArea.toFixed(1)}m² × £${REINFORCEMENT.walls.perSqm})`, cost });
  }
  if (state.extras.reinforceCeiling) {
    const cost = Math.round(floorArea * REINFORCEMENT.ceiling.perSqm);
    total += cost;
    lines.push({ label: `${REINFORCEMENT.ceiling.label} (${floorArea.toFixed(1)}m² × £${REINFORCEMENT.ceiling.perSqm})`, cost });
  }

  return { total, lines };
}

// ─── ELECTRICAL & HEATING ──────────────────────────────────────────────────────

const ELECTRICAL = {
  ethernetPerPoint: 250,
  stoveFlue:        2800,
  fireBoarding:     140,
  logFire:          795,
  radiator:         249,
};

function calcElectrical(state) {
  const lines = [];
  let total = 0;

  if (state.ethernetPoints > 0) {
    const cost = state.ethernetPoints * ELECTRICAL.ethernetPerPoint;
    total += cost;
    lines.push({ label: `CAT6 Ethernet (${state.ethernetPoints} point${state.ethernetPoints > 1 ? 's' : ''} × £${ELECTRICAL.ethernetPerPoint})`, cost });
  }
  if (state.extras.stoveFlue)    { total += ELECTRICAL.stoveFlue;    lines.push({ label: 'Stove Flue Kit',            cost: ELECTRICAL.stoveFlue    }); }
  if (state.extras.fireBoarding) { total += ELECTRICAL.fireBoarding; lines.push({ label: 'Fire Boarding to Wall',     cost: ELECTRICAL.fireBoarding }); }
  if (state.extras.logFire)      { total += ELECTRICAL.logFire;      lines.push({ label: 'Electric Log Effect Fire',  cost: ELECTRICAL.logFire      }); }
  if (state.extras.radiator)     { total += ELECTRICAL.radiator;     lines.push({ label: 'Electric Radiator',         cost: ELECTRICAL.radiator     }); }

  return { total, lines };
}

// ─── LIGHTING ──────────────────────────────────────────────────────────────────

const LIGHTING = {
  internalSpotlight: 65,
  externalDownlight: 129,
};

function calcLighting(state) {
  const lines = [];
  let total = 0;

  if (state.internalLights > 0) {
    const cost = state.internalLights * LIGHTING.internalSpotlight;
    total += cost;
    lines.push({ label: `Internal Spotlights (${state.internalLights} × £${LIGHTING.internalSpotlight})`, cost });
  }
  if (state.externalLights > 0) {
    const cost = state.externalLights * LIGHTING.externalDownlight;
    total += cost;
    lines.push({ label: `External Downlights (${state.externalLights} × £${LIGHTING.externalDownlight})`, cost });
  }

  return { total, lines };
}

// ─── DECKING ───────────────────────────────────────────────────────────────────

const DECKING_PER_SQM = 95;

function calcDecking(state) {
  if (!state.extras.decking) return { total: 0, lines: [] };
  const cost = Math.round(state.deckingArea * DECKING_PER_SQM);
  return {
    total: cost,
    lines: [{ label: `Decking (${state.deckingArea}m² × £${DECKING_PER_SQM})`, cost }],
  };
}

// ─── GRAND TOTAL ───────────────────────────────────────────────────────────────

function calcTotal(state) {
  let total = 0;

  total += calcFoundation(state).total;
  total += ROOF_STYLE[state.roof]?.addon   ?? 0;
  total += ROOF_FINISH[state.roofFinish]?.addon ?? 0;
  total += CLADDING[state.cladding]?.addon ?? 0;
  // Windows: sum addon per placed window using its own style
  const windows = state.openings.filter(o => o.type === 'window');
  windows.forEach(op => {
    total += WINDOW_STYLE[op.style]?.addon ?? 0;
  });
  total += calcDoor(state).total;
  if (state.extras.lantern) total += ROOF_LANTERN;
  total += calcReinforcement(state).total;
  total += calcElectrical(state).total;
  total += calcLighting(state).total;
  total += calcDecking(state).total;

  return total;
}

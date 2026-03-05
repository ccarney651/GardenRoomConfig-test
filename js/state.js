/**
 * state.js — single source of truth.
 *
 * Each opening owns its own `style` (door type or window style).
 * state.defaultDoor / state.defaultWindow are used only when placing
 * a new opening — they are the "active selection" in the sidebar.
 */

const state = {
  // Dimensions
  width:  4.0,
  depth:  3.0,
  height: 2.5,

  // Structure
  foundation: 'concrete',
  roof:       'flat',
  roofFinish: 'epdm',
  cladding:   'timber',
  claddingTint: '#5c4033',  // hex colour overlay on cladding
  frameColour:  '#1a1a1a',  // corner posts, fascia, window frames

  // Defaults for NEW openings (sidebar selects these before placing)
  defaultDoor:     'single',
  defaultWindow:   'tilt',
  defaultDoorMat:  'aluminium',

  // Placed openings — each has its own style
  openings: [
    { id: 1, type: 'door',   wall: 'front', offset:  0,   style: 'single' },
    { id: 2, type: 'window', wall: 'left',  offset:  0,   style: 'tilt'   },
    { id: 3, type: 'window', wall: 'right', offset:  0,   style: 'tilt'   },
  ],
  nextOpeningId: 4,

  extras: {
    lantern: false, reinforceFloor: false, reinforceWalls: false,
    reinforceCeiling: false, stoveFlue: false, fireBoarding: false,
    logFire: false, radiator: false, decking: false,
  },
  ethernetPoints: 0,
  internalLights: 0,
  externalLights: 0,
  deckingArea:    10,
};

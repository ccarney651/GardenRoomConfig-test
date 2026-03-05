/**
 * state.js — single source of truth.
 */

const state = {
  // Dimensions
  width:  5.0,
  depth:  4.0,
  height: 2.7,

  // Structure
  foundation: 'concrete',
  roof:       'apex',
  roofTilt:   2,        // degrees, 0–8, only used when roof === 'flat'
  roofFinish: 'epdm',
  cladding:   'timber',
  claddingTint: '#5c4033',
  frameColour:  '#1a1a1a',

  // Defaults for NEW openings
  defaultDoor:     'bifold',
  defaultWindow:   'long',
  defaultDoorMat:  'aluminium',

  // Placed openings
  openings: [
    { id: 1, type: 'door',   wall: 'front', offset:  0,   style: 'bifold' },
    { id: 2, type: 'window', wall: 'left',  offset:  0,   style: 'long'   },
    { id: 3, type: 'window', wall: 'right', offset:  0,   style: 'long'   },
    { id: 4, type: 'window', wall: 'back',  offset:  0,   style: 'tilt'   },
  ],
  nextOpeningId: 5,

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

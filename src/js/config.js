export const ELEM_W   = 200;
export const HEADER_H = 28;
export const ROW_H    = 30;
export const PORT_R    = 7;    // visual radius
export const PORT_HIT  = 12;   // hit-test radius (larger for usability)
export const PORT_SNAP = 28;   // snap-to radius while dragging a wire

export const GRID_SIZE         = 28;  // canvas background dot grid spacing
export const REMOVE_ICON_R     = 9;   // radius of the red remove-icon circle
export const REMOVE_HIT_R      = 12;  // hit-test radius for remove icons
export const SNAP_INDICATOR_R  = 11;  // radius of the snap ring drawn near target port
export const BEZIER_SAMPLES    = 24;  // sample count for bezier hit-testing

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 1.5;

export const PORT_COLOR = {
  WebSite:   '#79c0ff',
  SQL:       '#56d364',
  Storage:   '#ffa657',
  MobileAPI: '#d2a8ff',
};

export const ELEMENTS_API = 'data/elements.json';

// Populated at startup by loadElemDefs(); referenced by sidebar.js and game.js.
export const ELEM_DEFS = {};

export async function loadElemDefs() {
  const res  = await fetch(ELEMENTS_API);
  const data = await res.json();
  Object.assign(ELEM_DEFS, data);
}

export function inputKeys(def)  { return Object.keys(def.inputs);  }
export function outputKeys(def) { return Object.keys(def.outputs); }

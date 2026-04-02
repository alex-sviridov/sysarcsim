export const ELEM_W   = 200;
export const HEADER_H = 28;
export const ROW_H    = 30;
export const PORT_R    = 7;    // visual radius
export const PORT_HIT  = 12;   // hit-test radius (larger for usability)
export const PORT_SNAP = 28;   // snap-to radius while dragging a wire

export const PORT_COLOR = {
  WebSite:   '#79c0ff',
  SQL:       '#56d364',
  Storage:   '#ffa657',
  MobileAPI: '#d2a8ff',
};

export const ELEM_DEFS = {
  WebServer: {
    label:   'Web Server',
    inputs:  { SQL: { demand: 10 }, Storage: { demand: 5 } },
    outputs: { WebSite: { supply: 100 } },
    color:   '#1f6feb',
    icon:    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect x="2" y="3" width="16" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="2" y="10" width="16" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="5.5" r="1" fill="currentColor"/><circle cx="15" cy="12.5" r="1" fill="currentColor"/></svg>',
  },
  APIGateway: {
    label:   'API Gateway',
    inputs:  { SQL: { demand: 10 } },
    outputs: { MobileAPI: { supply: 80 } },
    color:   '#8957e5',
    icon:    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="2" x2="10" y2="7" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="13" x2="10" y2="18" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="10" x2="7" y2="10" stroke="currentColor" stroke-width="1.5"/><line x1="13" y1="10" x2="18" y2="10" stroke="currentColor" stroke-width="1.5"/></svg>',
  },
  Database: {
    label:   'Database',
    inputs:  { Storage: { demand: 10 } },
    outputs: { SQL: { supply: 20 } },
    color:   '#388bfd',
    icon:    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><ellipse cx="10" cy="5" rx="7" ry="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="3" y1="5" x2="3" y2="15" stroke="currentColor" stroke-width="1.5"/><line x1="17" y1="5" x2="17" y2="15" stroke="currentColor" stroke-width="1.5"/><ellipse cx="10" cy="15" rx="7" ry="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  },
  Storage: {
    label:   'Storage',
    inputs:  {},
    outputs: { Storage: { supply: 50 } },
    color:   '#f0883e',
    icon:    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect x="2" y="5" width="16" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="9" x2="18" y2="9" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="13.5" r="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  },
};

export function inputKeys(def)  { return Object.keys(def.inputs);  }
export function outputKeys(def) { return Object.keys(def.outputs); }

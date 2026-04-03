// Each level defines:
//   demands   — preset "sink" elements the player must satisfy (have inputs, no outputs)
//   available — element types the player can drag onto the desk

export const LEVELS = [
  {
    title: 'Level 1 — Web Service',
    elementsLimit: 0,
    demands: [
      {
        type:    'WebUser',
        label:   'Web User',
        inputs:  { WebSite: { demand: 100 } },
        outputs: {},
        color:   '#c93c37',
        preset:  true,
      },
    ],
    available: ['WebServer', 'Database', 'Storage', 'DirectAttachStorage'],
  },
  {
    title: 'Level 2 — Web & Mobile',
    elementsLimit: 0,
    demands: [
      {
        type:    'WebUser',
        label:   'Web User',
        inputs:  { WebSite: { demand: 100, multipath: true } },
        outputs: {},
        color:   '#c93c37',
        preset:  true,
      },
      {
        type:    'MobileUser',
        label:   'Mobile User',
        inputs:  { MobileAPI: { demand: 80 } },
        outputs: {},
        color:   '#8957e5',
        preset:  true,
      },
    ],
    available: ['WebServer', 'APIGateway', 'Database', 'Storage', 'DirectAttachStorage'],
  },
];

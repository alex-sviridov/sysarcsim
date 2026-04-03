/**
 * Jest setup file — runs after the test framework is installed.
 *
 * Mocks global.fetch so that loadElemDefs() and loadLevels() work in Node
 * without a running server. Responses are served from the local data files.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FILES = {
  'data/elements.json': resolve(__dirname, '../src/data/elements.json'),
  'data/levels.json':   resolve(__dirname, '../src/data/levels.json'),
};

global.fetch = async (url) => {
  const filePath = FILES[url];
  if (!filePath) throw new Error(`fetch: unmapped URL "${url}"`);
  const text = readFileSync(filePath, 'utf8');
  return {
    ok:   true,
    json: async () => JSON.parse(text),
    text: async () => text,
  };
};

// Pre-populate ELEM_DEFS and LEVELS before any test file runs.
// Tests import these as live bindings from the modules, so we must mutate
// the exported objects/arrays in-place rather than replacing them.
import { ELEM_DEFS, loadElemDefs } from '../src/js/config.js';
import { LEVELS, loadLevels }      from '../src/js/levels.js';

// Only load once per worker (modules are cached; arrays/objects stay populated).
if (Object.keys(ELEM_DEFS).length === 0) await loadElemDefs();
if (LEVELS.length === 0)                  await loadLevels();

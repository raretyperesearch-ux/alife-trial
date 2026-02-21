import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SOUL_DOC = readFileSync(join(__dirname, 'soul-document.md'), 'utf-8');
export const CURIOSITY_ENGINE = readFileSync(join(__dirname, 'curiosity-engine.md'), 'utf-8');
export const FORGE_INSTRUCTIONS = readFileSync(join(__dirname, 'forge-doc.md'), 'utf-8');

let _genesis = '';
try { _genesis = readFileSync(join(__dirname, 'genesis-mandate.md'), 'utf-8'); } catch {}
export const GENESIS_MANDATE = _genesis;

export default { SOUL_DOC, CURIOSITY_ENGINE, FORGE_INSTRUCTIONS, GENESIS_MANDATE };

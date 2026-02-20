// soul.js — Mira's complete soul document + curiosity engine + skill forge
// Loads from .md files so the full docs are readable and editable.
// soul-document.md: 4,857 words (330 lines) — WHO YOU ARE
// curiosity-engine.md: 3,271 words (703 lines) — HOW YOU THINK
// forge-doc.md: 3,039 words — HOW YOU BUILD
// Every word matters. If we wrote it, she needs it.

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SOUL_DOC = readFileSync(join(__dirname, 'soul-document.md'), 'utf-8');
export const CURIOSITY_ENGINE = readFileSync(join(__dirname, 'curiosity-engine.md'), 'utf-8');
export const FORGE_INSTRUCTIONS = readFileSync(join(__dirname, 'forge-doc.md'), 'utf-8');

export default { SOUL_DOC, CURIOSITY_ENGINE, FORGE_INSTRUCTIONS };

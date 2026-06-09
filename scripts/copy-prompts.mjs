// Copies the markdown prompt files into dist/ so the compiled fix-gen module
// can read them at runtime (tsc only emits .js).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'src', 'ai', 'prompts');
const dest = join(root, 'dist', 'ai', 'prompts');

if (!existsSync(src)) {
  console.error('No prompts directory to copy.');
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`Copied prompts → ${dest}`);

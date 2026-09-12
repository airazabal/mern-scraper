// Copies server/.env.example -> server/.env on first setup, without
// clobbering an existing .env. Run automatically by `npm run setup`.
import { existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const example = path.join(root, 'server', '.env.example');
const target = path.join(root, 'server', '.env');

if (existsSync(target)) {
  console.log('[setup] server/.env already exists, leaving it untouched');
} else if (existsSync(example)) {
  copyFileSync(example, target);
  console.log('[setup] created server/.env from server/.env.example — add your ANTHROPIC_API_KEY');
} else {
  console.warn('[setup] no server/.env.example found, skipping');
}

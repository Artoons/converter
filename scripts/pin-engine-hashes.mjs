#!/usr/bin/env node
/**
 * Downloads each engine archive listed in `src-tauri/engines.json`, computes its
 * SHA-256 digest, and writes the pinned hash back into `src-tauri/engines.json`.
 *
 * Usage:
 *   npm run pin-hashes
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(__dirname, '../src-tauri/engines.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

async function sha256Url(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  const hash = crypto.createHash('sha256');
  for await (const chunk of Readable.fromWeb(res.body)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

for (const engine of manifest.engines) {
  if (!engine.platforms) continue;
  for (const [platform, artifacts] of Object.entries(engine.platforms)) {
    for (const art of artifacts) {
      if (art.sha256 && !process.argv.includes('--force')) {
        console.log(`[skip] ${engine.id} (${platform}) already pinned: ${art.sha256.slice(0, 12)}…`);
        continue;
      }
      process.stdout.write(`[hash] ${engine.id} (${platform}) <- ${art.url} ... `);
      try {
        art.sha256 = await sha256Url(art.url);
        console.log(art.sha256);
      } catch (e) {
        console.log(`FAILED (${e.message})`);
      }
    }
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Updated src-tauri/engines.json');

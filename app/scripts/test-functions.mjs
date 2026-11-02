// Runs the edge functions' Deno tests under Node, for machines without Deno.
//
//   node app/scripts/test-functions.mjs
//
// Bundles each *_test.ts with esbuild (from web/node_modules), provides the two
// Deno globals the code touches — Deno.env and Deno.test — and runs it.

import { build } from '../../web/node_modules/esbuild/lib/main.js';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const shared = join(here, '../supabase/functions/_shared');
const tests = [];

globalThis.Deno = {
  env: {
    get: (k) => process.env[k],
    set: (k, v) => {
      process.env[k] = v;
    },
    delete: (k) => {
      delete process.env[k];
    },
  },
  test: (name, fn) => tests.push({ name, fn }),
};

for (const file of readdirSync(shared).filter((f) => f.endsWith('_test.ts'))) {
  const out = join(tmpdir(), `regi-${file.replace(/\.ts$/, '')}-${Date.now()}.mjs`);
  await build({
    entryPoints: [join(shared, file)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: out,
    logLevel: 'error',
    // Type-only imports of the Supabase client vanish; anything else from a URL stays external.
    external: ['https://*'],
  });
  await import(pathToFileURL(out).href);
}

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}
console.log(failed ? `\n${failed} of ${tests.length} failed` : `\nall ${tests.length} passed`);
process.exitCode = failed ? 1 : 0;

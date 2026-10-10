import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prepareWebsite } from '../scripts/prepare-website.mjs';

test('a fresh checkout restores original GIF bytes and rejects corrupt backup data', t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'crazy-batto-media-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const server = path.join(temporary, 'server');
  const parts = path.join(server, 'media-parts');
  fs.cpSync(fileURLToPath(new URL('../media-parts/', import.meta.url)), parts, { recursive: true });
  const sourceAssets = path.join(temporary, 'website/webseite/assets');
  fs.mkdirSync(sourceAssets, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(parts, 'manifest.json'), 'utf8'));
  const targets = [path.join(server, 'public/showcase/assets/header.gif'), path.join(sourceAssets, 'header.gif')];

  assert.equal(prepareWebsite(server).restored, 2);
  for (const file of targets) {
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.length, manifest.size);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.contentSha256);
  }
  assert.deepEqual(prepareWebsite(server), { restored: 0, verified: 2 });
  fs.writeFileSync(targets[0], 'changed locally');
  assert.throws(() => prepareWebsite(server), /weicht/);
  assert.equal(fs.readFileSync(targets[0], 'utf8'), 'changed locally');
  targets.forEach(file => fs.unlinkSync(file));
  fs.writeFileSync(path.join(parts, manifest.parts[0].filename), 'incomplete part');
  assert.throws(() => prepareWebsite(server), /unvollständig|verändert/);
  targets.forEach(file => assert.equal(fs.existsSync(file), false));
});

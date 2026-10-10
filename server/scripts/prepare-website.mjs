import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const defaultServer = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// The Git backup stores the original GIF in two smaller binary files.
// Docker restores it at image build time, before the read-only runtime starts.
export function prepareWebsite(serverDirectory = defaultServer) {
  const partsDirectory = path.join(serverDirectory, 'media-parts');
  const manifest = JSON.parse(fs.readFileSync(path.join(partsDirectory, 'manifest.json'), 'utf8'));
  if (manifest.formatVersion !== 1 || manifest.filename !== 'header.gif' ||
      !Number.isSafeInteger(manifest.size) || manifest.size <= 0 || manifest.size > 100 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(manifest.contentSha256) || !Array.isArray(manifest.parts) ||
      !manifest.parts.length || manifest.parts.length > 20) throw new Error('Ungültiges Medienmanifest.');
  const targets = [path.join(serverDirectory, 'public/showcase/assets/header.gif')];
  const editableAssets = path.resolve(serverDirectory, '../website/webseite/assets');
  if (fs.existsSync(editableAssets)) targets.push(path.join(editableAssets, 'header.gif'));
  const missing = [];
  for (const target of targets) {
    if (!fs.existsSync(target)) { missing.push(target); continue; }
    const bytes = fs.readFileSync(target);
    if (bytes.length !== manifest.size || hash(bytes) !== manifest.contentSha256) {
      throw new Error('Vorhandenes Header-GIF weicht vom gesicherten Original ab. Datei und Manifest prüfen.');
    }
  }
  if (!missing.length) return { restored: 0, verified: targets.length };
  const chunks = manifest.parts.map(part => {
    if (!/^header\.gif\.\d{3}$/.test(part.filename) || !Number.isSafeInteger(part.size) || part.size <= 0 ||
        !/^[a-f0-9]{64}$/.test(part.sha256)) throw new Error('Ungültiger Medienteil.');
    const bytes = fs.readFileSync(path.join(partsDirectory, part.filename));
    if (bytes.length !== part.size || hash(bytes) !== part.sha256) throw new Error('Medienteil ist unvollständig oder verändert.');
    return bytes;
  });
  if (chunks.reduce((sum, chunk) => sum + chunk.length, 0) !== manifest.size) throw new Error('Unvollständige Header-Daten.');
  const bytes = Buffer.concat(chunks, manifest.size);
  if (hash(bytes) !== manifest.contentSha256) throw new Error('Die Header-Prüfsumme stimmt nicht.');
  for (const target of missing) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = target + '.tmp-' + process.pid;
    try { fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o644 }); fs.renameSync(temporary, target); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  return { restored: missing.length, verified: targets.length, sha256: manifest.contentSha256 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(prepareWebsite()));
}

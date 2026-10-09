import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { makeFixture } from './fixtures.mjs';
import { Store, Vault } from '../src/store.mjs';

test('private store is atomic, rejects a second live process and keeps the last valid state after a failed transaction', t => {
  const f = makeFixture(t);
  assert.equal(fs.statSync(f.store.filename).mode & 0o777, 0o600);
  assert.equal(fs.statSync(f.dataDir).mode & 0o777, 0o700);
  assert.throws(() => new Store(f.dataDir), /bereits/);
  const before = fs.readFileSync(f.store.filename, 'utf8');
  assert.throws(() => f.store.transaction(draft => { draft.guildSettings.changed = true; throw new Error('abort'); }));
  assert.equal(fs.readFileSync(f.store.filename, 'utf8'), before);
  assert.equal(f.store.data.guildSettings.changed, undefined);
});

test('Linux PID reuse cannot leave an old container lock permanently blocking restart', t => {
  const f = makeFixture(t);
  f.store.close();
  fs.writeFileSync(f.store.lockPath, JSON.stringify({ pid: process.pid, identity: 'old-boot:old-process-start' }), { mode: 0o600 });
  f.restart();
  assert.equal(f.store.data.version, 2);
});

test('AES-GCM detects modified ciphertext and wrong encryption keys', () => {
  const vault = new Vault(Buffer.alloc(32, 9)), other = new Vault(Buffer.alloc(32, 10));
  const sealed = vault.seal({ accessToken: 'not-a-real-token' });
  assert.deepEqual(vault.open(sealed), { accessToken: 'not-a-real-token' });
  assert.throws(() => other.open(sealed));
  const bytes = Buffer.from(sealed.body, 'base64'); bytes[0] ^= 1;
  assert.throws(() => vault.open({ ...sealed, body: bytes.toString('base64') }));
});

test('Docker entrypoint flock excludes a second writer and releases the lock after exit', { timeout: 10_000 }, async t => {
  const probe = spawnSync('flock', ['--version']);
  if (probe.error?.code === 'ENOENT') return t.skip('flock is supplied by the Linux Docker image; it is absent on this test host.');
  assert.equal(probe.status, 0);
  const f = makeFixture(t), lock = path.join(f.dataDir, 'process.lock');
  const args = ['--exclusive', '--nonblock', '--no-fork', lock, process.execPath];
  const holder = spawn('flock', [...args, '-e', 'process.stdout.write("ready");setInterval(()=>{},1000)'], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (holder.exitCode == null) holder.kill('SIGKILL'); });
  await Promise.race([once(holder.stdout, 'data'), once(holder, 'error').then(([error]) => { throw error; })]);
  assert.equal(spawnSync('flock', [...args, '-e', 'process.exit(0)']).status, 1);
  const exited = once(holder, 'exit'); holder.kill('SIGTERM'); await exited;
  assert.equal(spawnSync('flock', [...args, '-e', 'process.exit(0)']).status, 0);
});

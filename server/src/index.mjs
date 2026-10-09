import { readConfig } from './config.mjs';
import { Store } from './store.mjs';
import { DiscordClient } from './discord.mjs';
import { Service } from './service.mjs';
import { createHttpServer } from './http.mjs';

process.umask(0o077);
const config = readConfig();
let store;
try { store = new Store(config.dataDir); }
catch { console.error('Crazy_Batto Discord App: Die private Datenbank konnte nicht sicher geöffnet werden. Dateirechte, Schlüssel und laufende Instanzen prüfen.'); process.exit(1); }
const service = new Service(config, store, new DiscordClient(config));
const server = createHttpServer(service);
server.listen(config.port, config.host, () => {
  console.log('Crazy_Batto Discord App 2.2.0 läuft auf Port ' + config.port + '.');
  if (!config.configured) console.log('Discord ist noch nicht eingerichtet. /health meldet configured:false.');
});
server.on('error', () => { console.error('Crazy_Batto Discord App: Der HTTP-Server konnte nicht gestartet werden.'); store.close(); process.exit(1); });
let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  const timer = setTimeout(() => process.exit(1), 170_000); timer.unref();
  await new Promise(resolve => server.close(resolve));
  await Promise.allSettled([...service.running.values()]);
  store.close(); clearTimeout(timer); process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

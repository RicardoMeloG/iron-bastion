// Recibe el registro de partida (src/app/match-recorder.js) y lo guarda en
// logs/partida-<inicio>.json. Funciona con npm run dev y con vite preview; publicado como sitio
// estático no existe, y el juego tampoco intenta mandar nada (solo graba en local).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const LOGS_DIR = 'logs';
const MAX_BYTES = 5 * 1024 * 1024;

function saveMatchLog(req, res, next) {
  if (req.method !== 'POST' || !req.url?.split('?')[0].endsWith('/__registro')) return next();
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BYTES) req.destroy();
    else chunks.push(chunk);
  });
  req.on('end', () => {
    try {
      const log = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!/^[\w-]{1,40}$/.test(log.id ?? '')) throw new Error('id de partida inválido');
      mkdirSync(LOGS_DIR, { recursive: true });
      writeFileSync(path.join(LOGS_DIR, `partida-${log.id}.json`), `${JSON.stringify(log, null, 2)}\n`);
      res.statusCode = 204;
      res.end();
    } catch (error) {
      res.statusCode = 400;
      res.end(String(error.message));
    }
  });
}

export function matchLogPlugin() {
  return {
    name: 'registro-de-partidas',
    configureServer(server) {
      server.middlewares.use(saveMatchLog);
    },
    configurePreviewServer(server) {
      server.middlewares.use(saveMatchLog);
    },
  };
}

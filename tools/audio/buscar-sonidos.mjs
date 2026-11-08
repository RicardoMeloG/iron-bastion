// Busca candidatos en Freesound, solo con licencia CC0, para cada evento de tools/audio/eventos.json y
// descarga su versión MP3 de alta calidad a tools/labs/sonidos/candidatos/ (fuera de git). Después se
// escuchan y se eligen en /tools/labs/sonidos.html (npm run dev).
//
//   node tools/audio/buscar-sonidos.mjs              todos los eventos
//   node tools/audio/buscar-sonidos.mjs moto-motor   solo esos
//
// Necesita FREESOUND_API_KEY en .env (https://freesound.org/apiv2/apply).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SALIDA = 'tools/labs/sonidos/candidatos';
const POR_EVENTO = Number(process.env.POR_EVENTO ?? 8);
const clave = readFileSync('.env', 'utf8').match(/^FREESOUND_API_KEY=(.+)$/m)?.[1]?.trim();
if (!clave) throw new Error('falta FREESOUND_API_KEY en .env');
const { eventos } = JSON.parse(readFileSync('tools/audio/eventos.json', 'utf8'));
const solo = process.argv.slice(2);
const CAMPOS = 'id,name,duration,avg_rating,num_ratings,num_downloads,username,license,tags,previews,url';

async function buscar(texto, [min, max]) {
  const filtro = `license:"Creative Commons 0" duration:[${min} TO ${max}]`;
  const url = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(texto)}&filter=${encodeURIComponent(filtro)}&fields=${CAMPOS}&page_size=30&token=${clave}`;
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error(`Freesound respondió ${respuesta.status} a «${texto}»`);
  return (await respuesta.json()).results;
}

// Lo más descargado y mejor valorado primero; la relevancia de la búsqueda desempata.
const puntaje = (s, orden) => Math.log10(1 + s.num_downloads) + (s.num_ratings >= 3 ? s.avg_rating : 2.5) - orden * 0.02;

const indice = existsSync(`${SALIDA}/indice.json`) ? JSON.parse(readFileSync(`${SALIDA}/indice.json`, 'utf8')) : {};
for (const evento of eventos.filter((e) => !solo.length || solo.includes(e.id))) {
  const vistos = new Map();
  for (const texto of evento.busquedas) {
    (await buscar(texto, evento.duracion)).forEach((sonido, orden) => {
      const valor = puntaje(sonido, orden);
      if (!vistos.has(sonido.id) || vistos.get(sonido.id).valor < valor) vistos.set(sonido.id, { sonido, valor, busqueda: texto });
    });
  }
  const elegidos = [...vistos.values()].sort((a, b) => b.valor - a.valor).slice(0, POR_EVENTO);
  mkdirSync(path.join(SALIDA, evento.id), { recursive: true });
  indice[evento.id] = { nombre: evento.nombre, bucle: Boolean(evento.bucle), candidatos: [] };
  for (const { sonido, busqueda } of elegidos) {
    const archivo = `${evento.id}/${sonido.id}.mp3`;
    if (!existsSync(path.join(SALIDA, archivo))) {
      const audio = await fetch(sonido.previews['preview-hq-mp3']);
      writeFileSync(path.join(SALIDA, archivo), Buffer.from(await audio.arrayBuffer()));
    }
    indice[evento.id].candidatos.push({
      id: sonido.id, nombre: sonido.name, autor: sonido.username, duracion: Math.round(sonido.duration * 10) / 10,
      valoracion: sonido.num_ratings ? `${sonido.avg_rating.toFixed(1)} (${sonido.num_ratings})` : '—',
      descargas: sonido.num_downloads, licencia: sonido.license, pagina: sonido.url, busqueda, archivo,
    });
  }
  console.log(`${evento.id}: ${elegidos.length} candidatos`);
}
writeFileSync(`${SALIDA}/indice.json`, `${JSON.stringify(indice, null, 2)}\n`);

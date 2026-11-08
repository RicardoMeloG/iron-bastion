import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { matchLogPlugin } from './tools/match-log/vite-plugin.mjs';

// El build de producción lleva solo el juego. Los laboratorios (tools/labs/) se abren con
// npm run dev en su URL, por ejemplo /tools/labs/rig-viewer.html (spec 001, T13).
// base relativa: el build funciona servido desde cualquier carpeta, como GitHub Pages
// (usuario.github.io/<repositorio>/), sin conocer el nombre del repositorio.
export default defineConfig({
  base: './',
  // Guarda en logs/ el registro de las partidas jugadas en local (spec 002).
  plugins: [matchLogPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
});

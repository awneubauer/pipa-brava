/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import { GAME_TITLE } from './src/config';
import { iconSvg, renderIconPng } from './scripts/icons';

/** PWA simples: manifest e ícones gerados por código (sem arquivos de imagem no repositório). */
function pwa(): Plugin {
  const manifest = () =>
    JSON.stringify(
      {
        name: GAME_TITLE,
        short_name: GAME_TITLE,
        description: 'Jogo de soltar pipa: carretel, linha, vento e corte.',
        lang: 'pt-BR',
        start_url: './',
        scope: './',
        display: 'fullscreen',
        orientation: 'portrait',
        background_color: '#24184a',
        theme_color: '#3b4fa0',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      null,
      2,
    );
  const files: Record<string, () => string | Uint8Array> = {
    'manifest.webmanifest': manifest,
    'icon.svg': iconSvg,
    'icon-192.png': () => renderIconPng(192),
    'icon-512.png': () => renderIconPng(512),
    'icon-maskable-512.png': () => renderIconPng(512, 0.12),
    'apple-touch-icon.png': () => renderIconPng(180),
  };
  const types: Record<string, string> = {
    webmanifest: 'application/manifest+json',
    svg: 'image/svg+xml',
    png: 'image/png',
  };
  return {
    name: 'pipa-pwa',
    transformIndexHtml(html) {
      return html.replace(/<title>.*<\/title>/, `<title>${GAME_TITLE}</title>`);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = (req.url ?? '').split('?')[0].replace(/^\//, '');
        const gen = files[name];
        if (!gen) return next();
        res.setHeader('Content-Type', types[name.split('.').pop() ?? ''] ?? 'application/octet-stream');
        res.end(gen());
      });
    },
    generateBundle() {
      for (const [fileName, gen] of Object.entries(files)) this.emitFile({ type: 'asset', fileName, source: gen() });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [pwa()],
  build: { target: 'es2019', outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 120000 },
});

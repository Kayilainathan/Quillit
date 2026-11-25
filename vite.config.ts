import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => {
  // Use relative './' asset paths for production builds so the app works
  // cleanly on any GitHub Pages repository subpath (/<repo>/) or custom domain,
  // while keeping '/' for the local dev server.
  const base =
    command === 'build' ? process.env.VITE_BASE_PATH || './' : '/';

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ and emits GitHub Pages static-hosting files
      // (.nojekyll + 404.html SPA fallback) automatically on every production build.
      {
        name: 'quillit-static-pages-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }
          if (fs.existsSync(distDir)) {
            // Prevent GitHub Pages Jekyll processing so all Vite chunks load reliably
            fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
            // Emit 404.html SPA fallback identical to index.html
            const indexHtml = path.join(distDir, 'index.html');
            if (fs.existsSync(indexHtml)) {
              fs.copyFileSync(indexHtml, path.join(distDir, '404.html'));
            }
          }
        },
      },
    ],
    build: {
      chunkSizeWarningLimit: 900,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'vendor-firebase', test: /node_modules\/(firebase|@firebase)\// },
              { name: 'vendor-charts', test: /node_modules\/(recharts|d3|d3-.*|victory-vendor)\// },
              { name: 'vendor-motion', test: /node_modules\/(motion|framer-motion)\// },
              { name: 'vendor-react', test: /node_modules\/(react|react-dom|react-is|scheduler)\// },
            ],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

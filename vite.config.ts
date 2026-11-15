import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { build as esbuild } from 'esbuild';
import { resolve } from 'path';

/**
 * Bundles `src/plugin.ts` as a self-contained IIFE at `/plugin.js` during `vite dev`
 * and `dist/plugin.js` during `vite build` so Penpot's plugin sandbox never receives
 * ES module `import` statements.
 */
function penpotPluginBundle(): Plugin {
  const buildPluginBundle = async () => {
    const result = await esbuild({
      entryPoints: [resolve(__dirname, 'src/plugin.ts')],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
    });
    return result.outputFiles[0]?.text ?? '';
  };

  return {
    name: 'penpot-plugin-bundle',
    configureServer(server) {
      server.middlewares.use('/plugin.js', async (_req, res, next) => {
        try {
          const code = await buildPluginBundle();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Private-Network', 'true');
          res.end(code);
        } catch (err) {
          next(err);
        }
      });
    },
    async writeBundle(options) {
      const { writeFileSync } = await import('fs');
      const outDir = options.dir ?? resolve(__dirname, 'dist');
      const code = await buildPluginBundle();
      writeFileSync(resolve(outDir, 'plugin.js'), code, 'utf8');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), penpotPluginBundle()],
  server: {
    port: 4400,
    strictPort: true,
    cors: true,
  },
  preview: {
    port: 4400,
    strictPort: true,
    cors: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
});

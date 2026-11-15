import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { build as esbuild } from 'esbuild';
import { resolve } from 'path';

/**
 * Bundles `src/plugin.ts` as a self-contained IIFE at `/plugin.js` during `vite dev`
 * so Penpot's plugin sandbox never receives unresolved ES module `import` statements.
 */
function penpotPluginDevMiddleware(): Plugin {
  return {
    name: 'penpot-plugin-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/plugin.js', async (_req, res, next) => {
        try {
          const result = await esbuild({
            entryPoints: [resolve(__dirname, 'src/plugin.ts')],
            bundle: true,
            write: false,
            format: 'iife',
            platform: 'browser',
            target: 'es2022',
          });
          const code = result.outputFiles[0]?.text ?? '';
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
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), penpotPluginDevMiddleware()],
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
        plugin: resolve(__dirname, 'src/plugin.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === 'plugin' ? 'plugin.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});

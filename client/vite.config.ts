import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const WEAPON_MOUNT_PATH = resolve(
  __dirname,
  'public/assets/characters/ultimate_modular_men/weapon_mounts.json'
);
const SAVE_MOUNTS_ROUTE = '/__afps/editor/save-weapon-mounts';

const createWeaponMountSavePlugin = (): Plugin => ({
  name: 'afps-editor-save-mounts',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url !== SAVE_MOUNTS_ROUTE) {
        next();
        return;
      }
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
        return;
      }

      req.setEncoding('utf8');
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 2_000_000) {
          res.statusCode = 413;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: 'payload_too_large' }));
          req.destroy();
        }
      });
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body) as unknown;
          const content = `${JSON.stringify(parsed, null, 2)}\n`;
          await writeFile(WEAPON_MOUNT_PATH, content, 'utf8');
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.statusCode = 400;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: 'invalid_json' }));
        }
      });
      req.on('error', () => {
        if (res.writableEnded) {
          return;
        }
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: 'request_error' }));
      });
    });
  }
});

export default defineConfig({
  plugins: [createWeaponMountSavePlugin()],
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor.html')
      }
    }
  },
  server: {
    fs: {
      allow: [resolve(__dirname, '..')]
    }
  }
});

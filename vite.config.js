import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

function localHttps() {
  const directory = process.env.FACE_CAPTURE_HTTPS_CERT_DIR;
  if (!directory) return undefined;
  const keyPath = join(directory, 'server.key');
  const certPath = join(directory, 'server.crt');
  if (!existsSync(keyPath) || !existsSync(certPath)) {
    throw new Error('FACE_CAPTURE_HTTPS_CERT_DIR must contain server.key and server.crt');
  }
  return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
}

export default defineConfig({
  base: './',
  server: {
    https: localHttps(),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});

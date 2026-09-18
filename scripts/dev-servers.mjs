import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const httpOnly = process.argv.includes('--http-only');
const httpsOnly = process.argv.includes('--https-only');
if (httpOnly && httpsOnly) throw new Error('Choose either --http-only or --https-only.');

function port(value, fallback, name) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) throw new Error(`${name} must be an integer from 1024 to 65535.`);
  return parsed;
}

function certificate() {
  const directory = process.env.FACE_CAPTURE_HTTPS_CERT_DIR;
  if (!directory) throw new Error('FACE_CAPTURE_HTTPS_CERT_DIR is required for HTTPS.');
  const keyPath = join(directory, 'server.key');
  const certPath = join(directory, 'server.crt');
  if (!existsSync(keyPath) || !existsSync(certPath)) {
    throw new Error('FACE_CAPTURE_HTTPS_CERT_DIR must contain server.key and server.crt.');
  }
  return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
}

const httpPort = port(process.env.FACE_CAPTURE_HTTP_PORT, 4180, 'FACE_CAPTURE_HTTP_PORT');
const httpsPort = port(process.env.FACE_CAPTURE_HTTPS_PORT, 4181, 'FACE_CAPTURE_HTTPS_PORT');
if (!httpOnly && !httpsOnly && httpPort === httpsPort) throw new Error('HTTP and HTTPS ports must be different.');

async function start(name, serverOptions, cacheDir) {
  const server = await createServer({
    configFile: false,
    root,
    base: './',
    cacheDir,
    server: { host: '0.0.0.0', strictPort: true, ...serverOptions },
  });
  await server.listen();
  console.log(`\n${name}`);
  server.printUrls();
  return server;
}

const servers = [];
if (!httpsOnly) servers.push(await start('HTTP', { port: httpPort }, 'node_modules/.vite-http'));
if (!httpOnly) servers.push(await start('HTTPS', { port: httpsPort, https: certificate() }, 'node_modules/.vite-https'));

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await Promise.all(servers.map(server => server.close()));
  process.exit(0);
}
process.on('SIGINT', close);
process.on('SIGTERM', close);

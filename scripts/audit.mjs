import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const textExtensions = new Set(['.html', '.css', '.js', '.mjs', '.json', '.md', '.yml', '.yaml', '.txt']);
const excludedDirectories = new Set(['.git', 'dist', 'node_modules']);
const checks = [
  ['private key material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['private network address', /\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/],
  ['business route', /\/(?:api|local)\//i],
  ['embedded credential parameter', /[?&](?:access_?key|secret|session|credential)=/i],
  ['media post-processing binary', new RegExp(['ff', 'mpeg'].join(''), 'i')],
  ['color challenge protocol', new RegExp(['color', 'Data'].join(''), 'i')],
];

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (textExtensions.has(extname(entry.name)) && entry.name !== 'audit.mjs') result.push(path);
  }
  return result;
}

const findings = [];
for (const file of await files(root)) {
  const source = await readFile(file, 'utf8');
  for (const [name, pattern] of checks) {
    if (pattern.test(source)) findings.push(`${relative(root, file)}: ${name}`);
  }
}

if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Public-source audit passed.');
}

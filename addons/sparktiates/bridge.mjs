/**
 * SPARKTIATES — pont local additif pour Radio des IA.
 * Portée : calcul SHA-256 reproductible dans trois langages, pas moteur de modèles IA.
 * Aucune exécution de code arbitraire ; écoute sur 127.0.0.1 uniquement.
 */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MAX_BYTES = 16 * 1024;
const RUNTIMES = new Set(['javascript', 'java', 'powershell']);

function has(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 3500, maxBuffer: 4096 });
  return !result.error && result.status === 0;
}

export function capabilities() {
  return {
    javascript: { available: true, engine: 'Node.js' },
    java: { available: has('java', ['-version']), engine: 'Java 11+ (source-file mode)' },
    powershell: { available: has('pwsh', ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.Major']), engine: 'PowerShell 7+' },
  };
}

export function sha256(text, runtime) {
  if (!RUNTIMES.has(runtime)) throw Object.assign(new Error('Langage non pris en charge.'), { status: 400 });
  if (runtime === 'javascript') return createHash('sha256').update(text, 'utf8').digest('hex');
  const command = runtime === 'java' ? 'java' : 'pwsh';
  const args = runtime === 'java'
    ? [resolve(ROOT, 'RuntimeHash.java')]
    : ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', resolve(ROOT, 'RuntimeHash.ps1')];
  const result = spawnSync(command, args, {
    input: text, encoding: 'utf8', timeout: 15000, maxBuffer: 4096, windowsHide: true,
  });
  if (result.error || result.status !== 0 || !/^[a-f0-9]{64}$/i.test((result.stdout || '').trim())) {
    throw Object.assign(new Error(`${runtime} indisponible ou vérification échouée.`), { status: 503 });
  }
  return result.stdout.trim().toLowerCase();
}

function reply(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}

async function handler(req, res) {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      return reply(res, 200, { service: 'SPARKTIATES', mode: 'local-addon', status: 'ok', runtimes: capabilities() });
    }
    if (req.method !== 'POST' || url.pathname !== '/sha256') {
      return reply(res, 404, { error: 'Route inconnue. GET /health ou POST /sha256.' });
    }
    if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return reply(res, 415, { error: 'Content-Type application/json requis.' });
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) throw Object.assign(new Error('Requête trop volumineuse.'), { status: 413 });
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    let payload;
    try { payload = JSON.parse(body); } catch { return reply(res, 400, { error: 'JSON invalide.' }); }
    if (!payload || typeof payload.text !== 'string' || typeof payload.runtime !== 'string') {
      return reply(res, 400, { error: 'Champs text et runtime requis.' });
    }
    const digest = sha256(payload.text, payload.runtime);
    return reply(res, 200, { runtime: payload.runtime, algorithm: 'SHA-256', digest });
  } catch (error) {
    return reply(res, error.status || 500, { error: error.status ? error.message : 'Erreur interne.' });
  }
}

export function createApp() { return createServer(handler); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number.parseInt(process.env.SPARKTIATES_PORT || '8787', 10);
  if (!(port >= 1 && port <= 65535)) throw new Error('Port invalide.');
  createApp().listen(port, '127.0.0.1', () => {
    console.log(`SPARKTIATES ADDON actif : http://127.0.0.1:${port}/health`);
  });
}

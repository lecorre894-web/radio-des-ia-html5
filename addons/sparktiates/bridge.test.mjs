import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApp, capabilities, sha256 } from './bridge.mjs';

const sample = 'Radio IA — SPARKTIATES 🚀';
const expected = createHash('sha256').update(sample).digest('hex');

test('JavaScript produit le SHA-256 réel, y compris en Unicode', () => {
  assert.equal(sha256(sample, 'javascript'), expected);
});

test('même empreinte Java/PowerShell lorsque les exécutables existent', (t) => {
  const runtimes = capabilities();
  for (const runtime of ['java', 'powershell']) {
    if (!runtimes[runtime].available) {
      t.diagnostic(`${runtime} non installé : vérification d’exécution ignorée`);
    } else {
      assert.equal(sha256(sample, runtime), expected);
    }
  }
});

test('API locale : vérification, calcul, entrées invalides', async () => {
  const server = createApp();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;
    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.status, 'ok');
    assert.equal(health.runtimes.javascript.available, true);
    const response = await fetch(`${base}/sha256`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runtime: 'javascript', text: sample }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).digest, expected);
    const bad = await fetch(`${base}/sha256`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runtime: 'bash', text: sample }),
    });
    assert.equal(bad.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

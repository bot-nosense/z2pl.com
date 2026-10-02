import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/interest.js';

const ORIGIN = 'https://landing.example.test';
const sample = (extra = {}) => ({
  kind: 'waitlist', email: 'Person@Example.com', message: '', topic: '',
  updates: true, consent: true, website: '',
  submissionId: 'c2f67ad6-4ec1-46a9-924b-795623f40150',
  turnstileToken: 'test-token', ...extra
});

class FakeD1 {
  subscribers = new Map();
  feedback = new Map();
  rate = 0;
  fail = false;
  batchCount = 0;
  prepare(sql) {
    const database = this;
    return {
      sql, values: [],
      bind(...values) { this.values = values; return this; },
      async first() {
        if (database.fail) throw new Error('Storage down');
        if (sql.startsWith('INSERT INTO rate_limits')) return { hits: ++database.rate };
        if (sql.startsWith('SELECT payload_hash')) return database.feedback.get(this.values[0]) || null;
        throw new Error('Unhandled SQL');
      },
      async run() { return { success: true }; }
    };
  }
  async batch(statements) {
    if (this.fail) throw new Error('Storage down');
    this.batchCount++;
    for (const statement of statements) {
      if (statement.sql.startsWith('INSERT INTO subscribers')) {
        const [email, created_at, consent_version, source] = statement.values;
        if (!this.subscribers.has(email)) this.subscribers.set(email, { email, created_at, consent_version, source });
      } else if (statement.sql.startsWith('INSERT INTO feedback')) {
        const [id, topic, message, email, created_at, payload_hash] = statement.values;
        if (!this.feedback.has(id)) this.feedback.set(id, { id, topic, message, email, created_at, payload_hash });
      } else throw new Error('Unhandled SQL');
    }
    return statements.map(() => ({ success: true }));
  }
}
function env(DB = new FakeD1()) {
  return { DB, ALLOWED_ORIGIN: ORIGIN, IP_HASH_KEY: 'test-hash-key-of-at-least-32-characters', TURNSTILE_SECRET_KEY: 'test-secret' };
}
function request(body, overrides = {}) {
  return new Request(`${ORIGIN}/api/interest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': '192.0.2.1', ...(overrides.headers || {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'headers'))
  });
}
const accepted = (action = 'waitlist', hostname = 'landing.example.test') => async () => Response.json({ success: true, action, hostname });

// Mocked platform bindings: these tests do not call Cloudflare or collect real data.
test('API contract and fail-closed handling', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  await t.test('rejects GET and discloses no subscriber data', async () => {
    const response = await onRequest({ request: new Request(`${ORIGIN}/api/interest`), env: env() });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
  });
  await t.test('fails closed when bindings are missing', async () => {
    assert.equal((await onRequest({ request: request(sample()), env: {} })).status, 503);
  });
  await t.test('rejects a weak IP hashing secret', async () => {
    assert.equal((await onRequest({ request: request(sample()), env: { ...env(), IP_HASH_KEY: 'short' } })).status, 503);
  });
  await t.test('rejects cross-origin requests', async () => {
    assert.equal((await onRequest({ request: request(sample(), { headers: { Origin: 'https://other.test' } }), env: env() })).status, 403);
  });
  await t.test('rejects non-JSON content', async () => {
    assert.equal((await onRequest({ request: request(sample(), { headers: { 'Content-Type': 'text/plain' } }), env: env() })).status, 415);
  });
  await t.test('rejects malformed JSON', async () => {
    assert.equal((await onRequest({ request: request('{'), env: env() })).status, 400);
  });
  await t.test('enforces streamed body size even without Content-Length', async () => {
    assert.equal((await onRequest({ request: request('x'.repeat(17000)), env: env() })).status, 413);
  });
  await t.test('requires a valid email for signup', async () => {
    assert.equal((await onRequest({ request: request(sample({ email: 'not-an-email' })), env: env() })).status, 400);
  });
  await t.test('requires explicit marketing consent', async () => {
    assert.equal((await onRequest({ request: request(sample({ consent: false })), env: env() })).status, 400);
  });
  await t.test('rejects honeypot submissions', async () => {
    assert.equal((await onRequest({ request: request(sample({ website: 'bot' })), env: env() })).status, 400);
  });
  await t.test('rejects missing Turnstile token', async () => {
    assert.equal((await onRequest({ request: request(sample({ turnstileToken: '' })), env: env() })).status, 400);
  });
  await t.test('rejects mismatched challenge action and hostname', async () => {
    globalThis.fetch = accepted('feedback');
    assert.equal((await onRequest({ request: request(sample()), env: env() })).status, 403);
    globalThis.fetch = accepted('waitlist', 'other.test');
    assert.equal((await onRequest({ request: request(sample()), env: env() })).status, 403);
  });
  await t.test('rejects failed or replayed challenge tokens', async () => {
    globalThis.fetch = async () => Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] });
    const bindings = env();
    assert.equal((await onRequest({ request: request(sample()), env: bindings })).status, 403);
    assert.equal(bindings.DB.subscribers.size, 0);
  });
  await t.test('does not save when the verification service is down', async () => {
    globalThis.fetch = async () => { throw new Error('offline'); };
    const bindings = env();
    assert.equal((await onRequest({ request: request(sample()), env: bindings })).status, 503);
    assert.equal(bindings.DB.batchCount, 0);
  });
  await t.test('saves a consented signup; response is not cacheable', async () => {
    globalThis.fetch = accepted();
    const bindings = env();
    const response = await onRequest({ request: request(sample()), env: bindings });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, status: 'saved' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(bindings.DB.subscribers.size, 1);
    assert.equal(bindings.DB.subscribers.get('person@example.com').consent_version, 'launch-2026-09-30');
  });
  await t.test('deduplicates email; does not expose whether it was already present', async () => {
    globalThis.fetch = accepted();
    const bindings = env();
    const first = await onRequest({ request: request(sample()), env: bindings });
    const second = await onRequest({ request: request(sample({ email: 'PERSON@example.COM' })), env: bindings });
    assert.deepEqual(await first.json(), await second.json());
    assert.equal(bindings.DB.subscribers.size, 1);
  });
  await t.test('accepts anonymous feedback without adding a subscriber', async () => {
    globalThis.fetch = accepted('feedback');
    const bindings = env();
    const response = await onRequest({ request: request(sample({ kind: 'feedback', topic: 'idea', message: 'Batch preview would help.', email: '', updates: false, consent: false })), env: bindings });
    assert.equal(response.status, 200);
    assert.equal(bindings.DB.subscribers.size, 0);
    assert.equal(bindings.DB.feedback.size, 1);
    assert.equal([...bindings.DB.feedback.values()][0].email, null);
  });
  await t.test('feedback email alone does not opt in', async () => {
    globalThis.fetch = accepted('feedback');
    const bindings = env();
    const body = sample({ kind: 'feedback', topic: 'workflow', message: 'I want a simpler label preview.', updates: false, consent: false });
    assert.equal((await onRequest({ request: request(body), env: bindings })).status, 200);
    assert.equal(bindings.DB.subscribers.size, 0);
    assert.equal(bindings.DB.feedback.size, 1);
  });
  await t.test('saves feedback and explicit signup in one database batch', async () => {
    globalThis.fetch = accepted('feedback');
    const bindings = env();
    const body = sample({ kind: 'feedback', topic: 'workflow', message: 'Please support batch workflows.' });
    assert.equal((await onRequest({ request: request(body), env: bindings })).status, 200);
    assert.equal(bindings.DB.batchCount, 1);
    assert.equal(bindings.DB.subscribers.size, 1);
    assert.equal(bindings.DB.feedback.size, 1);
  });
  await t.test('retries do not duplicate feedback', async () => {
    globalThis.fetch = accepted('feedback');
    const bindings = env();
    const body = sample({ kind: 'feedback', topic: 'workflow', message: 'Please support batch workflows.' });
    assert.equal((await onRequest({ request: request(body), env: bindings })).status, 200);
    assert.equal((await onRequest({ request: request(body), env: bindings })).status, 200);
    assert.equal(bindings.DB.feedback.size, 1);
  });
  await t.test('reusing a submission ID for different content fails', async () => {
    globalThis.fetch = accepted('feedback');
    const bindings = env();
    const body = sample({ kind: 'feedback', topic: 'idea', message: 'First suggestion.' });
    await onRequest({ request: request(body), env: bindings });
    assert.equal((await onRequest({ request: request({ ...body, message: 'Different suggestion.' }), env: bindings })).status, 409);
  });
  await t.test('enforces rate limiting before an external verification call', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ success: true }); };
    const bindings = env(); bindings.DB.rate = 20;
    const response = await onRequest({ request: request(sample()), env: bindings });
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('retry-after')) > 0);
    assert.equal(calls, 0);
  });
  await t.test('storage errors never produce a saved response', async () => {
    globalThis.fetch = accepted();
    const bindings = env(); bindings.DB.fail = true;
    assert.equal((await onRequest({ request: request(sample()), env: bindings })).status, 503);
  });
});

/**
 * POST /api/interest — Cloudflare Pages + D1 + Turnstile.
 * No dependencies, no raw IP logging, no unauthenticated subscriber listing.
 * All critical bindings are mandatory: fail closed, never fake a saved response.
 */
import { notifyOwner } from "./notify.js";

const LIMIT_BYTES = 16384;
const WINDOW_MS = 10 * 60 * 1000;
const WINDOW_LIMIT = 20;
const CONSENT_VERSION = "launch-2026-09-30";
const TOPICS = new Set(["idea", "workflow", "other"]);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reply(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...headers,
    },
  });
}

function error(status, code) {
  return reply(status, { ok: false, error: code });
}

async function readJSON(request) {
  if (Number(request.headers.get("content-length") || 0) > LIMIT_BYTES)
    throw new RangeError("payload");
  if (!request.body) throw new SyntaxError("empty");
  const reader = request.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMIT_BYTES) {
        await reader.cancel();
        throw new RangeError("payload");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function validEmail(value) {
  return (
    value.length <= 254 && /^[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)+$/u.test(value)
  );
}

function normalize(data) {
  if (!data || Array.isArray(data) || typeof data !== "object") return null;
  if (!["waitlist", "feedback"].includes(data.kind)) return null;
  if (
    typeof data.email !== "string" ||
    typeof data.message !== "string" ||
    typeof data.topic !== "string"
  )
    return null;
  if (typeof data.updates !== "boolean" || typeof data.consent !== "boolean")
    return null;
  if (typeof data.website !== "string" || data.website !== "") return null;
  if (typeof data.submissionId !== "string" || !UUID.test(data.submissionId))
    return null;
  if (
    typeof data.turnstileToken !== "string" ||
    !data.turnstileToken ||
    data.turnstileToken.length > 2048
  )
    return null;
  const email = data.email.trim().toLowerCase();
  const message = data.message.trim();
  const topic = data.topic;
  if (email && !validEmail(email)) return null;
  if (data.updates !== data.consent) return null;
  if (data.kind === "waitlist" && (!email || !data.updates || message || topic))
    return null;
  if (
    data.kind === "feedback" &&
    (!TOPICS.has(topic) || message.length < 3 || message.length > 2000)
  )
    return null;
  if (data.updates && !email) return null;
  return { ...data, email, message, topic };
}

async function hmac(secret, text) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(text));
  return [...new Uint8Array(signature)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(text) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}

/** @param {{request: Request, env: Object, waitUntil?: Function}} context */
export async function handleInterest({ request, env, waitUntil }) {
  if (request.method !== "POST")
    return reply(
      405,
      { ok: false, error: "METHOD_NOT_ALLOWED" },
      { Allow: "POST" },
    );
  if (
    !(request.headers.get("content-type") || "")
      .toLowerCase()
      .startsWith("application/json")
  )
    return error(415, "JSON_REQUIRED");
  if (
    !env.DB ||
    !env.ALLOWED_ORIGIN ||
    !env.TURNSTILE_SECRET_KEY ||
    !env.IP_HASH_KEY ||
    env.IP_HASH_KEY.length < 32
  )
    return error(503, "NOT_CONFIGURED");
  let origin;
  try {
    origin = new URL(env.ALLOWED_ORIGIN);
    if (
      origin.origin !== env.ALLOWED_ORIGIN ||
      !["http:", "https:"].includes(origin.protocol)
    )
      return error(503, "NOT_CONFIGURED");
  } catch {
    return error(503, "NOT_CONFIGURED");
  }
  if (
    request.headers.get("origin") !== origin.origin ||
    new URL(request.url).origin !== origin.origin
  )
    return error(403, "ORIGIN_REJECTED");

  let data;
  try {
    data = normalize(await readJSON(request));
  } catch (cause) {
    return error(cause instanceof RangeError ? 413 : 400, "INVALID_PAYLOAD");
  }
  if (!data) return error(400, "INVALID_PAYLOAD");

  try {
    // CF-Connecting-IP is populated by Cloudflare, not accepted from body fields.
    // New pseudonymous key each window. Raw IP is never persisted by this code.
    const ip = request.headers.get("CF-Connecting-IP");
    if (!ip) return error(503, "CLIENT_CONTEXT_UNAVAILABLE");
    const now = Date.now();
    const bucket = Math.floor(now / WINDOW_MS);
    const rateKey = await hmac(env.IP_HASH_KEY, `${ip}:${bucket}`);
    const rate = await env.DB.prepare(
      "INSERT INTO rate_limits (key, hits, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET hits = hits + 1 RETURNING hits",
    )
      .bind(rateKey, (bucket + 1) * WINDOW_MS)
      .first();
    // Opportunistic cleanup is indexed and runs after every valid request.
    // Expired rows may remain while there is no traffic.
    const cleanup = env.DB.prepare(
      "DELETE FROM rate_limits WHERE expires_at < ?",
    )
      .bind(now)
      .run();
    if (waitUntil) waitUntil(cleanup.catch(() => {}));
    else await cleanup;
    if (!rate || !Number.isFinite(rate.hits))
      return error(503, "STORAGE_UNAVAILABLE");
    if (rate.hits > WINDOW_LIMIT)
      return reply(
        429,
        { ok: false, error: "RATE_LIMITED" },
        {
          "Retry-After": String(
            Math.ceil(((bucket + 1) * WINDOW_MS - now) / 1000),
          ),
        },
      );

    let verification;
    try {
      const response = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret: env.TURNSTILE_SECRET_KEY,
            response: data.turnstileToken,
            remoteip: ip,
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) return error(503, "VERIFICATION_UNAVAILABLE");
      verification = await response.json();
    } catch {
      return error(503, "VERIFICATION_UNAVAILABLE");
    }
    if (
      verification.success !== true ||
      verification.hostname !== origin.hostname ||
      verification.action !== data.kind
    )
      return error(403, "VERIFICATION_FAILED");

    const createdAt = new Date(now).toISOString();
    const writes = [];
    if (data.updates) {
      // Generic success for existing addresses prevents subscription enumeration.
      writes.push(
        env.DB.prepare(
          "INSERT INTO subscribers (email, created_at, consent_version, source) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING",
        ).bind(data.email, createdAt, CONSENT_VERSION, data.kind),
      );
    }
    if (data.kind === "feedback") {
      const fingerprint = await sha256(
        JSON.stringify([data.email, data.message, data.topic, data.updates]),
      );
      const existing = await env.DB.prepare(
        "SELECT payload_hash FROM feedback WHERE id = ?",
      )
        .bind(data.submissionId)
        .first();
      if (existing && existing.payload_hash !== fingerprint)
        return error(409, "SUBMISSION_ID_CONFLICT");
      writes.push(
        env.DB.prepare(
          "INSERT INTO feedback (id, topic, message, email, created_at, payload_hash) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload_hash = CASE WHEN feedback.payload_hash = excluded.payload_hash THEN feedback.payload_hash ELSE NULL END",
        ).bind(
          data.submissionId,
          data.topic,
          data.message,
          data.email || null,
          createdAt,
          fingerprint,
        ),
      );
    }
    // D1 batch executes transactionally. No success before storage succeeds.
    const results = await env.DB.batch(writes);
    if (!results.length || results.some((result) => !result.success))
      return error(503, "STORAGE_UNAVAILABLE");
    // Email is an owner notification, not the storage acknowledgment. A mail
    // outage must not undo saved data or expose provider errors to visitors.
    const notification = notifyOwner(env, data).catch(() => {
      console.error(
        "Z2PL owner notification failed; submission remains saved.",
      );
    });
    if (waitUntil) waitUntil(notification);
    else await notification;
    return reply(200, { ok: true, status: "saved" });
  } catch {
    // Do not log email, messages, tokens, request headers or raw IPs.
    return error(503, "STORAGE_UNAVAILABLE");
  }
}

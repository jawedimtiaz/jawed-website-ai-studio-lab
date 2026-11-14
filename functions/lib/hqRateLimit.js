import { hqJson } from './hqApi.js';

export function getHqClientIp(request) {
  const cfIp = request.headers?.get?.('cf-connecting-ip');
  if (cfIp && cfIp.trim()) return cfIp.trim();
  const forwarded = request.headers?.get?.('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return '127.0.0.1';
}

export function hqRateLimitResponse(retryAfter = 60) {
  return hqJson(
    { ok: false, error: 'RATE_LIMIT_EXCEEDED', retryAfter },
    429,
    { 'retry-after': String(retryAfter) }
  );
}

export function hqRateLimitUnavailableResponse() {
  return hqJson(
    { ok: false, error: 'RATE_LIMIT_UNAVAILABLE' },
    503
  );
}

const SUPPORTED_LIMITER_BINDINGS = {
  session: ['HQ_SESSION_LIMITER', 'HQ_RATE_LIMITER', 'RATE_LIMITER'],
  write: ['HQ_WRITE_LIMITER', 'HQ_RATE_LIMITER', 'RATE_LIMITER'],
  general: ['HQ_RATE_LIMITER', 'RATE_LIMITER']
};

function resolveLimiterBinding(env, type) {
  if (!env || typeof env !== 'object') {
    return { configured: false, binding: null };
  }
  const candidateNames = SUPPORTED_LIMITER_BINDINGS[type] || SUPPORTED_LIMITER_BINDINGS.general;
  for (const name of candidateNames) {
    if (Object.prototype.hasOwnProperty.call(env, name) || (name in env)) {
      return { configured: true, binding: env[name] };
    }
  }
  return { configured: false, binding: null };
}

/**
 * Checks rate limits using Cloudflare Workers Rate Limiting API bindings if configured.
 * If no supported rate-limiter binding is configured in `env`, the check gracefully passes
 * through ({ ok: true }) because binding activation is intentionally deferred.
 * If a supported binding is present in `env` but null, malformed, or lacks a callable
 * `.limit()` method, or if `.limit()` throws or returns a malformed response, it fails
 * closed with HTTP 503 RATE_LIMIT_UNAVAILABLE.
 */
export async function checkHqRateLimit(request, env, options = {}) {
  const type = options.type || 'general';
  const { configured, binding } = resolveLimiterBinding(env, type);

  // Preserve pass-through only when no supported rate-limiter binding is configured in the environment.
  if (!configured) {
    return { ok: true };
  }

  // If a supported binding is present but null, malformed, or does not expose a callable .limit() method,
  // fail closed with HTTP 503 RATE_LIMIT_UNAVAILABLE.
  if (
    !binding ||
    (typeof binding !== 'object' && typeof binding !== 'function') ||
    typeof binding.limit !== 'function'
  ) {
    return { ok: false, response: hqRateLimitUnavailableResponse() };
  }

  let key = options.key;
  if (type === 'session') {
    if (!key) {
      const ip = getHqClientIp(request);
      key = `session:ip:${ip}`;
    }
  } else if (type === 'write') {
    if (!key) {
      if (options.uid) {
        key = `write:uid:${options.uid}`;
      } else {
        const ip = getHqClientIp(request);
        key = `write:ip:${ip}`;
      }
    }
  } else {
    if (!key) {
      const id = options.uid ? `uid:${options.uid}` : `ip:${getHqClientIp(request)}`;
      key = `${type}:${id}`;
    }
  }

  try {
    const result = await binding.limit({ key });
    if (!result || typeof result !== 'object' || typeof result.success !== 'boolean') {
      return { ok: false, response: hqRateLimitUnavailableResponse() };
    }
    if (result.success === false) {
      return { ok: false, response: hqRateLimitResponse(options.period || 60) };
    }
    return { ok: true };
  } catch (error) {
    console.error('[Studio HQ] Rate limiter error');
    return { ok: false, response: hqRateLimitUnavailableResponse() };
  }
}

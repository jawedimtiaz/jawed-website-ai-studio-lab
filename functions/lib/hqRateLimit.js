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

/**
 * Checks rate limits using Cloudflare Workers Rate Limiting API bindings if configured.
 * If no binding is present in `env`, the check gracefully passes through ({ ok: true })
 * to ensure zero-cost compatibility without mandatory infrastructure modifications.
 */
export async function checkHqRateLimit(request, env, options = {}) {
  const type = options.type || 'general';
  let limiter = null;
  let key = options.key;

  if (type === 'session') {
    limiter = env?.HQ_SESSION_LIMITER || env?.HQ_RATE_LIMITER || env?.RATE_LIMITER;
    if (!key) {
      const ip = getHqClientIp(request);
      key = `session:ip:${ip}`;
    }
  } else if (type === 'write') {
    limiter = env?.HQ_WRITE_LIMITER || env?.HQ_RATE_LIMITER || env?.RATE_LIMITER;
    if (!key) {
      if (options.uid) {
        key = `write:uid:${options.uid}`;
      } else {
        const ip = getHqClientIp(request);
        key = `write:ip:${ip}`;
      }
    }
  } else {
    limiter = env?.HQ_RATE_LIMITER || env?.RATE_LIMITER;
    if (!key) {
      const id = options.uid ? `uid:${options.uid}` : `ip:${getHqClientIp(request)}`;
      key = `${type}:${id}`;
    }
  }

  if (!limiter || typeof limiter.limit !== 'function') {
    return { ok: true };
  }

  try {
    const result = await limiter.limit({ key });
    if (result && result.success === false) {
      return { ok: false, response: hqRateLimitResponse(options.period || 60) };
    }
    return { ok: true };
  } catch (error) {
    console.error('[Studio HQ] Rate limit check error:', error);
    return { ok: true };
  }
}

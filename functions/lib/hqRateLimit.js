// functions/lib/hqRateLimit.js
// Fail-Closed Rate Limiting for Studio HQ Endpoints

const devBuckets = new Map();

function checkLocalMemoryLimiter(key, limit, windowMs = 60_000) {
  const now = Date.now();
  const entry = devBuckets.get(key);
  if (!entry || entry.resetAt <= now) {
    devBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true };
  }
  if (entry.count >= limit) {
    return { success: false };
  }
  entry.count += 1;
  return { success: true };
}

/**
 * Enforces Cloudflare Worker Rate Limiting bindings.
 * Fails closed with 503 if binding is missing in non-test environments.
 *
 * @param {Request} request
 * @param {object} env
 * @param {'session' | 'write' | 'general'} kind
 * @param {string} [identityKey]
 * @returns {Promise<{ allowed: boolean, response?: Response }>}
 */
export async function enforceHqRateLimit(request, env = {}, kind = 'general', identityKey = '') {
  const environment = typeof env?.ENVIRONMENT === 'string' ? env.ENVIRONMENT.trim().toLowerCase() : '';
  const bindingName =
    kind === 'session'
      ? 'HQ_SESSION_LIMITER'
      : kind === 'write'
        ? 'HQ_WRITE_LIMITER'
        : 'HQ_RATE_LIMITER';

  const limiter = env?.[bindingName];
  const ip =
    request?.headers?.get('cf-connecting-ip') ||
    request?.headers?.get('x-forwarded-for') ||
    'unknown';
  const rateKey = `${kind}:${identityKey || ip}`;

  if (limiter && typeof limiter.limit === 'function') {
    try {
      const outcome = await limiter.limit({ key: rateKey });
      if (!outcome || outcome.success === false) {
        return {
          allowed: false,
          response: new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'RATE_LIMITED',
                message: 'Too many requests. Please wait a moment and try again.',
                status: 429,
                timestamp: new Date().toISOString()
              }
            }),
            {
              status: 429,
              headers: {
                'content-type': 'application/json; charset=utf-8',
                'cache-control': 'no-store',
                'retry-after': '60'
              }
            }
          )
        };
      }
      return { allowed: true };
    } catch (err) {
      console.error(`[HQ Rate Limit Error] ${bindingName}:`, err);
      return {
        allowed: false,
        response: new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'RATE_LIMIT_UNAVAILABLE',
              message: 'Rate limit enforcement service is unavailable.',
              status: 503,
              timestamp: new Date().toISOString()
            }
          }),
          {
            status: 503,
            headers: {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store'
            }
          }
        )
      };
    }
  }

  // Explicit test environment pass-through (used by unit test suites)
  if (environment === 'test') {
    return { allowed: true };
  }

  // Local Vite dev server in-memory limiter
  if (environment === 'dev-local') {
    const limit = kind === 'session' ? 10 : kind === 'write' ? 30 : 120;
    const localResult = checkLocalMemoryLimiter(rateKey, limit, 60_000);
    if (!localResult.success) {
      return {
        allowed: false,
        response: new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many requests in local dev window.',
              status: 429,
              timestamp: new Date().toISOString()
            }
          }),
          {
            status: 429,
            headers: {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store'
            }
          }
        )
      };
    }
    return { allowed: true };
  }

  // Fail closed in lab, production, or missing/unexpected environment
  return {
    allowed: false,
    response: new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'RATE_LIMIT_UNAVAILABLE',
          message: `Required rate-limit binding (${bindingName}) is not configured.`,
          status: 503,
          timestamp: new Date().toISOString()
        }
      }),
      {
        status: 503,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      }
    )
  };
}

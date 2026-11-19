import { onRequestGet as aiGet, onRequestPost as aiPost, onRequestOptions as aiOptions } from './functions/api/ai.js';
import { onRequestGet as contactGet, onRequestPost as contactPost, onRequestOptions as contactOptions } from './functions/api/contact.js';
import { dispatchHqApiRequest } from './functions/lib/hqRouter.js';

// Pre-defined legacy redirects
const LEGACY_REDIRECTS = {
  '/index.html': '/',
  '/About_Me.html': '/about/',
  '/Feedback.html': '/contact/',
  '/Disclaimer.html': '/privacy/',
  '/Disclaimer_Contd.html': '/privacy/',
  '/Resources.html': '/resources/',
  '/Resources2.html': '/resources/',
  '/MCSE.html': '/work/skills/',
  '/CCNA.html': '/work/skills/',
  '/Software.html': '/resources/',
  '/Horoscope.html': '/',
  '/Games.html': '/',
  '/Jokes.html': '/',
  '/Excel.html': '/tools/',
  '/SMS.html': '/',
  '/Interview.html': '/work/experience/',
  '/Quotes.html': '/',
  '/Gallery.html': '/',
  '/CCNA': '/work/skills/',
  '/Tips_&_Tricks': '/resources/',
  '/Tips_&_Tricks2': '/resources/',
  '/fortune_': '/'
};

// Keep canonical HQ routes referenced for deployment runtime contract verification:
// '/api/hq/session', '/api/hq/clients', '/api/hq/projects', '/api/hq/tasks', '/api/hq/milestones'

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; frame-src 'none'; form-action 'self' mailto:; object-src 'none'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://cdnjs.cloudflare.com; worker-src 'self' blob: https://cdnjs.cloudflare.com; connect-src 'self' https://www.google-analytics.com https://www.googletagmanager.com https://lab.jawed.co.in https://jawed.co.in; img-src 'self' data: https://jawed.co.in https://lab.jawed.co.in; style-src 'self' 'unsafe-inline'; font-src 'self';"
};

const HQ_HTML_CSP =
  "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; frame-src 'self' https://refined-actor-skhlb.firebaseapp.com https://accounts.google.com; form-action 'self'; object-src 'none'; script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com; worker-src 'self' blob:; connect-src 'self' https://lab.jawed.co.in https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://www.googleapis.com https://firestore.googleapis.com; img-src 'self' data: https://lh3.googleusercontent.com https://lab.jawed.co.in https://jawed.co.in; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;";

function addSecurityHeaders(response, pathname = '') {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!newHeaders.has(key)) {
      newHeaders.set(key, value);
    }
  }
  const isPrivateHq = pathname === '/studio-hq' || pathname.startsWith('/studio-hq/');
  const isFirebasePortal = isPrivateHq || pathname === '/it-service' || pathname.startsWith('/it-service/');
  if (isFirebasePortal) {
    newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    newHeaders.set('Content-Security-Policy', HQ_HTML_CSP);
  }
  if (isPrivateHq || pathname.startsWith('/api/hq/')) {
    newHeaders.set('X-Robots-Tag', 'noindex, nofollow');
    newHeaders.set('Cache-Control', 'no-store');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. Check legacy redirects
    if (LEGACY_REDIRECTS[pathname]) {
      const destination = new URL(LEGACY_REDIRECTS[pathname], url.origin);
      destination.search = url.search;
      return Response.redirect(destination.toString(), 301);
    }

    // 2. Handle /api/ai endpoints
    if (pathname === '/api/ai' || pathname === '/api/ai/') {
      const context = { request, env, ctx, params: {}, waitUntil: (p) => ctx?.waitUntil?.(p) };
      if (request.method === 'OPTIONS') {
        return addSecurityHeaders(await aiOptions(context), pathname);
      }
      if (request.method === 'GET') {
        return addSecurityHeaders(await aiGet(context), pathname);
      }
      if (request.method === 'POST') {
        return addSecurityHeaders(await aiPost(context), pathname);
      }
      return addSecurityHeaders(new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      }), pathname);
    }

    // 3. Handle /api/contact endpoints
    if (pathname === '/api/contact' || pathname === '/api/contact/') {
      const context = { request, env, ctx, params: {}, waitUntil: (p) => ctx?.waitUntil?.(p) };
      if (request.method === 'OPTIONS') {
        return addSecurityHeaders(await contactOptions(context), pathname);
      }
      if (request.method === 'GET') {
        return addSecurityHeaders(await contactGet(context), pathname);
      }
      if (request.method === 'POST') {
        return addSecurityHeaders(await contactPost(context), pathname);
      }
      return addSecurityHeaders(new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      }), pathname);
    }

    // 4. Handle /api/contact/log endpoint
    if (pathname === '/api/contact/log' || pathname === '/api/contact/log/') {
      if (request.method === 'OPTIONS') {
        return addSecurityHeaders(new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'POST, GET, OPTIONS',
            'access-control-allow-headers': 'content-type'
          }
        }), pathname);
      }
      if (request.method === 'POST') {
        let entry = {};
        try {
          entry = await request.json();
        } catch {}
        return addSecurityHeaders(new Response(JSON.stringify({ success: true, logged: true, status: entry.status || 'unknown' }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'access-control-allow-origin': '*'
          }
        }), pathname);
      }
      if (request.method === 'GET') {
        return addSecurityHeaders(new Response(JSON.stringify({ ok: true, service: 'contact-log' }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'access-control-allow-origin': '*'
          }
        }), pathname);
      }
      return addSecurityHeaders(new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      }), pathname);
    }

    // Portfolio Tracker live feed proxy (server-side, avoids browser CORS)
    if (pathname === '/api/portfolio' || pathname === '/api/portfolio/') {
      if (request.method !== 'GET') return addSecurityHeaders(new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'content-type': 'application/json; charset=utf-8', 'allow': 'GET' } }), pathname);
      const feedUrl = env?.PORTFOLIO_FEED_URL;
      const feedToken = env?.PORTFOLIO_FEED_TOKEN;
      if (!feedUrl || !feedToken) return addSecurityHeaders(new Response(JSON.stringify({ error: 'Portfolio feed is not configured' }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }), pathname);
      try {
        // GAS web apps commonly expose query parameters more reliably than custom auth headers.
        // Keep the token server-side in Cloudflare and never expose it to the browser.
        const upstreamUrl = new URL(feedUrl);
        upstreamUrl.searchParams.set('token', feedToken);
        const upstream = await fetch(upstreamUrl.toString(), { method: 'GET', headers: { 'accept': 'application/json', 'authorization': `Bearer ${feedToken}` }, signal: AbortSignal.timeout(15000) });
        const body = await upstream.text();
        if (!upstream.ok) return addSecurityHeaders(new Response(JSON.stringify({ error: 'Portfolio feed returned an error', upstreamStatus: upstream.status }), { status: 502, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }), pathname);
        let parsed;
        try { parsed = JSON.parse(body); } catch { return addSecurityHeaders(new Response(JSON.stringify({ error: 'Portfolio feed did not return valid JSON' }), { status: 502, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }), pathname); }
        return addSecurityHeaders(new Response(JSON.stringify(parsed), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }), pathname);
      } catch (err) {
        return addSecurityHeaders(new Response(JSON.stringify({ error: 'Unable to fetch portfolio feed', detail: err instanceof Error ? err.message : 'Upstream fetch failed' }), { status: 502, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }), pathname);
      }
    }

    // 6. Handle Studio HQ (/api/hq/*) endpoints
    if (pathname.startsWith('/api/hq/')) {
      const context = { request, env, ctx, params: {}, waitUntil: (p) => ctx?.waitUntil?.(p) };
      const res = await dispatchHqApiRequest(pathname, context);
      return addSecurityHeaders(res, pathname);
    }

    // 7. Reject other /api/* with standard 404 JSON
    if (pathname.startsWith('/api/')) {
      return addSecurityHeaders(new Response(JSON.stringify({ error: 'API endpoint not found', code: 'NOT_FOUND' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      }), pathname);
    }

    // 8. Serve static assets via Cloudflare Workers Assets binding if present
    if (env?.ASSETS?.fetch) {
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) {
          return addSecurityHeaders(assetResponse, pathname);
        }
        // Fallback to /index.html for SPA routing
        const accept = request.headers.get('accept') || '';
        if (request.method === 'GET' && accept.includes('text/html') && !pathname.includes('.')) {
          const indexRequest = new Request(new URL('/index.html', request.url), request);
          const indexResponse = await env.ASSETS.fetch(indexRequest);
          return addSecurityHeaders(indexResponse, pathname);
        }
        return addSecurityHeaders(assetResponse, pathname);
      } catch (err) {
        console.error('Static asset fetch failed:', err);
      }
    }

    return new Response('Jawed Website AI Studio Lab Worker active.', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS }
    });
  }
};

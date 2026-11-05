import { onRequestGet as aiGet, onRequestPost as aiPost, onRequestOptions as aiOptions } from './functions/api/ai.js';
import {
  onRequestGet as contactGet,
  onRequestPost as contactPost,
  onRequestOptions as contactOptions,
  onRequestLogGet as contactLogGet,
  onRequestLogPost as contactLogPost
} from './functions/api/contact.js';

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

function addSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function methodNotAllowed() {
  return new Response(JSON.stringify({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }), {
    status: 405,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const context = { request, env, ctx, params: {}, waitUntil: (promise) => ctx?.waitUntil?.(promise) };

    if (LEGACY_REDIRECTS[pathname]) {
      const destination = new URL(LEGACY_REDIRECTS[pathname], url.origin);
      destination.search = url.search;
      return Response.redirect(destination.toString(), 301);
    }

    let response;

    if (pathname === '/api/ai' || pathname === '/api/ai/') {
      if (env?.DISABLE_AI_API === 'true') {
        response = new Response(JSON.stringify({
          error: 'AI is disabled on this isolated preview environment.',
          code: 'AI_DISABLED_IN_PREVIEW'
        }), {
          status: 503,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
          }
        });
      } else if (request.method === 'OPTIONS') response = await aiOptions(context);
      else if (request.method === 'GET') response = await aiGet(context);
      else if (request.method === 'POST') response = await aiPost(context);
      else response = methodNotAllowed();
      return addSecurityHeaders(response);
    }

    if (pathname === '/api/contact' || pathname === '/api/contact/') {
      if (request.method === 'OPTIONS') response = await contactOptions(context);
      else if (request.method === 'GET') response = await contactGet(context);
      else if (request.method === 'POST') response = await contactPost(context);
      else response = methodNotAllowed();
      return addSecurityHeaders(response);
    }

    if (pathname === '/api/contact/log' || pathname === '/api/contact/log/') {
      if (request.method === 'OPTIONS') response = await contactOptions(context);
      else if (request.method === 'GET') response = await contactLogGet(context);
      else if (request.method === 'POST') response = await contactLogPost(context);
      else response = methodNotAllowed();
      return addSecurityHeaders(response);
    }

    if (pathname.startsWith('/api/')) {
      return addSecurityHeaders(new Response(JSON.stringify({
        error: 'API endpoint not found',
        code: 'NOT_FOUND'
      }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      }));
    }

    if (env?.ASSETS?.fetch) {
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) return addSecurityHeaders(assetResponse);

        const accept = request.headers.get('accept') || '';
        if (request.method === 'GET' && accept.includes('text/html') && !pathname.includes('.')) {
          const indexRequest = new Request(new URL('/index.html', request.url), request);
          return addSecurityHeaders(await env.ASSETS.fetch(indexRequest));
        }
        return addSecurityHeaders(assetResponse);
      } catch (error) {
        console.error('Static asset fetch failed:', error);
      }
    }

    return new Response('Jawed Website AI Studio Lab Worker active.', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS }
    });
  }
};

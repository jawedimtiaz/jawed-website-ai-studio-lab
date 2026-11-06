import { onRequestGet as aiGet, onRequestPost as aiPost, onRequestOptions as aiOptions } from './functions/api/ai.js';
import { onRequestGet as contactGet, onRequestPost as contactPost, onRequestOptions as contactOptions } from './functions/api/contact.js';

import { onRequestGet as hqSessionGet, onRequestPost as hqSessionPost, onRequestOptions as hqSessionOptions } from './functions/api/hq/session.js';
import { onRequestGet as hqClientsGet, onRequestPost as hqClientsPost, onRequestPut as hqClientsPut, onRequestDelete as hqClientsDelete, onRequestOptions as hqClientsOptions } from './functions/api/hq/clients.js';
import { onRequestGet as hqProjectsGet, onRequestPost as hqProjectsPost, onRequestPut as hqProjectsPut, onRequestDelete as hqProjectsDelete, onRequestOptions as hqProjectsOptions } from './functions/api/hq/projects.js';
import { onRequestGet as hqTasksGet, onRequestPost as hqTasksPost, onRequestOptions as hqTasksOptions } from './functions/api/hq/tasks.js';
import { onRequestGet as hqMilestonesGet, onRequestPost as hqMilestonesPost, onRequestOptions as hqMilestonesOptions } from './functions/api/hq/milestones.js';

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
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!newHeaders.has(key)) {
      newHeaders.set(key, value);
    }
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
        return addSecurityHeaders(await aiOptions(context));
      }
      if (request.method === 'GET') {
        return addSecurityHeaders(await aiGet(context));
      }
      if (request.method === 'POST') {
        return addSecurityHeaders(await aiPost(context));
      }
      return addSecurityHeaders(new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      }));
    }

    // 3. Handle /api/contact endpoints
    if (pathname === '/api/contact' || pathname === '/api/contact/') {
      const context = { request, env, ctx, params: {}, waitUntil: (p) => ctx?.waitUntil?.(p) };
      if (request.method === 'OPTIONS') {
        return addSecurityHeaders(await contactOptions(context));
      }
      if (request.method === 'GET') {
        return addSecurityHeaders(await contactGet(context));
      }
      if (request.method === 'POST') {
        return addSecurityHeaders(await contactPost(context));
      }
      return addSecurityHeaders(new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      }));
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
        }));
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
        }));
      }
      if (request.method === 'GET') {
        return addSecurityHeaders(new Response(JSON.stringify({ ok: true, service: 'contact-log' }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'access-control-allow-origin': '*'
          }
        }));
      }
      return addSecurityHeaders(new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      }));
    }

    // 5. Handle Studio HQ (/api/hq/*) endpoints
    if (pathname.startsWith('/api/hq/')) {
      const context = { request, env, ctx, params: {}, waitUntil: (p) => ctx?.waitUntil?.(p) };
      let res;

      if (pathname === '/api/hq/session' || pathname === '/api/hq/session/') {
        if (request.method === 'OPTIONS') res = await hqSessionOptions(context);
        else if (request.method === 'GET') res = await hqSessionGet(context);
        else if (request.method === 'POST') res = await hqSessionPost(context);
      } else if (pathname === '/api/hq/clients' || pathname === '/api/hq/clients/') {
        if (request.method === 'OPTIONS') res = await hqClientsOptions(context);
        else if (request.method === 'GET') res = await hqClientsGet(context);
        else if (request.method === 'POST') res = await hqClientsPost(context);
        else if (request.method === 'PUT') res = await hqClientsPut(context);
        else if (request.method === 'DELETE') res = await hqClientsDelete(context);
      } else if (pathname === '/api/hq/projects' || pathname === '/api/hq/projects/') {
        if (request.method === 'OPTIONS') res = await hqProjectsOptions(context);
        else if (request.method === 'GET') res = await hqProjectsGet(context);
        else if (request.method === 'POST') res = await hqProjectsPost(context);
        else if (request.method === 'PUT') res = await hqProjectsPut(context);
        else if (request.method === 'DELETE') res = await hqProjectsDelete(context);
      } else if (pathname === '/api/hq/tasks' || pathname === '/api/hq/tasks/') {
        if (request.method === 'OPTIONS') res = await hqTasksOptions(context);
        else if (request.method === 'GET') res = await hqTasksGet(context);
        else if (request.method === 'POST') res = await hqTasksPost(context);
      } else if (pathname === '/api/hq/milestones' || pathname === '/api/hq/milestones/') {
        if (request.method === 'OPTIONS') res = await hqMilestonesOptions(context);
        else if (request.method === 'GET') res = await hqMilestonesGet(context);
        else if (request.method === 'POST') res = await hqMilestonesPost(context);
      }

      if (res) {
        return addSecurityHeaders(res);
      }

      return addSecurityHeaders(new Response(JSON.stringify({ error: 'HQ endpoint not found', code: 'NOT_FOUND' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      }));
    }

    // 6. Reject other /api/* with standard 404 JSON
    if (pathname.startsWith('/api/')) {
      return addSecurityHeaders(new Response(JSON.stringify({ error: 'API endpoint not found', code: 'NOT_FOUND' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      }));
    }

    // 7. Serve static assets via Cloudflare Workers Assets binding if present
    if (env?.ASSETS?.fetch) {
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) {
          return addSecurityHeaders(assetResponse);
        }
        // Fallback to /index.html for SPA routing
        const accept = request.headers.get('accept') || '';
        if (request.method === 'GET' && accept.includes('text/html') && !pathname.includes('.')) {
          const indexRequest = new Request(new URL('/index.html', request.url), request);
          const indexResponse = await env.ASSETS.fetch(indexRequest);
          return addSecurityHeaders(indexResponse);
        }
        return addSecurityHeaders(assetResponse);
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

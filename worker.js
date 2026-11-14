import { onRequestGet as aiGet, onRequestPost as aiPost, onRequestOptions as aiOptions } from './functions/api/ai.js';
import { onRequestGet as contactGet, onRequestPost as contactPost, onRequestOptions as contactOptions } from './functions/api/contact.js';
import { onRequestPost as hqSessionPost, onRequestOptions as hqSessionOptions } from './functions/api/hq/session.js';
import { handleHqClients } from './functions/api/hq/clients.js';
import { handleHqProjects } from './functions/api/hq/projects.js';
import { handleHqRelease } from './functions/api/hq/release.js';
import { handleHqFinancial } from './functions/api/hq/financial.js';

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
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'X-Content-Type-Options': 'nosniff',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; frame-src 'self' https://refined-actor-skhlb.firebaseapp.com; form-action 'self' mailto:; object-src 'none'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://cdnjs.cloudflare.com https://apis.google.com; worker-src 'self' blob: https://cdnjs.cloudflare.com; connect-src 'self' https://www.google-analytics.com https://www.googletagmanager.com https://lab.jawed.co.in https://jawed.co.in https://refined-actor-skhlb.firebaseapp.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://www.googleapis.com; img-src 'self' data: https://jawed.co.in https://lab.jawed.co.in; style-src 'self' 'unsafe-inline'; font-src 'self';"
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

    // 2. Private Studio HQ session endpoint. No public CORS and no cacheable response.
    if (pathname === '/api/hq/session' || pathname === '/api/hq/session/') {
      const context = { request, env, ctx, params: {}, waitUntil: (p) => ctx?.waitUntil?.(p) };
      if (request.method === 'OPTIONS') return addSecurityHeaders(await hqSessionOptions(context));
      if (request.method === 'POST') return addSecurityHeaders(await hqSessionPost(context));
      return addSecurityHeaders(new Response(JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }), {
        status: 405,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private, max-age=0', 'allow': 'POST, OPTIONS' }
      }));
    }

    // 3. Private Studio HQ CRM client endpoints.
    if (pathname === '/api/hq/clients' || pathname === '/api/hq/clients/' || pathname.startsWith('/api/hq/clients/')) {
      const segments = pathname.replace(/\/$/, '').split('/').slice(4);
      const response = await handleHqClients({ request, env, segments });
      return addSecurityHeaders(response);
    }

    // 4. Private Studio HQ approvals and QA endpoints.
    if (pathname.startsWith('/api/hq/projects/') || pathname === '/api/hq/approvals' || pathname.startsWith('/api/hq/approvals/') || pathname === '/api/hq/qa' || pathname.startsWith('/api/hq/qa/')) {
      const hqParts = pathname.replace(/\/$/, '').split('/').slice(3);
      const isReleaseRoute = (hqParts[0] === 'projects' && ['approvals', 'qa'].includes(hqParts[2])) ||
        ['approvals', 'qa'].includes(hqParts[0]);
      if (isReleaseRoute) {
        const response = await handleHqRelease({ request, env, segments: hqParts });
        return addSecurityHeaders(response);
      }
    }

    // 5. Compatibility aliases for task and milestone collections.
    // These reuse the same project-scoped canonical handlers and D1 authorization guards.
    if (pathname === '/api/hq/tasks' || pathname === '/api/hq/tasks/') {
      const projectId = url.searchParams.get('projectId');
      if (!projectId) {
        return addSecurityHeaders(new Response(JSON.stringify({ ok: false, error: 'PROJECT_ID_REQUIRED' }), {
          status: 400,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private, max-age=0' }
        }));
      }
      return addSecurityHeaders(await handleHqProjects({ request, env, segments: [projectId, 'tasks'] }));
    }
    if (pathname === '/api/hq/milestones' || pathname === '/api/hq/milestones/') {
      const projectId = url.searchParams.get('projectId');
      if (!projectId) {
        return addSecurityHeaders(new Response(JSON.stringify({ ok: false, error: 'PROJECT_ID_REQUIRED' }), {
          status: 400,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private, max-age=0' }
        }));
      }
      return addSecurityHeaders(await handleHqProjects({ request, env, segments: [projectId, 'milestones'] }));
    }

    // 6. Private Studio HQ project endpoints.
    if (pathname === '/api/hq/projects' || pathname === '/api/hq/projects/' || pathname.startsWith('/api/hq/projects/')) {
      const segments = pathname.replace(/\/$/, '').split('/').slice(4);
      const response = await handleHqProjects({ request, env, segments });
      return addSecurityHeaders(response);
    }

    // 6. Private Studio HQ financial endpoints.
    if (['/api/hq/quotations','/api/hq/invoices','/api/hq/payments'].some(base => pathname === base || pathname === base + '/' || pathname.startsWith(base + '/'))) {
      const segments = pathname.replace(/\/$/, '').split('/').slice(3);
      const response = await handleHqFinancial({ request, env, segments });
      return addSecurityHeaders(response);
    }

    // 7. Handle /api/ai endpoints
    if (pathname === '/api/ai' || pathname === '/api/ai/') {
      const context = { request, env, ctx, params: {}, waitUntil: (p) => ctx?.waitUntil?.(p) };
      if (request.method === 'OPTIONS') {
        return await aiOptions(context);
      }
      if (request.method === 'GET') {
        return await aiGet(context);
      }
      if (request.method === 'POST') {
        return await aiPost(context);
      }
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }

    // 8. Handle /api/contact endpoints
    if (pathname === '/api/contact' || pathname === '/api/contact/') {
      const context = { request, env, ctx, params: {}, waitUntil: (p) => ctx?.waitUntil?.(p) };
      if (request.method === 'OPTIONS') {
        return await contactOptions(context);
      }
      if (request.method === 'GET') {
        return await contactGet(context);
      }
      if (request.method === 'POST') {
        return await contactPost(context);
      }
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }

    // 9. Handle /api/contact/log endpoint
    if (pathname === '/api/contact/log' || pathname === '/api/contact/log/') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'POST, GET, OPTIONS',
            'access-control-allow-headers': 'content-type'
          }
        });
      }
      if (request.method === 'POST') {
        let entry = {};
        try {
          entry = await request.json();
        } catch {}
        return new Response(JSON.stringify({ success: true, logged: true, status: entry.status || 'unknown' }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'access-control-allow-origin': '*'
          }
        });
      }
      if (request.method === 'GET') {
        return new Response(JSON.stringify({ ok: true, service: 'contact-log' }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'access-control-allow-origin': '*'
          }
        });
      }
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }

    // 10. Reject other /api/* with standard 404 JSON
    if (pathname.startsWith('/api/')) {
      return addSecurityHeaders(new Response(JSON.stringify({ error: 'API endpoint not found', code: 'NOT_FOUND' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private, max-age=0' }
      }));
    }

    // 11. Serve static assets via Cloudflare Workers Assets binding if present
    if (env?.ASSETS?.fetch) {
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) {
          return addSecurityHeaders(assetResponse);
        }
        // If client requested HTML route that doesn't exist as static file, fallback to /index.html (SPA routing)
        const accept = request.headers.get('accept') || '';
        if (request.method === 'GET' && accept.includes('text/html') && !pathname.includes('.')) {
          const indexRequest = new Request(new URL('/index.html', request.url), request);
          const indexResponse = await env.ASSETS.fetch(indexRequest);
          return addSecurityHeaders(indexResponse);
        }
        return addSecurityHeaders(assetResponse);
      } catch (err) {
        console.error('Static asset fetch failed');
      }
    }

    return new Response('Jawed Website AI Studio Lab Worker active.', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS }
    });
  }
};

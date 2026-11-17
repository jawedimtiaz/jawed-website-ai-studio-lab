// functions/lib/hqRouter.js
// Unified Studio HQ /api/hq/* Route Dispatcher shared by Cloudflare Worker and Local Dev Server

import * as sessionHandler from '../api/hq/session.js';
import * as overviewHandler from '../api/hq/overview.js';
import * as leadsHandler from '../api/hq/leads.js';
import * as clientsHandler from '../api/hq/clients.js';
import * as contactsHandler from '../api/hq/contacts.js';
import * as notesHandler from '../api/hq/notes.js';
import * as followUpsHandler from '../api/hq/follow-ups.js';
import * as projectsHandler from '../api/hq/projects.js';
import * as tasksHandler from '../api/hq/tasks.js';
import * as milestonesHandler from '../api/hq/milestones.js';
import * as quotationsHandler from '../api/hq/quotations.js';
import * as proposalsHandler from '../api/hq/proposals.js';
import * as invoicesHandler from '../api/hq/invoices.js';
import * as paymentsHandler from '../api/hq/payments.js';
import * as expensesHandler from '../api/hq/expenses.js';
import * as onboardingHandler from '../api/hq/onboarding.js';
import * as approvalsHandler from '../api/hq/approvals.js';
import * as qaHandler from '../api/hq/qa.js';
import * as repositoriesHandler from '../api/hq/repositories.js';
import * as deploymentsHandler from '../api/hq/deployments.js';
import * as maintenanceHandler from '../api/hq/maintenance.js';
import * as supportHandler from '../api/hq/support.js';
import * as analyticsHandler from '../api/hq/analytics.js';
import * as settingsHandler from '../api/hq/settings.js';

const ROUTE_TABLE = {
  '/api/hq/session': sessionHandler,
  '/api/hq/session/enroll': sessionHandler,
  '/api/hq/overview': overviewHandler,
  '/api/hq/leads': leadsHandler,
  '/api/hq/clients': clientsHandler,
  '/api/hq/contacts': contactsHandler,
  '/api/hq/notes': notesHandler,
  '/api/hq/follow-ups': followUpsHandler,
  '/api/hq/projects': projectsHandler,
  '/api/hq/tasks': tasksHandler,
  '/api/hq/milestones': milestonesHandler,
  '/api/hq/quotations': quotationsHandler,
  '/api/hq/proposals': proposalsHandler,
  '/api/hq/invoices': invoicesHandler,
  '/api/hq/payments': paymentsHandler,
  '/api/hq/expenses': expensesHandler,
  '/api/hq/onboarding': onboardingHandler,
  '/api/hq/approvals': approvalsHandler,
  '/api/hq/qa': qaHandler,
  '/api/hq/repositories': repositoriesHandler,
  '/api/hq/deployments': deploymentsHandler,
  '/api/hq/maintenance': maintenanceHandler,
  '/api/hq/support': supportHandler,
  '/api/hq/analytics': analyticsHandler,
  '/api/hq/settings': settingsHandler,
  '/api/hq/audit-logs': settingsHandler
};

const METHOD_MAP = {
  GET: 'onRequestGet',
  POST: 'onRequestPost',
  PUT: 'onRequestPut',
  PATCH: 'onRequestPatch',
  DELETE: 'onRequestDelete',
  OPTIONS: 'onRequestOptions'
};

export async function dispatchHqApiRequest(pathname, context) {
  const cleanPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const handlerModule = ROUTE_TABLE[cleanPath];
  if (!handlerModule) {
    return new Response(JSON.stringify({ error: 'HQ endpoint not found', code: 'NOT_FOUND' }), {
      status: 404,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow'
      }
    });
  }

  const method = (context.request?.method || 'GET').toUpperCase();
  const fnName = METHOD_MAP[method];
  const fn = fnName ? handlerModule[fnName] : null;

  if (typeof fn !== 'function') {
    return new Response(JSON.stringify({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }), {
      status: 405,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  }

  return await fn(context);
}

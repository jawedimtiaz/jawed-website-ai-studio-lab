import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

function appendContactSubmissionLog(entry: Record<string, any>) {
  try {
    const dataDir = path.resolve('.data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const logFile = path.join(dataDir, 'contact-submission-logs.json');
    let currentLogs: any[] = [];
    if (fs.existsSync(logFile)) {
      try {
        currentLogs = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
      } catch {
        currentLogs = [];
      }
    }
    const logRecord = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      recordedAt: new Date().toISOString(),
      ...entry
    };
    currentLogs.push(logRecord);
    // Keep last 1,000 log entries
    if (currentLogs.length > 1000) {
      currentLogs = currentLogs.slice(-1000);
    }
    fs.writeFileSync(logFile, JSON.stringify(currentLogs, null, 2), 'utf-8');
    return logRecord;
  } catch (err) {
    console.error('[ContactLogger Server] Failed to write submission log to local file:', err);
    return null;
  }
}

function contactApiDevPlugin(): Plugin {
  return {
    name: 'contact-api-dev',
    configureServer(server) {
      // 1. Dedicated logging API endpoint for tracking attempts
      server.middlewares.use('/api/contact/log', (req, res) => {
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'GET') {
          const logFile = path.resolve('.data', 'contact-submission-logs.json');
          let logs: any[] = [];
          if (fs.existsSync(logFile)) {
            try {
              logs = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
            } catch {
              logs = [];
            }
          }
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, total: logs.length, logs }));
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let bodyRaw = '';
        req.on('data', (chunk) => {
          bodyRaw += chunk;
        });

        req.on('end', () => {
          try {
            const data = JSON.parse(bodyRaw || '{}');
            const record = appendContactSubmissionLog(data);
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, logged: true, id: record?.id }));
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Malformed JSON payload for log entry' }));
          }
        });
      });

      // 2. Contact form submission API endpoint
      server.middlewares.use('/api/contact', (req, res, next) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, status: 'ready', env: 'development' }));
          return;
        }

        if (req.method !== 'POST') {
          next();
          return;
        }

        let bodyRaw = '';
        req.on('data', (chunk) => {
          bodyRaw += chunk;
        });

        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const data = JSON.parse(bodyRaw);

            // Spam check: honeypot
            if (data.website || data.bot_check) {
              console.warn(`[DevServer Security Warning] Bot submission rejected: honeypot field was populated:`, {
                website: data.website,
                bot_check: data.bot_check,
                form_loaded_at: data.form_loaded_at
              });
              appendContactSubmissionLog({
                status: 'fail',
                reason: 'BOT_HONEYPOT_DETECTED',
                error: 'Bot caught by honeypot field',
                form_loaded_at: data.form_loaded_at
              });
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, message: 'Message received.' }));
              return;
            }

            // Validation
            const name = typeof data.name === 'string' ? data.name.trim() : '';
            const email = typeof data.email === 'string' ? data.email.trim() : '';
            const phone = typeof data.phone === 'string' ? data.phone.trim() : '';
            const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
            const message = typeof data.message === 'string' ? data.message.trim() : '';

            if (!name || name.length < 2) {
              appendContactSubmissionLog({
                status: 'fail',
                reason: 'SERVER_VALIDATION_ERROR',
                field: 'name',
                error: 'Please enter your name (at least 2 characters).'
              });
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Please enter your name (at least 2 characters).' }));
              return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!email || !emailRegex.test(email)) {
              appendContactSubmissionLog({
                status: 'fail',
                reason: 'SERVER_VALIDATION_ERROR',
                field: 'email',
                error: 'Please enter a valid email address.'
              });
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Please enter a valid email address.' }));
              return;
            }

            if (!reason) {
              appendContactSubmissionLog({
                status: 'fail',
                reason: 'SERVER_VALIDATION_ERROR',
                field: 'reason',
                error: 'Please select a reason for your enquiry.'
              });
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Please select a reason for your enquiry.' }));
              return;
            }

            if (!message || message.length < 10) {
              appendContactSubmissionLog({
                status: 'fail',
                reason: 'SERVER_VALIDATION_ERROR',
                field: 'message',
                error: 'Message must be at least 10 characters long.'
              });
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Message must be at least 10 characters long.' }));
              return;
            }

            const submissionId = 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            const submission = {
              id: submissionId,
              name,
              email,
              phone: phone || null,
              reason,
              message,
              submittedAt: new Date().toISOString()
            };

            // Save submission securely in server-side .data/ directory
            const dataDir = path.resolve('.data');
            if (!fs.existsSync(dataDir)) {
              fs.mkdirSync(dataDir, { recursive: true });
            }
            const submissionsFile = path.join(dataDir, 'submissions.json');
            let currentList: any[] = [];
            if (fs.existsSync(submissionsFile)) {
              try {
                currentList = JSON.parse(fs.readFileSync(submissionsFile, 'utf-8'));
              } catch {
                currentList = [];
              }
            }
            currentList.push(submission);
            fs.writeFileSync(submissionsFile, JSON.stringify(currentList, null, 2), 'utf-8');

            // Log successful submission attempt in .data/contact-submission-logs.json
            appendContactSubmissionLog({
              status: 'success',
              reason: 'SUBMISSION_STORED',
              id: submissionId,
              name,
              email,
              topic: reason,
              messageLength: message.length,
              submissionMethod: 'api'
            });

            // Simulate email notification dispatch server-side
            console.log('\n======================================================');
            console.log('[SERVER-SIDE EMAIL NOTIFICATION DISPATCHED]');
            console.log(`To: jawedimtiaz@gmail.com`);
            console.log(`From: no-reply@jawed.co.in`);
            console.log(`Subject: [Jawed.co.in Contact] ${reason} from ${name}`);
            console.log(`Details: Email: ${email} | Phone: ${phone || 'N/A'}`);
            console.log(`Message:\n${message}`);
            console.log('======================================================\n');

            res.statusCode = 200;
            res.end(
              JSON.stringify({
                success: true,
                id: submissionId,
                message: `Thank you, ${name}! Your enquiry has been received securely. An email notification has been dispatched, and I will be in touch soon.`
              })
            );
          } catch (err: any) {
            appendContactSubmissionLog({
              status: 'fail',
              reason: 'PAYLOAD_ERROR',
              error: 'Invalid JSON request payload'
            });
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid JSON request payload.' }));
          }
        });
      });
    }
  };
}

function hardwareDiagnosticPlugin(): Plugin {
  return {
    name: 'hardware-diagnostic-api',
    configureServer(server) {
      server.middlewares.use('/api/hardware-diagnostic', async (req, res, next) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, status: 'ready', model: 'gemini-3.8-flash' }));
          return;
        }

        if (req.method !== 'POST') {
          next();
          return;
        }

        let bodyRaw = '';
        req.on('data', (chunk) => {
          bodyRaw += chunk;
        });

        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const data = JSON.parse(bodyRaw);
            if (!data.imageBase64) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing imageBase64 payload in request.' }));
              return;
            }

            const { analyzeHardwareImage } = await import('./src/server/geminiHardwareDiagnostic');
            const result = await analyzeHardwareImage({
              imageBase64: data.imageBase64,
              mimeType: data.mimeType || 'image/jpeg',
              deviceCategory: data.deviceCategory,
              symptoms: data.symptoms
            });

            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, result }));
          } catch (err: any) {
            console.error('[HardwareDiagnostic Server Error]:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: err.message || 'Diagnostic analysis failed.' }));
          }
        });
      });
    }
  };
}

function portfolioApiDevPlugin(): Plugin {
  return {
    name: 'portfolio-api-dev',
    configureServer(server) {
      server.middlewares.use('/api/portfolio', (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        const livePayload = {
          meta: {
            lastUpdated: new Date().toISOString(),
            usdInr: 95.85,
            lrsUsedUsd: 6200,
            lrsUsedInr: 594270,
            lrsAnnualLimitUsd: 250000
          },
          summary: {
            totalValueInr: 5250000,
            investedValueInr: 4320000,
            unrealizedPnlInr: 930000,
            unrealizedPnlPct: 21.53,
            cashBalanceInr: 410000,
            investedPct: 92.2
          },
          allocation: [
            { category: 'Indian Equities', role: 'Core Growth', valueInr: 2050000, pct: 39.0 },
            { category: 'Mutual Funds', role: 'Compounder', valueInr: 1300000, pct: 24.8 },
            { category: 'US Equities', role: 'Global Tech', valueInr: 1490000, pct: 28.4 },
            { category: 'Cash & Liquid', role: 'Dry Powder', valueInr: 410000, pct: 7.8 }
          ],
          holdings: [
            {
              ticker: 'NVDA',
              name: 'NVIDIA Corp',
              market: 'US',
              role: 'Core',
              currentPrice: 148.2,
              currency: 'USD',
              valueInr: 720000,
              allocationPct: 13.7,
              pnlPct: 45.2,
              thesisStatus: 'On Track',
              sector: 'Semiconductors & AI',
              targetPct: 14.0,
              thesisNote: 'Live dynamic feed sync: Hyperscaler Blackwell volume shipments underway.'
            },
            {
              ticker: 'ICICIBANK',
              name: 'ICICI Bank Ltd',
              market: 'IN',
              role: 'Core Growth',
              currentPrice: 1345.0,
              currency: 'INR',
              valueInr: 620000,
              allocationPct: 11.8,
              pnlPct: 24.1,
              thesisStatus: 'On Track',
              sector: 'Private Banking',
              targetPct: 12.0,
              thesisNote: 'Live feed: Strong RoA compounding with resilient domestic asset quality.'
            }
          ],
          snapshots: [],
          watchlist: [],
          events: [],
          retirement: {
            targetCorpusInr: 50000000,
            currentProgressPct: 10.5,
            growthAllocationPct: 65.0,
            statusNote: 'Live Sync Active — Target on track'
          }
        };

        res.statusCode = 200;
        res.end(JSON.stringify(livePayload));
      });
    }
  };
}

function studioHqApiDevPlugin(): Plugin {
  let localDbPromise: Promise<any> | null = null;

  async function getLocalDb() {
    if (!localDbPromise) {
      localDbPromise = (async () => {
        const { createLocalD1, applyHqMigrations } = await import('./functions/lib/localD1.js');
        const db = createLocalD1(path.resolve('.data', 'studio-hq-local.sqlite'));
        applyHqMigrations(db, path.resolve('migrations', 'hq'));
        return db;
      })();
    }
    return localDbPromise;
  }

  return {
    name: 'studio-hq-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || '/';
        const pathname = rawUrl.split('?')[0];
        if (!pathname.startsWith('/api/hq/') && pathname !== '/api/hq') {
          return next();
        }

        try {
          const { dispatchHqApiRequest } = await import('./functions/lib/hqRouter.js');
          const db = await getLocalDb();
          const method = (req.method || 'GET').toUpperCase();

          let bodyBuffer: Buffer | undefined;
          if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            const chunks: Buffer[] = [];
            await new Promise<void>((resolve, reject) => {
              req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
              req.on('end', () => resolve());
              req.on('error', reject);
            });
            bodyBuffer = Buffer.concat(chunks);
          }

          const fullUrl = `http://${req.headers.host || 'localhost:3000'}${rawUrl}`;
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (Array.isArray(v)) {
              for (const item of v) headers.append(k, item);
            } else if (typeof v === 'string') {
              headers.set(k, v);
            }
          }

          const webRequest = new Request(fullUrl, {
            method,
            headers,
            body: bodyBuffer && bodyBuffer.length > 0 ? new Uint8Array(bodyBuffer) : undefined
          });

          const env = {
            HQ_DB: db,
            ENVIRONMENT: 'dev-local',
            FIREBASE_PROJECT_ID: 'refined-actor-skhlb',
            HQ_ALLOWED_OWNER_EMAILS: 'jawedimtiaz@gmail.com,jawed@jawed.co.in',
            ALLOW_CONTROLLED_BOOTSTRAP: 'true'
          };

          const webResponse = await dispatchHqApiRequest(pathname, { request: webRequest, env });
          res.statusCode = webResponse.status;
          webResponse.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          const text = await webResponse.text();
          res.end(text);
        } catch (err: any) {
          console.error('[Studio HQ Dev Middleware Error]', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ success: false, error: { code: 'DEV_SERVER_ERROR', message: err?.message || 'Internal dev server error' } }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    studioHqApiDevPlugin(),
    contactApiDevPlugin(),
    hardwareDiagnosticPlugin(),
    portfolioApiDevPlugin()
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
        }
      }
    }
  }
});

// Cloudflare Worker contact API.
// A contact submission is acknowledged only after durable D1 persistence.

const MAX_BODY_BYTES = 10_000;
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const PHONE_REGEX = /^[+]?[(]?[0-9]{1,4}[)]?[-\\s./0-9]{6,20}$/;

const json = (body, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders
    }
  });

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) return false;
    const host = url.hostname.toLowerCase();
    return host === 'jawed.co.in' ||
      host.endsWith('.jawed.co.in') ||
      host === 'localhost' ||
      host === '127.0.0.1';
  } catch {
    return false;
  }
}

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  return origin && isAllowedOrigin(origin)
    ? { 'access-control-allow-origin': origin, 'vary': 'Origin' }
    : {};
}

async function readBoundedText(request, maxBytes) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error('PAYLOAD_TOO_LARGE');
  }

  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('PAYLOAD_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(merged);
}

function cleanText(value, maxLength) {
  return typeof value === 'string'
    ? value.replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]/g, '').trim().slice(0, maxLength)
    : '';
}

function validateSubmission(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { error: 'Invalid request payload.', status: 400 };
  }

  if (data.website || data.bot_check || data.company_hp) {
    return { honeypot: true };
  }

  const name = cleanText(data.name, 100);
  const email = cleanText(data.email, 150).toLowerCase();
  const phone = cleanText(data.phone, 30);
  const reason = cleanText(data.reason, 100);
  const message = cleanText(data.message, 3000);

  if (name.length < 2) return { error: 'Name must be between 2 and 100 characters.', field: 'name', status: 400 };
  if (!EMAIL_REGEX.test(email)) return { error: 'Please provide a valid email address.', field: 'email', status: 400 };
  if (phone && !PHONE_REGEX.test(phone)) return { error: 'Please provide a valid phone number (or leave blank).', field: 'phone', status: 400 };
  if (reason.length < 2) return { error: 'Please select a reason for your inquiry.', field: 'reason', status: 400 };
  if (message.length < 10) return { error: 'Message must be between 10 and 3,000 characters.', field: 'message', status: 400 };

  return { submission: { name, email, phone, reason, message } };
}

async function sendNotificationEmail({ env, submission }) {
  const recipientEmail = env?.NOTIFICATION_EMAIL || 'jawedimtiaz@gmail.com';
  const senderEmail = env?.SENDER_EMAIL || 'no-reply@jawed.co.in';

  const safeReason = submission.reason.replace(/[\\r\\n]/g, ' ');
  const safeName = submission.name.replace(/[\\r\\n]/g, ' ');
  const subject = `[Jawed.co.in Contact] ${safeReason} from ${safeName}`;
  const textContent = [
    'New contact enquiry received via Jawed.co.in',
    '--------------------------------------------------',
    `Name:    ${submission.name}`,
    `Email:   ${submission.email}`,
    `Phone:   ${submission.phone || 'Not provided'}`,
    `Reason:  ${submission.reason}`,
    `Date:    ${submission.timestamp}`,
    `ID:      ${submission.id}`,
    '',
    'Message:',
    submission.message,
    '--------------------------------------------------'
  ].join('\\n');

  if (env.RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: `Jawed.co.in Contact <${senderEmail}>`,
          to: recipientEmail,
          reply_to: submission.email,
          subject,
          text: textContent
        })
      });
      if (response.ok) return { sent: true, provider: 'resend' };
      console.warn('Contact email provider returned a non-success status.', { provider: 'resend', status: response.status });
    } catch {
      console.warn('Contact email provider request failed.', { provider: 'resend' });
    }
  }

  try {
    const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: recipientEmail }] }],
        from: { email: senderEmail, name: 'Jawed.co.in Notifications' },
        reply_to: { email: submission.email, name: submission.name },
        subject,
        content: [{ type: 'text/plain', value: textContent }]
      })
    });
    if (response.ok) return { sent: true, provider: 'mailchannels' };
    console.warn('Contact email provider returned a non-success status.', { provider: 'mailchannels', status: response.status });
    return { sent: false, provider: 'mailchannels', error: 'EMAIL_PROVIDER_REJECTED' };
  } catch {
    console.warn('Contact email provider request failed.', { provider: 'mailchannels' });
    return { sent: false, provider: 'mailchannels', error: 'EMAIL_PROVIDER_UNAVAILABLE' };
  }
}

export async function onRequestPost({ request, env }) {
  const cors = corsHeaders(request);
  const origin = request.headers.get('origin');
  if (!isAllowedOrigin(origin)) return json({ error: 'Origin not allowed.', code: 'ORIGIN_NOT_ALLOWED' }, 403);

  if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    return json({ error: 'Expected application/json.', code: 'INVALID_CONTENT_TYPE' }, 415, cors);
  }

  let data;
  try {
    data = JSON.parse(await readBoundedText(request, MAX_BODY_BYTES));
  } catch (error) {
    if (error?.message === 'PAYLOAD_TOO_LARGE') {
      return json({ error: 'Request too large.', code: 'PAYLOAD_TOO_LARGE' }, 413, cors);
    }
    return json({ error: 'Malformed or invalid JSON payload.', code: 'INVALID_JSON' }, 400, cors);
  }

  const validated = validateSubmission(data);
  if (validated.honeypot) {
    return json({ success: true, message: 'Thank you! Your message has been received.' }, 200, cors);
  }
  if (validated.error) {
    return json({ error: validated.error, code: 'VALIDATION_ERROR', field: validated.field }, validated.status, cors);
  }

  if (!env?.CONTACT_DB) {
    console.error('Contact submission unavailable: CONTACT_DB D1 binding is not configured.');
    return json({ error: 'The contact service is temporarily unavailable. Please try again later or use the email link.', code: 'CONTACT_STORAGE_UNAVAILABLE' }, 503, cors);
  }

  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const submission = { id, ...validated.submission, timestamp };

  try {
    await env.CONTACT_DB.prepare(
      `INSERT INTO contact_submissions
       (id, name, email, phone, reason, message, created_at, notification_status, notification_provider)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL)`
    ).bind(
      id,
      submission.name,
      submission.email,
      submission.phone || null,
      submission.reason,
      submission.message,
      timestamp
    ).run();
  } catch (error) {
    console.error('Contact submission could not be persisted.', { id, error: String(error?.message || error) });
    return json({ error: 'We could not securely save your message. Please try again later.', code: 'CONTACT_STORAGE_FAILED' }, 503, cors);
  }

  const emailResult = await sendNotificationEmail({ env, submission });
  try {
    await env.CONTACT_DB.prepare(
      'UPDATE contact_submissions SET notification_status = ?, notification_provider = ?, notification_attempted_at = ? WHERE id = ?'
    ).bind(
      emailResult.sent ? 'sent' : 'failed',
      emailResult.provider,
      new Date().toISOString(),
      id
    ).run();
  } catch (error) {
    console.error('Contact notification status could not be updated.', { id, error: String(error?.message || error) });
  }

  return json({
    success: true,
    id,
    notificationStatus: emailResult.sent ? 'sent' : 'failed',
    message: 'Thank you! Your message has been securely received. I will review it and get back to you shortly.'
  }, 200, cors);
}

export async function onRequestGet({ request, env } = {}) {
  const cors = request ? corsHeaders(request) : {};
  const origin = request?.headers?.get('origin');
  if (!isAllowedOrigin(origin)) return json({ error: 'Origin not allowed.', code: 'ORIGIN_NOT_ALLOWED' }, 403);
  if (!env?.CONTACT_DB) {
    return json({ ok: false, service: 'jawed-contact-api', status: 'storage-not-configured' }, 503, cors);
  }
  return json({ ok: true, service: 'jawed-contact-api', status: 'ready' }, 200, cors);
}

export async function onRequestOptions({ request } = {}) {
  const origin = request?.headers?.get('origin');
  if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request),
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400'
    }
  });
}

export async function onRequestLogPost({ request, env }) {
  const cors = corsHeaders(request);
  if (!isAllowedOrigin(request.headers.get('origin'))) {
    return json({ error: 'Origin not allowed.', code: 'ORIGIN_NOT_ALLOWED' }, 403);
  }
  if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    return json({ error: 'Expected application/json.', code: 'INVALID_CONTENT_TYPE' }, 415, cors);
  }
  let data;
  try {
    data = JSON.parse(await readBoundedText(request, 4000));
  } catch {
    return json({ error: 'Invalid log payload.', code: 'INVALID_JSON' }, 400, cors);
  }
  if (!env?.CONTACT_DB) {
    return json({ error: 'Contact logging is temporarily unavailable.', code: 'CONTACT_STORAGE_UNAVAILABLE' }, 503, cors);
  }

  const allowedStatuses = new Set(['success', 'fail']);
  const status = allowedStatuses.has(data.status) ? data.status : null;
  const reason = cleanText(data.reason, 80);
  const method = data.submissionMethod === 'email-client' ? 'email-client' : 'api';
  const messageLength = Number.isInteger(data.messageLength) ? Math.max(0, Math.min(data.messageLength, 3000)) : null;
  const pagePath = cleanText(data.url, 200);
  if (!status || !reason) return json({ error: 'Invalid log entry.', code: 'VALIDATION_ERROR' }, 400, cors);

  try {
    await env.CONTACT_DB.prepare(
      `INSERT INTO contact_attempt_logs (id, status, reason, submission_method, message_length, page_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), status, reason, method, messageLength, pagePath || null, new Date().toISOString()).run();
    return json({ success: true, logged: true }, 201, cors);
  } catch (error) {
    console.error('Contact attempt log could not be persisted.', { error: String(error?.message || error) });
    return json({ error: 'Contact logging failed.', code: 'CONTACT_LOG_FAILED' }, 503, cors);
  }
}

export async function onRequestLogGet({ request, env }) {
  const cors = corsHeaders(request);
  if (!isAllowedOrigin(request.headers.get('origin'))) {
    return json({ error: 'Origin not allowed.', code: 'ORIGIN_NOT_ALLOWED' }, 403);
  }
  if (!env?.CONTACT_DB) return json({ error: 'Contact logging is temporarily unavailable.' }, 503, cors);
  return json({ ok: true, service: 'contact-log', status: 'ready' }, 200, cors);
}

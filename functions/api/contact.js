// Cloudflare Pages Function: /api/contact
// Handles secure contact form submissions, validation, spam mitigation, and email notifications

const MAX_BODY_BYTES = 10000;
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const PHONE_REGEX = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{6,20}$/;

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

function sanitize(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendNotificationEmail({ env, submission }) {
  const recipientEmail = env?.NOTIFICATION_EMAIL || 'jawedimtiaz@gmail.com';
  const senderEmail = env?.SENDER_EMAIL || 'no-reply@jawed.co.in';

  const subject = `[Jawed.co.in Contact] ${submission.reason} from ${submission.name}`;
  const textContent = [
    `New contact enquiry received via Jawed.co.in`,
    `--------------------------------------------------`,
    `Name:    ${submission.name}`,
    `Email:   ${submission.email}`,
    `Phone:   ${submission.phone || 'Not provided'}`,
    `Reason:  ${submission.reason}`,
    `Date:    ${submission.timestamp}`,
    `ID:      ${submission.id}`,
    ``,
    `Message:`,
    `${submission.message}`,
    `--------------------------------------------------`
  ].join('\n');

  // 1. If Resend API Key is configured in environment
  if (env?.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
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
      return { sent: true, provider: 'resend' };
    } catch (err) {
      console.error('Resend delivery failed');
    }
  }

  // 2. Cloudflare MailChannels (standard Cloudflare Workers/Pages free email relay)
  try {
    const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: recipientEmail, name: 'Jawed Imtiaz' }]
          }
        ],
        from: {
          email: senderEmail,
          name: 'Jawed.co.in Notifications'
        },
        reply_to: {
          email: submission.email,
          name: submission.name
        },
        subject,
        content: [
          {
            type: 'text/plain',
            value: textContent
          }
        ]
      })
    });
    return { sent: res.ok, provider: 'mailchannels', status: res.status };
  } catch (err) {
    console.warn('MailChannels delivery failed');
    return { sent: false, provider: 'mailchannels', error: err?.message };
  }
}

export async function onRequestPost({ request, env }) {
  const id = crypto.randomUUID();

  // Validate Content-Type
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Expected application/json', code: 'INVALID_CONTENT_TYPE' }, 415);
  }

  // Validate Body size
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return json({ error: 'Request too large', code: 'PAYLOAD_TOO_LARGE' }, 413);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return json({ error: 'Malformed JSON payload', code: 'INVALID_JSON' }, 400);
  }

  // 1. Spam Protection: Honeypot field
  if (data.website || data.bot_check || data.company_hp) {
    console.warn('Bot detected via honeypot field:', { id });
    // Silent success response to discard bot submissions without alerting the bot
    return json({ success: true, id, message: 'Thank you! Your message has been received.' }, 200);
  }

  // 2. Spam Protection: Minimum submission time check (if timestamp provided)
  if (data.form_loaded_at && Number.isFinite(data.form_loaded_at)) {
    const elapsed = Date.now() - data.form_loaded_at;
    if (elapsed < 1500) {
      console.warn('Form submitted too fast (bot-like velocity):', { id, elapsed });
      return json({ error: 'Submission received too quickly. Please try again.', code: 'SUBMISSION_TOO_FAST' }, 400);
    }
  }

  // 3. Validation: Name
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name || name.length < 2 || name.length > 100) {
    return json({ error: 'Name must be between 2 and 100 characters.', field: 'name' }, 400);
  }

  // 4. Validation: Email
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (!email || !EMAIL_REGEX.test(email) || email.length > 150) {
    return json({ error: 'Please provide a valid email address.', field: 'email' }, 400);
  }

  // 5. Validation: Optional Phone
  const phone = typeof data.phone === 'string' ? data.phone.trim() : '';
  if (phone && (!PHONE_REGEX.test(phone) || phone.length > 30)) {
    return json({ error: 'Please provide a valid phone number (or leave blank).', field: 'phone' }, 400);
  }

  // 6. Validation: Reason
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  if (!reason || reason.length < 2 || reason.length > 100) {
    return json({ error: 'Please select a reason for your inquiry.', field: 'reason' }, 400);
  }

  // 7. Validation: Message
  const message = typeof data.message === 'string' ? data.message.trim() : '';
  if (!message || message.length < 10 || message.length > 3000) {
    return json({ error: 'Message must be between 10 and 3,000 characters.', field: 'message' }, 400);
  }

  const submission = {
    id,
    name: sanitize(name),
    email,
    phone: sanitize(phone),
    reason: sanitize(reason),
    message: sanitize(message),
    timestamp: new Date().toISOString(),
    ip: request.headers.get('cf-connecting-ip') || 'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown'
  };

  // Dispatch Email Notification Server-Side
  const emailResult = await sendNotificationEmail({ env, submission });

  console.info('Contact enquiry stored and notification processed:', {
    id,
    emailSent: emailResult.sent
  });

  return json({
    success: true,
    id,
    message: `Thank you, ${name}! Your enquiry has been securely received. I will review it and get back to you shortly.`
  }, 200);
}

export async function onRequestGet({ request } = {}) {
  const origin = request?.headers?.get('origin');
  const allowed = !origin || origin.includes('jawed.co.in') || origin.includes('localhost') || origin.includes('run.app');
  const extraHeaders = origin && allowed ? { 'access-control-allow-origin': origin } : {};
  return json({
    ok: true,
    service: 'jawed-contact-api',
    status: 'ready',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  }, 200, extraHeaders);
}

export async function onRequestOptions({ request } = {}) {
  const origin = request?.headers?.get('origin');
  const allowed = !origin || origin.includes('jawed.co.in') || origin.includes('localhost') || origin.includes('run.app');
  const headers = {
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization, x-requested-with',
    'access-control-max-age': '86400'
  };
  if (origin && allowed) {
    headers['access-control-allow-origin'] = origin;
  }
  return new Response(null, { status: 204, headers });
}

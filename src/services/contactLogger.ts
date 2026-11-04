/**
 * Privacy-minimized client-side contact attempt logger.
 * Names, email addresses, message contents, user-agent strings and raw errors
 * are intentionally not sent to the logging endpoint.
 */

export interface ContactSubmissionLogEntry {
  status: 'success' | 'fail';
  reason: string;
  name?: string;
  email?: string;
  topic?: string;
  messageLength?: number;
  error?: string;
  submissionMethod?: 'api' | 'email-client';
  timestamp?: string;
}

export interface ContactLogServiceResponse {
  success: boolean;
  logged: boolean;
  error?: string;
}

export async function logContactAttempt(entry: ContactSubmissionLogEntry): Promise<boolean> {
  try {
    const payload = {
      status: entry.status,
      reason: String(entry.reason || 'UNKNOWN').slice(0, 80),
      messageLength: Number.isInteger(entry.messageLength)
        ? Math.max(0, Math.min(Number(entry.messageLength), 3000))
        : undefined,
      submissionMethod: entry.submissionMethod === 'email-client' ? 'email-client' : 'api',
      timestamp: entry.timestamp || new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.pathname : '/contact/'
    };

    const response = await fetch('/api/contact/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload),
      keepalive: true
    });

    return response.ok;
  } catch {
    // Logging is best-effort and must never block the contact form.
    return false;
  }
}

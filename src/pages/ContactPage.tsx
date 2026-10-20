import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { User, Mail, Phone, Tag, MessageSquare, ShieldCheck, Loader2 } from 'lucide-react';
import { logContactAttempt } from '../services/contactLogger';

interface FormState {
  name: string;
  email: string;
  phone: string;
  reason: string;
  message: string;
  website: string; // Honeypot field for bot detection
}

interface FormErrors {
  name?: string;
  email?: string;
  phone?: string;
  reason?: string;
  message?: string;
}

const REASONS = [
  'IT Support & Service Desk Guidance',
  'Apple, macOS & Jamf Deployment',
  'Workplace Technology & Identity (Okta / M365)',
  'Technical Documentation & Runbooks',
  'AI Productivity & Prompt Engineering',
  'Full-Time Role / Hiring Inquiry',
  'Interactive Tool Feedback or Question',
  'Other Professional Inquiry'
];

export const ContactPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const preselectedReason = searchParams.get('reason') || '';

  const [formData, setFormData] = useState<FormState>({
    name: '',
    email: '',
    phone: '',
    reason: '',
    message: '',
    website: ''
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [shakingFields, setShakingFields] = useState<Record<string, boolean>>({});
  const [validationSummary, setValidationSummary] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isOpenEmailLoading, setIsOpenEmailLoading] = useState<boolean>(false);
  const [submissionMethod, setSubmissionMethod] = useState<'api' | 'email-client'>('api');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [serverMessage, setServerMessage] = useState<string>('');
  const [submissionId, setSubmissionId] = useState<string>('');
  const [formLoadedAt] = useState<number>(Date.now());
  const [copiedEmail, setCopiedEmail] = useState<boolean>(false);

  const shakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      if (shakeTimeoutRef.current) {
        clearTimeout(shakeTimeoutRef.current);
      }
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  const triggerShake = (fieldNames: string[]) => {
    if (!fieldNames.length) return;
    if (shakeTimeoutRef.current) {
      clearTimeout(shakeTimeoutRef.current);
    }
    const newShakes: Record<string, boolean> = {};
    fieldNames.forEach((field) => {
      newShakes[field] = true;
    });
    setShakingFields(newShakes);

    shakeTimeoutRef.current = setTimeout(() => {
      setShakingFields({});
      shakeTimeoutRef.current = null;
    }, 450);
  };

  // Preselect reason if coming from specific pathways
  useEffect(() => {
    if (preselectedReason) {
      const lower = preselectedReason.toLowerCase();
      const match = REASONS.find((r) => r.toLowerCase().includes(lower));
      if (match) {
        setFormData((prev) => ({ ...prev, reason: match }));
      }
    }
  }, [preselectedReason]);

  const validateField = (field: string, value: string): string | undefined => {
    const trimmed = value.trim();
    switch (field) {
      case 'name':
        if (!trimmed) {
          return 'Please enter your name (minimum 2 characters required).';
        }
        if (trimmed.length < 2) {
          return `Name must be at least 2 characters (currently ${trimmed.length} character).`;
        }
        if (trimmed.length > 100) {
          return 'Name cannot exceed 100 characters.';
        }
        return undefined;

      case 'email':
        if (!trimmed) {
          return 'Please enter your email address.';
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          return 'Please enter a valid email address.';
        }
        if (trimmed.length > 150) {
          return 'Email address cannot exceed 150 characters.';
        }
        return undefined;

      case 'phone':
        if (!trimmed) return undefined;
        if (!/^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{6,20}$/.test(trimmed)) {
          return 'Please enter a valid phone number (or leave blank).';
        }
        if (trimmed.length > 30) {
          return 'Phone number cannot exceed 30 characters.';
        }
        return undefined;

      case 'reason':
        if (!value) {
          return 'Please select a reason for your inquiry.';
        }
        return undefined;

      case 'message':
        if (!trimmed) {
          return 'Please enter your message (minimum 10 characters required).';
        }
        if (trimmed.length < 10) {
          const needed = 10 - trimmed.length;
          return `Message must be at least 10 characters (currently ${trimmed.length}/10 — please add ${needed} more character${needed === 1 ? '' : 's'}).`;
        }
        if (trimmed.length > 3000) {
          return 'Message cannot exceed 3,000 characters.';
        }
        return undefined;

      default:
        return undefined;
    }
  };

  const validate = (): FormErrors => {
    const errs: FormErrors = {};
    const nameErr = validateField('name', formData.name);
    if (nameErr) errs.name = nameErr;

    const emailErr = validateField('email', formData.email);
    if (emailErr) errs.email = emailErr;

    const phoneErr = validateField('phone', formData.phone);
    if (phoneErr) errs.phone = phoneErr;

    const reasonErr = validateField('reason', formData.reason);
    if (reasonErr) errs.reason = reasonErr;

    const messageErr = validateField('message', formData.message);
    if (messageErr) errs.message = messageErr;

    return errs;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Real-time live validation if the user has already touched this field or if it currently displays an error
    if (touched[name] || errors[name as keyof FormErrors]) {
      const err = validateField(name, value);
      setErrors((prev) => ({ ...prev, [name]: err }));
    }

    // Live update of validation error summary banner if currently displayed
    if (validationSummary.length > 0) {
      setTimeout(() => {
        const nextForm = { ...formData, [name]: value };
        const nextErrs: FormErrors = {};
        ['name', 'email', 'phone', 'reason', 'message'].forEach((f) => {
          const eMsg = validateField(f, nextForm[f as keyof FormState] || '');
          if (eMsg) nextErrs[f as keyof FormErrors] = eMsg;
        });
        setValidationSummary(Object.values(nextErrs).filter(Boolean) as string[]);
      }, 0);
    }
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const val = formData[field as keyof FormState] || '';
    const err = validateField(field, val);
    setErrors((prev) => ({ ...prev, [field]: err }));
    if (err) {
      triggerShake([field]);
    }
  };

  // Core validation handler: validates fields, records attempts, and triggers CSS shake animation on failing fields
  const handleValidation = (method: 'api' | 'email-client'): boolean => {
    setTouched({
      name: true,
      email: true,
      phone: true,
      reason: true,
      message: true
    });

    const validationErrors = validate();
    const failingFields = Object.keys(validationErrors);

    if (failingFields.length > 0) {
      setErrors(validationErrors);
      triggerShake(failingFields);
      setValidationSummary(Object.values(validationErrors).filter(Boolean) as string[]);

      // Track failed validation attempt
      logContactAttempt({
        status: 'fail',
        reason: 'VALIDATION_ERROR',
        name: formData.name.trim(),
        email: formData.email.trim(),
        topic: formData.reason,
        messageLength: formData.message.trim().length,
        submissionMethod: method,
        error: Object.entries(validationErrors)
          .map(([f, msg]) => `${f}: ${msg}`)
          .join('; ')
      });

      // Auto-focus first field that failed validation for accessibility
      const firstInvalidField = ['name', 'email', 'phone', 'reason', 'message'].find(
        (field) => validationErrors[field as keyof FormErrors]
      );
      if (firstInvalidField) {
        const el = document.getElementById(`contact-${firstInvalidField}`);
        el?.focus();
      }
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Honeypot spam protection: reject immediately if the hidden honeypot field is populated
    if (formData.website && formData.website.trim().length > 0) {
      logContactAttempt({
        status: 'fail',
        reason: 'BOT_HONEYPOT_DETECTED',
        name: formData.name.trim(),
        email: formData.email.trim(),
        topic: formData.reason,
        messageLength: formData.message.trim().length,
        submissionMethod: 'api',
        error: 'Submission rejected: honeypot field was filled.'
      });
      setSubmissionMethod('api');
      setSubmitStatus('error');
      setServerMessage('Submission rejected: automated spam activity detected.');
      return;
    }

    if (!handleValidation('api')) {
      return;
    }

    setSubmissionMethod('api');
    setIsSubmitting(true);
    setSubmitStatus('idle');
    setServerMessage('');
    setValidationSummary([]);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim() || undefined,
          reason: formData.reason,
          message: formData.message.trim(),
          website: formData.website,
          form_loaded_at: formLoadedAt
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Track successful submission attempt
        logContactAttempt({
          status: 'success',
          reason: 'SUBMISSION_SUCCESS',
          name: formData.name.trim(),
          email: formData.email.trim(),
          topic: formData.reason,
          messageLength: formData.message.trim().length,
          submissionMethod: 'api'
        });

        setSubmitStatus('success');
        setServerMessage(result.message || 'Thank you! Your message has been sent successfully.');
        setSubmissionId(result.id || '');
        setFormData({
          name: '',
          email: '',
          phone: '',
          reason: '',
          message: '',
          website: ''
        });
        setTouched({});
        setValidationSummary([]);

        // Temporary banner auto-reset after 7 seconds
        if (successTimeoutRef.current) {
          clearTimeout(successTimeoutRef.current);
        }
        successTimeoutRef.current = setTimeout(() => {
          setSubmitStatus('idle');
          setServerMessage('');
          successTimeoutRef.current = null;
        }, 7000);
      } else {
        // Track server rejection attempt
        logContactAttempt({
          status: 'fail',
          reason: 'SERVER_ERROR',
          name: formData.name.trim(),
          email: formData.email.trim(),
          topic: formData.reason,
          messageLength: formData.message.trim().length,
          submissionMethod: 'api',
          error: result.error || 'Server rejected submission'
        });

        setSubmitStatus('error');
        setServerMessage(result.error || 'Unable to submit your message right now. Please try again or email directly.');
      }
    } catch {
      // Track network failure attempt
      logContactAttempt({
        status: 'fail',
        reason: 'NETWORK_ERROR',
        name: formData.name.trim(),
        email: formData.email.trim(),
        topic: formData.reason,
        messageLength: formData.message.trim().length,
        submissionMethod: 'api',
        error: 'Network connection failed'
      });

      setSubmitStatus('error');
      setServerMessage('Network error: Unable to reach the server. Please check your internet connection or email directly at webmaster@jawed.co.in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEmail = () => {
    // Honeypot spam protection: reject immediately if the hidden honeypot field is populated
    if (formData.website && formData.website.trim().length > 0) {
      logContactAttempt({
        status: 'fail',
        reason: 'BOT_HONEYPOT_DETECTED',
        name: formData.name.trim(),
        email: formData.email.trim(),
        topic: formData.reason,
        messageLength: formData.message.trim().length,
        submissionMethod: 'email-client',
        error: 'Email trigger rejected: honeypot field was filled.'
      });
      setSubmissionMethod('email-client');
      setSubmitStatus('error');
      setServerMessage('Submission rejected: automated spam activity detected.');
      return;
    }

    // Validate form fields first and trigger shake animation on failure
    if (!handleValidation('email-client')) {
      return;
    }

    setIsOpenEmailLoading(true);
    setSubmitStatus('idle');
    setServerMessage('');
    setValidationSummary([]);

    const topic = formData.reason || 'General Inquiry';
    const name = formData.name.trim() || 'Website Visitor';
    const subject = `${topic} — ${name}`;
    const bodyParts = [
      `Name: ${formData.name.trim()}`,
      `Email: ${formData.email.trim()}`
    ];
    if (formData.phone.trim()) {
      bodyParts.push(`Phone: ${formData.phone.trim()}`);
    }
    bodyParts.push(`Reason: ${topic}`);
    bodyParts.push('');
    bodyParts.push(formData.message.trim());

    const body = bodyParts.join('\n');
    const mailtoUrl = `mailto:webmaster@jawed.co.in?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    // Brief timeout to ensure loading indicator is clearly perceived and accessible
    setTimeout(() => {
      try {
        window.location.href = mailtoUrl;
      } catch (err) {
        console.warn('Failed to launch mailto client automatically:', err);
      }

      // Track successful open email attempt
      logContactAttempt({
        status: 'success',
        reason: 'EMAIL_CLIENT_OPENED',
        name: formData.name.trim(),
        email: formData.email.trim(),
        topic: formData.reason,
        messageLength: formData.message.trim().length,
        submissionMethod: 'email-client'
      });

      setSubmissionMethod('email-client');
      setSubmitStatus('success');
      setServerMessage(
        'Your email application has been launched with your pre-filled inquiry addressed to webmaster@jawed.co.in. If no email client opens, copy the message details or email address below.'
      );
      setIsOpenEmailLoading(false);
      setFormData({
        name: '',
        email: '',
        phone: '',
        reason: '',
        message: '',
        website: ''
      });
      setTouched({});
      setValidationSummary([]);

      // Temporary banner auto-reset after 7 seconds
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
      successTimeoutRef.current = setTimeout(() => {
        setSubmitStatus('idle');
        setServerMessage('');
        successTimeoutRef.current = null;
      }, 7000);
    }, 450);
  };

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText('webmaster@jawed.co.in');
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 3000);
    } catch {
      // Fallback
    }
  };

  return (
    <main id="main-content" className="container narrow page">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <span>/</span>
        <span aria-current="page">Contact</span>
      </div>

      <p className="eyebrow">Get in touch &amp; Collaboration</p>
      <h1>Contact &amp; Work With Me</h1>
      <p className="lead" style={{ marginBottom: '2.5rem' }}>
        Whether you have an IT support opening, need practical guidance on macOS &amp; Jamf device management, require technical runbooks, or want to discuss browser-based tooling, I’d love to connect.
      </p>

      {/* "Work With Me" Section */}
      <section
        className="content-section"
        style={{
          backgroundColor: 'var(--surface)',
          padding: '1.75rem',
          borderRadius: '8px',
          border: '1px solid var(--line)',
          marginBottom: '2.5rem'
        }}
      >
        <h2 style={{ fontSize: '1.35rem', margin: '0 0 0.5rem' }}>Work With Me: Available Areas of Help</h2>
        <p style={{ color: 'var(--text)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
          Here are the core functional areas where I provide hands-on experience, operational frameworks, and consultative assistance:
        </p>

        <div className="card-grid two" style={{ gap: '1rem' }}>
          <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid var(--line)' }}>
            <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.4rem', color: 'var(--accent)' }}>
              🛠️ IT Support &amp; Service Desk Guidance
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
              Establishing repeatable first-response triage sequences, user/device/service scoping models, escalation standards, and high-quality ticket documentation.
            </p>
          </div>

          <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid var(--line)' }}>
            <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.4rem', color: 'var(--accent)' }}>
              🍏 Apple, macOS &amp; Jamf Deployment
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
              Automated Device Enrollment (ADE), Jamf Pro configuration profiles, FileVault encryption escrow, and macOS Sequoia/Sonoma enterprise endpoint compliance.
            </p>
          </div>

          <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid var(--line)' }}>
            <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.4rem', color: 'var(--accent)' }}>
              ☁️ Workplace Technology &amp; Cloud Identity
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
              Single Sign-On (SSO) and lifecycle identity across Okta, OneLogin, Google Workspace, and Microsoft 365 / Entra ID (Azure AD).
            </p>
          </div>

          <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid var(--line)' }}>
            <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.4rem', color: 'var(--accent)' }}>
              📝 Technical Documentation &amp; Runbooks
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
              Transforming complex troubleshooting incidents into sanitized, reusable knowledge-base articles, SOPs, and handoff checklists.
            </p>
          </div>
        </div>

        <div style={{ marginTop: '1.25rem', backgroundColor: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid var(--line)' }}>
          <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.4rem', color: 'var(--accent)' }}>
            🤖 AI Productivity &amp; Browser-Based Tools
          </h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
            Developing private, client-side tools and safe prompt engineering frameworks that augment support technicians without leaking confidential company data.
          </p>
        </div>
      </section>

      {/* Main Contact Form Section */}
      <section className="content-section">
        <h2>Send an Inquiry</h2>

        {/* Instructional Header: Submissions processed via email without storing data on server */}
        <div
          className="contact-instructional-header"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--line)',
            borderLeft: '4px solid var(--accent)',
            borderRadius: '6px',
            padding: '1.1rem 1.25rem',
            marginBottom: '1.75rem',
            display: 'flex',
            gap: '0.85rem',
            alignItems: 'flex-start'
          }}
        >
          <ShieldCheck
            size={22}
            style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }}
            aria-hidden="true"
          />
          <div style={{ fontSize: '0.9rem', lineHeight: 1.55 }}>
            <strong style={{ display: 'block', color: 'var(--text)', marginBottom: '0.25rem', fontSize: '0.95rem' }}>
              Submissions Are Processed via Email
            </strong>
            <p style={{ margin: 0, color: 'var(--text)' }}>
              Inquiries sent through this form are forwarded directly via email to{' '}
              <a href="mailto:webmaster@jawed.co.in" style={{ fontWeight: 600, color: 'var(--accent)' }}>
                webmaster@jawed.co.in
              </a>
              . <strong>This website does not directly store your messages or form data on the site server or database.</strong> You can submit directly using this form or click <em>Open Email</em> to compose and send from your local email client.
            </p>
          </div>
        </div>

        {/* Temporary Success Alert Banner (Displayed in place of the form after successful email trigger) */}
        {submitStatus === 'success' && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: 'relative',
              overflow: 'hidden',
              backgroundColor: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderLeft: '4px solid #10b981',
              borderRadius: '8px',
              padding: '1.5rem',
              marginBottom: '2rem',
              color: '#065f46',
              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.08)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span aria-hidden="true" style={{ fontSize: '1.35rem', color: '#10b981' }}>✓</span>
                <strong style={{ fontSize: '1.15rem', color: '#065f46' }}>
                  Message sent successfully
                </strong>
              </div>
              <span
                style={{
                  fontSize: '0.78rem',
                  color: '#047857',
                  backgroundColor: '#d1fae5',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '4px',
                  fontWeight: 500
                }}
              >
                Temporary confirmation
              </span>
            </div>

            <p style={{ margin: '0 0 0.85rem', fontSize: '0.95rem', lineHeight: 1.55 }}>
              {serverMessage || 'Your message has been processed successfully.'}
            </p>

            {submissionMethod === 'api' && submissionId && (
              <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: '#047857' }}>
                Confirmation Reference: <code>{submissionId}</code>
              </p>
            )}

            <p style={{ margin: '0 0 1.25rem', fontSize: '0.82rem', color: '#047857', fontStyle: 'italic' }}>
              This banner is displayed temporarily instead of the form. The form will automatically reset shortly, or you can click below anytime.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
                  setSubmitStatus('idle');
                  setServerMessage('');
                }}
                style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}
              >
                Send Another Message
              </button>
              {submissionMethod === 'email-client' && (
                <>
                  <a
                    href="mailto:webmaster@jawed.co.in"
                    className="button"
                    style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}
                  >
                    Launch Email App Again
                  </a>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={handleCopyEmail}
                    style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}
                  >
                    {copiedEmail ? '✓ Copied Email Address!' : 'Copy webmaster@jawed.co.in'}
                  </button>
                </>
              )}
            </div>

            {/* Subtle auto-reset progress bar */}
            <div
              className="banner-progress"
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                height: '3px',
                backgroundColor: '#10b981'
              }}
              aria-hidden="true"
            />
          </div>
        )}

        {/* Error Alert Banner */}
        {submitStatus === 'error' && (
          <div
            role="alert"
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '1.25rem',
              marginBottom: '2rem',
              color: '#991b1b'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '1.25rem' }}>⚠️</span>
              <strong style={{ fontSize: '1.05rem' }}>Submission Error</strong>
            </div>
            <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.5 }}>
              {serverMessage}
            </p>
          </div>
        )}

        {/* Client-side Validation Error Summary Banner */}
        {validationSummary.length > 0 && (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderLeft: '4px solid #dc2626',
              borderRadius: '8px',
              padding: '1.1rem 1.25rem',
              marginBottom: '1.75rem',
              color: '#991b1b'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span aria-hidden="true" style={{ fontSize: '1.2rem' }}>⚠️</span>
              <strong style={{ fontSize: '1rem' }}>Form Requirements Incomplete</strong>
            </div>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.88rem', lineHeight: 1.5 }}>
              Please correct the following fields before submitting your message:
            </p>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.86rem', lineHeight: 1.6 }}>
              {validationSummary.map((errMsg, idx) => (
                <li key={idx}>{errMsg}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Form Element */}
        {submitStatus !== 'success' && (
          <form
            className="contact-form"
            onSubmit={handleSubmit}
            noValidate
            style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
          >
            {/* Scoped CSS to ensure robust red border highlighting on validation failure and focus transitions */}
            <style>{`
              /* Transition effect on focus to scale border color and padding */
              .contact-form input,
              textarea {
                transition: border-color 0.22s cubic-bezier(0.4, 0, 0.2, 1),
                            padding 0.22s cubic-bezier(0.4, 0, 0.2, 1),
                            box-shadow 0.22s cubic-bezier(0.4, 0, 0.2, 1),
                            outline-color 0.22s cubic-bezier(0.4, 0, 0.2, 1),
                            background-color 0.15s ease;
              }

              .contact-form input:focus,
              textarea:focus {
                border-color: var(--accent) !important;
                padding-top: 0.75rem !important;
                padding-bottom: 0.75rem !important;
                padding-left: 2.65rem !important;
                padding-right: 1rem !important;
                box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.18), 0 2px 8px -1px rgba(29, 78, 216, 0.12) !important;
                outline: 3px solid rgba(29, 78, 216, 0.35) !important;
                outline-offset: 2px !important;
              }

              .contact-form select {
                transition: border-color 0.22s cubic-bezier(0.4, 0, 0.2, 1),
                            padding 0.22s cubic-bezier(0.4, 0, 0.2, 1),
                            box-shadow 0.22s cubic-bezier(0.4, 0, 0.2, 1),
                            outline-color 0.22s cubic-bezier(0.4, 0, 0.2, 1),
                            background-color 0.15s ease;
              }

              .contact-form select:focus {
                border-color: var(--accent) !important;
                padding-top: 0.75rem !important;
                padding-bottom: 0.75rem !important;
                padding-left: 2.65rem !important;
                padding-right: 1rem !important;
                box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.18), 0 2px 8px -1px rgba(29, 78, 216, 0.12) !important;
                outline: 3px solid rgba(29, 78, 216, 0.35) !important;
                outline-offset: 2px !important;
              }

              .contact-form .form-field.has-error input,
              .contact-form .form-field.has-error select,
              .contact-form .form-field.has-error textarea,
              .contact-form .input-icon-wrapper.has-error input,
              .contact-form .input-icon-wrapper.has-error select,
              .contact-form .input-icon-wrapper.has-error textarea,
              .contact-form .form-field-shake input,
              .contact-form .form-field-shake select,
              .contact-form .form-field-shake textarea,
              .contact-form input[aria-invalid="true"],
              .contact-form select[aria-invalid="true"],
              .contact-form textarea[aria-invalid="true"] {
                border: 2px solid #dc2626 !important;
                box-shadow: 0 0 0 1px #dc2626, 0 0 0 3px rgba(220, 38, 38, 0.15) !important;
              }

              .contact-form .form-field.has-error input:focus,
              .contact-form .form-field.has-error select:focus,
              .contact-form .form-field.has-error textarea:focus,
              .contact-form .input-icon-wrapper.has-error input:focus,
              .contact-form .input-icon-wrapper.has-error select:focus,
              .contact-form .input-icon-wrapper.has-error textarea:focus,
              .contact-form .form-field-shake input:focus,
              .contact-form .form-field-shake select:focus,
              .contact-form .form-field-shake textarea:focus,
              .contact-form input[aria-invalid="true"]:focus,
              .contact-form select[aria-invalid="true"]:focus,
              .contact-form textarea[aria-invalid="true"]:focus {
                border-color: #dc2626 !important;
                padding-top: 0.75rem !important;
                padding-bottom: 0.75rem !important;
                padding-left: 2.65rem !important;
                padding-right: 1rem !important;
                outline: 3px solid rgba(220, 38, 38, 0.45) !important;
                outline-offset: 2px !important;
                box-shadow: 0 0 0 1px #dc2626, 0 0 0 4px rgba(220, 38, 38, 0.25) !important;
              }

              .contact-form .form-field.has-error label {
                color: #b91c1c;
              }

              @media (prefers-reduced-motion: reduce) {
                .contact-form input,
                textarea,
                .contact-form select {
                  transition: none !important;
                }
              }
            `}</style>

            {/* Hidden honeypot input field to prevent automated spam submissions */}
            <div
              className="honeypot-field"
              style={{
                position: 'absolute',
                left: '-9999px',
                top: '-9999px',
                opacity: 0,
                height: 0,
                width: 0,
                zIndex: -1,
                overflow: 'hidden',
                pointerEvents: 'none'
              }}
              aria-hidden="true"
            >
              <label htmlFor="contact-website">Website (Leave blank if human)</label>
              <input
                id="contact-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={formData.website}
                onChange={handleChange}
                placeholder="Leave blank"
              />
            </div>

            {/* Name */}
            <div className={`form-field ${errors.name ? 'has-error form-field-error' : ''} ${shakingFields.name ? 'form-field-shake' : ''}`}>
              <label
                htmlFor="contact-name"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  marginBottom: '0.35rem',
                  color: errors.name ? '#b91c1c' : undefined
                }}
              >
                <User size={16} style={{ color: errors.name ? '#dc2626' : 'var(--accent)' }} aria-hidden="true" />
                <span>Full Name <span style={{ color: errors.name ? '#dc2626' : 'var(--accent)' }}>*</span></span>
              </label>
              <div className={`input-icon-wrapper ${errors.name ? 'has-error' : touched.name && formData.name.trim().length >= 2 ? 'is-valid' : ''}`}>
                <User className="input-icon" size={18} strokeWidth={2} aria-hidden="true" />
                <input
                  id="contact-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                  aria-required="true"
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={
                    errors.name
                      ? 'contact-name-error'
                      : 'contact-name-hint'
                  }
                  value={formData.name}
                  onChange={handleChange}
                  onBlur={() => handleBlur('name')}
                  placeholder="e.g. Alex Morgan"
                  className={errors.name ? 'field-error' : ''}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem 0.65rem 2.5rem',
                    border:
                      errors.name
                        ? '2px solid #dc2626'
                        : touched.name && formData.name.trim().length >= 2
                        ? '1px solid #10b981'
                        : '1px solid var(--line)',
                    boxShadow: errors.name ? '0 0 0 1px #dc2626, 0 0 0 3px rgba(220, 38, 38, 0.15)' : undefined,
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    transition: 'border-color 0.22s cubic-bezier(0.4, 0, 0.2, 1), padding 0.22s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.22s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem' }}>
                {errors.name ? (
                  <p id="contact-name-error" role="alert" style={{ color: '#dc2626', fontSize: '0.82rem', margin: 0, fontWeight: 500 }}>
                    {errors.name}
                  </p>
                ) : touched.name && formData.name.trim().length >= 2 ? (
                  <span id="contact-name-hint" style={{ color: '#059669', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>✓</span> Name meets length requirement
                  </span>
                ) : (
                  <span id="contact-name-hint" style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
                    Minimum 2 characters required.
                  </span>
                )}
                {formData.name.length > 0 && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    {formData.name.trim().length}/100
                  </span>
                )}
              </div>
            </div>

            {/* Email */}
            <div className={`form-field ${errors.email ? 'has-error form-field-error' : ''} ${shakingFields.email ? 'form-field-shake' : ''}`}>
              <label
                htmlFor="contact-email"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  marginBottom: '0.35rem',
                  color: errors.email ? '#b91c1c' : undefined
                }}
              >
                <Mail size={16} style={{ color: errors.email ? '#dc2626' : 'var(--accent)' }} aria-hidden="true" />
                <span>Email Address <span style={{ color: errors.email ? '#dc2626' : 'var(--accent)' }}>*</span></span>
              </label>
              <div className={`input-icon-wrapper ${errors.email ? 'has-error' : touched.email && formData.email.trim() && !errors.email ? 'is-valid' : ''}`}>
                <Mail className="input-icon" size={18} strokeWidth={2} aria-hidden="true" />
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'contact-email-error' : undefined}
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={() => handleBlur('email')}
                  placeholder="alex.morgan@company.com"
                  className={errors.email ? 'field-error' : ''}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem 0.65rem 2.5rem',
                    border: errors.email ? '2px solid #dc2626' : '1px solid var(--line)',
                    boxShadow: errors.email ? '0 0 0 1px #dc2626, 0 0 0 3px rgba(220, 38, 38, 0.15)' : undefined,
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    transition: 'border-color 0.22s cubic-bezier(0.4, 0, 0.2, 1), padding 0.22s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.22s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                />
              </div>
              {errors.email && (
                <p id="contact-email-error" role="alert" style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0.3rem 0 0', fontWeight: 500 }}>
                  {errors.email}
                </p>
              )}
            </div>

            {/* Optional Phone */}
            <div className={`form-field ${errors.phone ? 'has-error form-field-error' : ''} ${shakingFields.phone ? 'form-field-shake' : ''}`}>
              <label
                htmlFor="contact-phone"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  marginBottom: '0.35rem',
                  color: errors.phone ? '#b91c1c' : undefined
                }}
              >
                <Phone size={16} style={{ color: errors.phone ? '#dc2626' : 'var(--muted)' }} aria-hidden="true" />
                <span>Phone Number <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(Optional)</span></span>
              </label>
              <div className={`input-icon-wrapper ${errors.phone ? 'has-error' : ''}`}>
                <Phone className="input-icon" size={18} strokeWidth={2} aria-hidden="true" />
                <input
                  id="contact-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? 'contact-phone-error' : undefined}
                  value={formData.phone}
                  onChange={handleChange}
                  onBlur={() => handleBlur('phone')}
                  placeholder="+1 (555) 000-0000"
                  className={errors.phone ? 'field-error' : ''}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem 0.65rem 2.5rem',
                    border: errors.phone ? '2px solid #dc2626' : '1px solid var(--line)',
                    boxShadow: errors.phone ? '0 0 0 1px #dc2626, 0 0 0 3px rgba(220, 38, 38, 0.15)' : undefined,
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    transition: 'border-color 0.22s cubic-bezier(0.4, 0, 0.2, 1), padding 0.22s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.22s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                />
              </div>
              {errors.phone && (
                <p id="contact-phone-error" role="alert" style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0.3rem 0 0', fontWeight: 500 }}>
                  {errors.phone}
                </p>
              )}
            </div>

            {/* Topic / Reason */}
            <div className={`form-field ${errors.reason ? 'has-error form-field-error' : ''} ${shakingFields.reason ? 'form-field-shake' : ''}`}>
              <label
                htmlFor="contact-reason"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  marginBottom: '0.35rem',
                  color: errors.reason ? '#b91c1c' : undefined
                }}
              >
                <Tag size={16} style={{ color: errors.reason ? '#dc2626' : 'var(--accent)' }} aria-hidden="true" />
                <span>Topic / Reason for Inquiry <span style={{ color: errors.reason ? '#dc2626' : 'var(--accent)' }}>*</span></span>
              </label>
              <div className={`input-icon-wrapper ${errors.reason ? 'has-error' : touched.reason && formData.reason ? 'is-valid' : ''}`}>
                <Tag className="input-icon" size={18} strokeWidth={2} aria-hidden="true" />
                <select
                  id="contact-reason"
                  name="reason"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(errors.reason)}
                  aria-describedby={errors.reason ? 'contact-reason-error' : undefined}
                  value={formData.reason}
                  onChange={handleChange}
                  onBlur={() => handleBlur('reason')}
                  className={errors.reason ? 'field-error' : ''}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem 0.65rem 2.5rem',
                    border: errors.reason ? '2px solid #dc2626' : '1px solid var(--line)',
                    boxShadow: errors.reason ? '0 0 0 1px #dc2626, 0 0 0 3px rgba(220, 38, 38, 0.15)' : undefined,
                    borderRadius: '6px',
                    backgroundColor: '#fff',
                    fontSize: '0.95rem',
                    transition: 'border-color 0.22s cubic-bezier(0.4, 0, 0.2, 1), padding 0.22s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.22s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                >
                  <option value="" disabled>
                    -- Select the topic or nature of your message --
                  </option>
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              {errors.reason && (
                <p id="contact-reason-error" role="alert" style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0.3rem 0 0', fontWeight: 500 }}>
                  {errors.reason}
                </p>
              )}
            </div>

            {/* Message */}
            <div className={`form-field ${errors.message ? 'has-error form-field-error' : ''} ${shakingFields.message ? 'form-field-shake' : ''}`}>
              <label
                htmlFor="contact-message"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  marginBottom: '0.35rem',
                  color: errors.message ? '#b91c1c' : undefined
                }}
              >
                <MessageSquare size={16} style={{ color: errors.message ? '#dc2626' : 'var(--accent)' }} aria-hidden="true" />
                <span>Message <span style={{ color: errors.message ? '#dc2626' : 'var(--accent)' }}>*</span></span>
              </label>
              <div className={`input-icon-wrapper textarea-icon-wrapper ${errors.message ? 'has-error' : touched.message && formData.message.trim().length >= 10 ? 'is-valid' : ''}`}>
                <MessageSquare className="input-icon" size={18} strokeWidth={2} aria-hidden="true" />
                <textarea
                  id="contact-message"
                  name="message"
                  rows={6}
                  required
                  minLength={10}
                  maxLength={3000}
                  aria-required="true"
                  aria-invalid={Boolean(errors.message)}
                  aria-describedby={
                    errors.message
                      ? 'contact-message-error'
                      : 'contact-message-hint'
                  }
                  value={formData.message}
                  onChange={handleChange}
                  onBlur={() => handleBlur('message')}
                  placeholder="Please describe your project, opportunity, or feedback in detail..."
                  className={errors.message ? 'field-error' : ''}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem 0.65rem 2.5rem',
                    border:
                      errors.message
                        ? '2px solid #dc2626'
                        : touched.message && formData.message.trim().length >= 10
                        ? '1px solid #10b981'
                        : '1px solid var(--line)',
                    boxShadow: errors.message ? '0 0 0 1px #dc2626, 0 0 0 3px rgba(220, 38, 38, 0.15)' : undefined,
                    borderRadius: '6px',
                    fontFamily: 'inherit',
                    fontSize: '0.95rem',
                    transition: 'border-color 0.22s cubic-bezier(0.4, 0, 0.2, 1), padding 0.22s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.22s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem' }}>
                {errors.message ? (
                  <p id="contact-message-error" role="alert" style={{ color: '#dc2626', fontSize: '0.82rem', margin: 0, fontWeight: 500 }}>
                    {errors.message}
                  </p>
                ) : touched.message && formData.message.trim().length >= 10 ? (
                  <span id="contact-message-hint" style={{ fontSize: '0.82rem', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>✓</span> Minimum length met ({formData.message.trim().length} characters)
                  </span>
                ) : (
                  <span id="contact-message-hint" style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                    Minimum 10 characters required{formData.message.trim().length > 0 ? ` (${10 - formData.message.trim().length} more needed)` : ''}.
                  </span>
                )}
                <span style={{ fontSize: '0.8rem', color: formData.message.length > 2900 ? '#dc2626' : 'var(--muted)' }}>
                  {formData.message.length}/3000
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.5rem' }}>
              <button
                className="button"
                type="submit"
                id="contact-submit-btn"
                disabled={isSubmitting || isOpenEmailLoading}
                aria-busy={isSubmitting}
                style={{
                  minWidth: '180px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2
                      className="button-spinner"
                      size={18}
                      strokeWidth={2.5}
                      style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}
                      aria-hidden="true"
                    />
                    <span>Sending Message...</span>
                  </>
                ) : (
                  'Send Message →'
                )}
              </button>

              <button
                className="button button-secondary"
                type="button"
                id="open-email-btn"
                onClick={handleOpenEmail}
                disabled={isSubmitting || isOpenEmailLoading}
                aria-busy={isOpenEmailLoading}
                style={{
                  minWidth: '160px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {isOpenEmailLoading ? (
                  <>
                    <Loader2
                      className="button-spinner"
                      size={18}
                      strokeWidth={2.5}
                      style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}
                      aria-hidden="true"
                    />
                    <span>Opening Email...</span>
                  </>
                ) : (
                  '✉️ Open Email'
                )}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Direct Contact Alternatives Card */}
      <section
        className="content-section"
        style={{
          marginTop: '3rem',
          backgroundColor: 'var(--surface)',
          padding: '1.5rem',
          borderRadius: '8px',
          border: '1px solid var(--line)'
        }}
      >
        <h2 style={{ fontSize: '1.2rem', margin: '0 0 0.5rem' }}>Direct Communication Channels</h2>
        <p style={{ margin: '0 0 1rem', fontSize: '0.92rem', color: 'var(--text)' }}>
          Prefer direct email or professional networking? You can reach me through either channel:
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <a className="button" href="mailto:webmaster@jawed.co.in">
            Email webmaster@jawed.co.in
          </a>
          <button
            className="button button-secondary"
            type="button"
            onClick={handleCopyEmail}
          >
            {copiedEmail ? '✓ Copied to clipboard!' : 'Copy email address'}
          </button>
          <a
            className="button button-secondary"
            href="https://www.linkedin.com/in/jawedimtiaz/"
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn Profile ↗
          </a>
        </div>
      </section>

      {/* Privacy Notice */}
      <section className="content-section">
        <h2>Privacy Notice</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          Your submitted name, email, and message are used solely to reply to your inquiry. Form submissions are processed via email and do not directly store your data on the website server or in a database. Your details are never sold, shared with marketing networks, or used for unsolicited communication. Never submit passwords, credit card numbers, or internal credentials.
        </p>
      </section>
    </main>
  );
};

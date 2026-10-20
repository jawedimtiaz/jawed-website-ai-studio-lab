import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import {
  Wrench,
  Bot,
  Send,
  Terminal,
  X,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Zap,
  MapPin,
  Cpu,
  Network
} from 'lucide-react';
import { askJawedAi, ChatMessage, ChatSource } from '../../services/aiService';
import { useAuth } from '../../context/AuthContext';

interface WidgetMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
}

export const JawedAiWidget: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [messages, setMessages] = useState<WidgetMessage[]>([
    {
      role: 'assistant',
      content:
        '🛠️ **Senior IT Field Tech AI Assistant**\n\nGreetings! I analyze field hardware, network cabling (T568B vs T568A), subnetting CIDR ranges, BIOS POST codes, and latency diagnostics. How can I assist your field operations today?'
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Don't render floating widget on the dedicated /ai/ page
  const isAiPage = location.pathname.startsWith('/ai');

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setStatus('');
    };
    const handleOffline = () => {
      setIsOnline(false);
      setStatus('Field Tech AI needs internet');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages]);

  if (isAiPage) {
    return null;
  }

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleRequestOnSite = () => {
    navigate('/it-service', {
      state: {
        prefillDevice: 'Server',
        prefillPriority: 'Critical',
        prefillLocation: 'On-Site Server Room / Datacenter',
        prefillDescription:
          'Requesting Jawed Imtiaz for urgent on-site field dispatch, diagnostic, and hands-on hardware/network resolution.',
        prefillClientName: user?.displayName || ''
      }
    });
    setIsOpen(false);
  };

  const sendQuery = async (queryText: string) => {
    const q = queryText.trim();
    if (!q || busy) return;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('Field Tech AI needs internet');
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: q },
        {
          role: 'assistant',
          content: '📡 Field Tech AI needs internet connectivity to fetch diagnostics. Please check your connection and try again.'
        }
      ]);
      setInputVal('');
      return;
    }

    const userMsg: WidgetMessage = { role: 'user', content: q };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputVal('');
    setBusy(true);
    setStatus('Field Tech analyzing query…');

    try {
      const historyForApi: ChatMessage[] = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content
      }));

      const res = await askJawedAi(historyForApi);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.reply,
          sources: res.sources
        }
      ]);
      setStatus('');
    } catch {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setStatus('Field Tech AI needs internet');
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: '📡 Field Tech AI needs internet connectivity. Check network link and retry.'
          }
        ]);
      } else {
        setStatus('Unable to retrieve diagnostic answer right now. Retry shortly.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuery(inputVal);
  };

  return (
    <div
      className="field-tech-ai-widget"
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 1000,
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      {/* Trigger Floating Action Button */}
      <button
        type="button"
        className="jawed-ai-toggle"
        aria-expanded={isOpen}
        aria-controls="field-tech-ai-panel"
        aria-label={isOpen ? 'Close Field Tech AI' : 'Open Field Tech AI Assistant'}
        onClick={handleToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: '#0f172a',
          color: '#38bdf8',
          border: '1px solid #38bdf8',
          borderRadius: '30px',
          padding: '10px 18px',
          fontSize: '0.9rem',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(56, 189, 248, 0.35)',
          transition: 'all 0.2s ease'
        }}
      >
        <Wrench size={18} style={{ color: '#38bdf8' }} />
        <span>Field Tech AI</span>
      </button>

      {/* Floating Dialog Panel */}
      {isOpen && (
        <section
          id="field-tech-ai-panel"
          className="jawed-ai-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="field-tech-ai-title"
          style={{
            position: 'absolute',
            bottom: '60px',
            right: '0',
            width: 'min(410px, 92vw)',
            backgroundColor: '#0f172a',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: '16px',
            boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            maxHeight: '82vh'
          }}
        >
          {/* Widget Header */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#1e293b',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#38bdf8'
                }}
              >
                <Terminal size={18} />
              </div>
              <div>
                <strong
                  id="field-tech-ai-title"
                  style={{ color: '#f8fafc', fontSize: '0.95rem', display: 'block', lineHeight: 1.2 }}
                >
                  Field Tech AI Assistant
                </strong>
                <span style={{ fontSize: '0.72rem', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                  Senior IT Field Technician
                </span>
              </div>
            </div>

            {/* Quick On-Site Request & Window Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={handleRequestOnSite}
                title="Request Jawed On-Site Dispatch"
                style={{
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Wrench size={12} /> On-Site
              </button>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close Assistant"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Offline Notice */}
          {!isOnline && (
            <div
              style={{
                backgroundColor: '#451a03',
                color: '#fcd34d',
                padding: '8px 12px',
                fontSize: '0.8rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>📡</span>
              <span>Field Tech AI requires network connectivity to fetch knowledge.</span>
            </div>
          )}

          {/* Quick Request Jawed On-Site Banner */}
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(2, 132, 199, 0.15)',
              borderBottom: '1px solid rgba(2, 132, 199, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px'
            }}
          >
            <div style={{ fontSize: '0.78rem', color: '#e0f2fe' }}>
              <strong>Need urgent hardware/rack dispatch?</strong>
            </div>
            <button
              type="button"
              onClick={handleRequestOnSite}
              style={{
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Request Jawed On-Site 🛠️
            </button>
          </div>

          {/* Chat Messages Body */}
          <div
            style={{
              padding: '14px',
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              maxHeight: '380px',
              backgroundColor: '#090d16'
            }}
            role="log"
            aria-live="polite"
          >
            {messages.map((m, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  backgroundColor: m.role === 'user' ? '#0284c7' : '#1e293b',
                  color: m.role === 'user' ? '#ffffff' : '#f1f5f9',
                  padding: '10px 14px',
                  borderRadius: m.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  fontSize: '0.85rem',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-line',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                }}
              >
                <div>{m.content}</div>
                {m.sources && m.sources.length > 0 && (
                  <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.75rem', color: '#94a3b8' }}>Verified Sources:</span>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {m.sources.slice(0, 3).map((s, sIdx) => (
                        <Link
                          key={sIdx}
                          to={s.url}
                          onClick={handleClose}
                          style={{
                            fontSize: '0.72rem',
                            color: '#38bdf8',
                            backgroundColor: 'rgba(56, 189, 248, 0.12)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            textDecoration: 'none'
                          }}
                        >
                          {s.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Quick Prompt Pills on First Start */}
            {messages.length === 1 && (
              <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>
                  Ask Senior Field Tech:
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                  {[
                    'How to crimp T568B vs T568A ethernet cables?',
                    'Subnetting CIDR cheat sheet (/24, /28, /30)',
                    'Motherboard BIOS beep codes guide',
                    'Diagnose network latency and packet loss',
                    'How to scope an IT hardware issue?'
                  ].map((promptText) => (
                    <button
                      key={promptText}
                      type="button"
                      onClick={() => sendQuery(promptText)}
                      disabled={busy}
                      style={{
                        textAlign: 'left',
                        fontSize: '0.78rem',
                        padding: '7px 10px',
                        backgroundColor: '#1e293b',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        borderRadius: '8px',
                        color: '#38bdf8',
                        cursor: 'pointer',
                        lineHeight: 1.3,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      💡 {promptText}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Form Input */}
          <form
            onSubmit={handleSubmit}
            style={{
              padding: '12px',
              backgroundColor: '#1e293b',
              borderTop: '1px solid rgba(255,255,255,0.08)'
            }}
          >
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                ref={inputRef}
                type="text"
                placeholder="Ask about T568B, subnetting, BIOS codes..."
                maxLength={500}
                value={inputVal}
                disabled={busy}
                onChange={(e) => setInputVal(e.target.value)}
                style={{
                  flex: 1,
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={busy || !inputVal.trim()}
                style={{
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Send size={14} />
              </button>
            </div>
            {status && (
              <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                {status}
              </p>
            )}
          </form>
        </section>
      )}
    </div>
  );
};

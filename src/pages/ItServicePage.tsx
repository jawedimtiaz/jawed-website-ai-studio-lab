import React, { useState, useEffect } from 'react';
import {
  Server,
  Monitor,
  Network,
  Laptop,
  Radio,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Send,
  RefreshCw,
  Search,
  Filter,
  LogIn,
  LogOut,
  MapPin,
  ShieldCheck,
  Terminal,
  Activity,
  FileText,
  User,
  MessageSquare,
  Wrench,
  ChevronDown,
  ChevronUp,
  Cpu,
  Flame,
  Check,
  Building
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  ServiceTicket,
  DeviceType,
  PriorityLevel,
  TicketStatus,
  createTicket,
  subscribeUserTickets,
  subscribeAllTickets,
  updateTicketStatusAndNotes
} from '../services/ticketService';

const DEVICE_OPTIONS: { type: DeviceType; icon: React.ReactNode; desc: string }[] = [
  { type: 'Desktop', icon: <Monitor size={20} />, desc: 'Workstations, PCs, Terminals' },
  { type: 'Server', icon: <Server size={20} />, desc: 'Rackmounts, Virtual Hosts, NAS' },
  { type: 'Network Switch', icon: <Network size={20} />, desc: 'Managed switches, PoE, Core' },
  { type: 'Laptop', icon: <Laptop size={20} />, desc: 'Laptops, MacBooks, Mobile rigs' },
  { type: 'Firewall / Router', icon: <Radio size={20} />, desc: 'Gateways, VPN, Edge firewalls' }
];

const PRIORITY_LEVELS: {
  level: PriorityLevel;
  sla: string;
  color: string;
  bgColor: string;
  borderColor: string;
}[] = [
  {
    level: 'Low',
    sla: 'SLA: 48 Hours',
    color: '#34d399',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  {
    level: 'Medium',
    sla: 'SLA: 8 Hours',
    color: '#fbbf24',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)'
  },
  {
    level: 'Critical',
    sla: 'SLA: 1 Hour (Urgent Dispatch)',
    color: '#f87171',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.4)'
  }
];

export const ItServicePage: React.FC = () => {
  const { user, loading: authLoading, isTech, signInWithGoogle, logout, authError } = useAuth();

  // Active view: 'client' (submission & my tickets) vs 'tech' (field tech dispatch portal)
  const [activeTab, setActiveTab] = useState<'client' | 'tech'>('client');

  // Form State
  const [clientName, setClientName] = useState('');
  const [deviceType, setDeviceType] = useState<DeviceType>('Server');
  const [priority, setPriority] = useState<PriorityLevel>('Medium');
  const [siteLocation, setSiteLocation] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Tickets Data
  const [myTickets, setMyTickets] = useState<ServiceTicket[]>([]);
  const [allTickets, setAllTickets] = useState<ServiceTicket[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Tech Portal Filter & Search
  const [statusFilter, setStatusFilter] = useState<'All' | TicketStatus>('All');
  const [priorityFilter, setPriorityFilter] = useState<'All' | PriorityLevel>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

  // Tech Quick Worklog Modal / Input
  const [activeWorklogTicketId, setActiveWorklogTicketId] = useState<string | null>(null);
  const [worklogNote, setWorklogNote] = useState('');
  const [worklogTargetStatus, setWorklogTargetStatus] = useState<TicketStatus>('In Progress');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Pre-fill user name when logging in
  useEffect(() => {
    if (user?.displayName && !clientName) {
      setClientName(user.displayName);
    }
  }, [user]);

  // Default to tech tab if tech logs in
  useEffect(() => {
    if (isTech && activeTab === 'client' && myTickets.length === 0) {
      setActiveTab('tech');
    }
  }, [isTech]);

  // Subscribe to user tickets
  useEffect(() => {
    if (!user) {
      setMyTickets([]);
      return;
    }

    setIsSyncing(true);
    const unsubscribe = subscribeUserTickets(
      user.uid,
      (tickets) => {
        setMyTickets(tickets);
        setIsSyncing(false);
      },
      () => {
        setIsSyncing(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Subscribe to all tickets if tech
  useEffect(() => {
    if (!user || (!isTech && activeTab !== 'tech')) {
      return;
    }

    setIsSyncing(true);
    const unsubscribe = subscribeAllTickets(
      (tickets) => {
        setAllTickets(tickets);
        setIsSyncing(false);
      },
      () => {
        setIsSyncing(false);
      }
    );

    return () => unsubscribe();
  }, [user, isTech, activeTab]);

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!user) {
      setFormError('Please sign in with Google to submit an authenticated service request.');
      return;
    }

    const trimmedName = clientName.trim();
    if (trimmedName.length < 2) {
      setFormError('Please provide your full client name (minimum 2 characters).');
      return;
    }

    const trimmedLoc = siteLocation.trim();
    if (trimmedLoc.length < 2) {
      setFormError('Please specify the physical site location (e.g. Server Room B, Desk 4).');
      return;
    }

    const trimmedDesc = issueDescription.trim();
    if (trimmedDesc.length < 10) {
      setFormError('Please describe the issue in detail (at least 10 characters).');
      return;
    }

    setIsSubmitting(true);
    try {
      const ticketId = await createTicket({
        clientId: user.uid,
        clientName: trimmedName,
        clientEmail: user.email || 'unknown@domain.com',
        clientPhotoUrl: user.photoURL || undefined,
        deviceType,
        priority,
        siteLocation: trimmedLoc,
        issueDescription: trimmedDesc
      });

      setFormSuccess(`Service ticket #${ticketId} submitted successfully! Our dispatch team has been notified.`);
      setSiteLocation('');
      setIssueDescription('');
    } catch (err: any) {
      console.error('Submission failed:', err);
      setFormError(err.message || 'Failed to submit service ticket. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenWorklog = (ticket: ServiceTicket, targetStatus: TicketStatus) => {
    setActiveWorklogTicketId(ticket.id);
    setWorklogTargetStatus(targetStatus);
    setWorklogNote('');
    setUpdateError(null);
  };

  const handleSaveWorklog = async () => {
    if (!activeWorklogTicketId) return;
    if (!worklogNote.trim()) {
      setUpdateError('Please input a brief resolution worklog note describing the action taken.');
      return;
    }

    const targetTicket = (allTickets.length > 0 ? allTickets : myTickets).find(
      (t) => t.id === activeWorklogTicketId
    );
    if (!targetTicket) return;

    setIsUpdatingStatus(true);
    setUpdateError(null);

    const techDisplayName = user?.displayName || user?.email?.split('@')[0] || 'IT Technician';

    try {
      await updateTicketStatusAndNotes(
        activeWorklogTicketId,
        worklogTargetStatus,
        worklogNote.trim(),
        techDisplayName,
        targetTicket.resolutionNotes || ''
      );
      setActiveWorklogTicketId(null);
      setWorklogNote('');
    } catch (err: any) {
      console.error('Worklog update error:', err);
      setUpdateError(err.message || 'Failed to update ticket status. Check security permissions.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Filtered tickets for Tech view
  const filteredAllTickets = allTickets.filter((t) => {
    if (statusFilter !== 'All' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'All' && t.priority !== priorityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        t.id.toLowerCase().includes(q) ||
        t.clientName.toLowerCase().includes(q) ||
        t.siteLocation.toLowerCase().includes(q) ||
        t.issueDescription.toLowerCase().includes(q) ||
        t.deviceType.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  // KPI stats for Tech Portal
  const totalTicketsCount = allTickets.length;
  const openCount = allTickets.filter((t) => t.status === 'Open').length;
  const inProgressCount = allTickets.filter((t) => t.status === 'In Progress').length;
  const resolvedCount = allTickets.filter((t) => t.status === 'Resolved').length;
  const criticalCount = allTickets.filter((t) => t.priority === 'Critical' && t.status !== 'Resolved').length;

  return (
    <main
      id="main-content"
      style={{
        backgroundColor: '#0a0d14',
        color: '#e2e8f0',
        minHeight: '100vh',
        paddingBottom: '4rem'
      }}
    >
      {/* Top Banner / System Telemetry Bar */}
      <div
        style={{
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#0d131f',
          padding: '0.75rem 1rem',
          fontSize: '0.82rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 8px #10b981'
            }}
          />
          <span style={{ fontWeight: 600, color: '#38bdf8', letterSpacing: '0.05em' }}>
            FIREBASE FIRESTORE IT DISPATCH NODE
          </span>
          <span style={{ color: '#64748b' }}>|</span>
          <span style={{ color: '#94a3b8' }}>
            Database: <code style={{ color: '#a5f3fc' }}>ai-studio-jawedwebsitelab</code>
          </span>
        </div>

        {/* User Auth Quick Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {authLoading ? (
            <span style={{ color: '#94a3b8' }}>Checking credentials…</span>
          ) : user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Client'}
                  style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid #38bdf8' }}
                />
              ) : (
                <User size={16} style={{ color: '#38bdf8' }} />
              )}
              <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{user.displayName || user.email}</span>
              {isTech && (
                <span
                  style={{
                    backgroundColor: 'rgba(14, 165, 233, 0.2)',
                    color: '#38bdf8',
                    border: '1px solid rgba(14, 165, 233, 0.4)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}
                >
                  Field Tech / Admin
                </span>
              )}
              <button
                onClick={logout}
                style={{
                  background: 'transparent',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.75rem'
                }}
                title="Sign out of Firebase"
              >
                <LogOut size={12} /> Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #38bdf8',
                color: '#38bdf8',
                padding: '4px 12px',
                borderRadius: '5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: 600
              }}
            >
              <LogIn size={14} /> Sign In with Google
            </button>
          )}
        </div>
      </div>

      <div className="container" style={{ maxWidth: '1240px', margin: '0 auto', padding: '2rem 1rem' }}>
        {/* Header Hero Section */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div
              style={{
                padding: '8px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(99,102,241,0.2))',
                border: '1px solid rgba(14,165,233,0.3)',
                color: '#38bdf8'
              }}
            >
              <Activity size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 800, margin: 0, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                IT Service Request & Field Tech Portal
              </h1>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem' }}>
                Enterprise ticket submission, hardware dispatch, and real-time field resolution logs backed by Google Firebase.
              </p>
            </div>
          </div>

          {/* Navigation Mode Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              marginTop: '1.5rem',
              borderBottom: '1px solid #1e293b',
              paddingBottom: '0.5rem'
            }}
          >
            <button
              onClick={() => setActiveTab('client')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: activeTab === 'client' ? '#1e293b' : 'transparent',
                color: activeTab === 'client' ? '#38bdf8' : '#94a3b8',
                border: activeTab === 'client' ? '1px solid #38bdf8' : '1px solid transparent',
                borderRadius: '6px',
                padding: '8px 16px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <FileText size={16} />
              Client Ticket Desk
              {myTickets.length > 0 && (
                <span
                  style={{
                    backgroundColor: '#0284c7',
                    color: '#fff',
                    borderRadius: '10px',
                    padding: '1px 7px',
                    fontSize: '0.75rem'
                  }}
                >
                  {myTickets.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('tech')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: activeTab === 'tech' ? '#1e293b' : 'transparent',
                color: activeTab === 'tech' ? '#38bdf8' : '#94a3b8',
                border: activeTab === 'tech' ? '1px solid #38bdf8' : '1px solid transparent',
                borderRadius: '6px',
                padding: '8px 16px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Wrench size={16} />
              IT Field Tech Portal
              {isTech && (
                <span
                  style={{
                    backgroundColor: '#10b981',
                    color: '#fff',
                    borderRadius: '10px',
                    padding: '1px 7px',
                    fontSize: '0.72rem',
                    fontWeight: 700
                  }}
                >
                  Authorized
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Global Auth Error Alert */}
        {authError && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              color: '#fca5a5',
              padding: '0.85rem 1.25rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}
          >
            <AlertTriangle size={18} />
            <span>{authError}</span>
          </div>
        )}

        {/* TAB 1: CLIENT VIEW (TICKET SUBMISSION + MY TICKETS) */}
        {activeTab === 'client' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 460px) 1fr', gap: '2rem' }}>
            {/* Ticket Submission Form Card */}
            <div
              style={{
                backgroundColor: '#111827',
                border: '1px solid #1f293d',
                borderRadius: '12px',
                padding: '1.5rem',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                height: 'fit-content'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <Terminal size={18} style={{ color: '#38bdf8' }} />
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
                  Open Service Request
                </h2>
              </div>

              {!user && (
                <div
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '1.25rem',
                    textAlign: 'center',
                    marginBottom: '1.5rem'
                  }}
                >
                  <ShieldCheck size={32} style={{ color: '#38bdf8', margin: '0 auto 0.5rem' }} />
                  <p style={{ margin: '0 0 1rem', fontSize: '0.88rem', color: '#cbd5e1' }}>
                    Sign in with Google to submit authenticated IT requests, receive dispatch updates, and monitor hardware SLA.
                  </p>
                  <button
                    onClick={signInWithGoogle}
                    style={{
                      width: '100%',
                      backgroundColor: '#2563eb',
                      border: 'none',
                      color: '#ffffff',
                      padding: '10px 16px',
                      borderRadius: '6px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <LogIn size={16} /> Sign In with Google
                  </button>
                </div>
              )}

              {formSuccess && (
                <div
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid #10b981',
                    color: '#6ee7b7',
                    padding: '0.85rem 1rem',
                    borderRadius: '8px',
                    marginBottom: '1.25rem',
                    fontSize: '0.88rem'
                  }}
                >
                  {formSuccess}
                </div>
              )}

              {formError && (
                <div
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #ef4444',
                    color: '#fca5a5',
                    padding: '0.85rem 1rem',
                    borderRadius: '8px',
                    marginBottom: '1.25rem',
                    fontSize: '0.88rem'
                  }}
                >
                  {formError}
                </div>
              )}

              <form onSubmit={handleSubmitTicket} style={{ opacity: user ? 1 : 0.6, pointerEvents: user ? 'auto' : 'none' }}>
                {/* Client Name */}
                <div style={{ marginBottom: '1.1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>
                    Client Name *
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g. Sarah Jenkins or Desk Operations"
                    required
                    style={{
                      width: '100%',
                      backgroundColor: '#0b0f17',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '9px 12px',
                      color: '#f8fafc',
                      fontSize: '0.9rem',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Device Type Cards */}
                <div style={{ marginBottom: '1.1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.45rem' }}>
                    Target Hardware / Device Type *
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                    {DEVICE_OPTIONS.map((item) => {
                      const isSelected = deviceType === item.type;
                      return (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => setDeviceType(item.type)}
                          style={{
                            textAlign: 'left',
                            backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : '#0b0f17',
                            border: isSelected ? '1px solid #38bdf8' : '1px solid #1e293b',
                            borderRadius: '6px',
                            padding: '8px 10px',
                            color: isSelected ? '#38bdf8' : '#94a3b8',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.85rem' }}>
                            {item.icon}
                            <span>{item.type}</span>
                          </div>
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{item.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Priority Level */}
                <div style={{ marginBottom: '1.1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.45rem' }}>
                    Priority & SLA Level *
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                    {PRIORITY_LEVELS.map((p) => {
                      const isSelected = priority === p.level;
                      return (
                        <button
                          key={p.level}
                          type="button"
                          onClick={() => setPriority(p.level)}
                          style={{
                            backgroundColor: isSelected ? p.bgColor : '#0b0f17',
                            border: isSelected ? `1px solid ${p.color}` : '1px solid #1e293b',
                            borderRadius: '6px',
                            padding: '8px 6px',
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ color: p.color, fontWeight: 700, fontSize: '0.85rem' }}>{p.level}</div>
                          <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '2px' }}>{p.sla}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Site Location */}
                <div style={{ marginBottom: '1.1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>
                    Physical Site / Location *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <MapPin size={16} style={{ position: 'absolute', left: '10px', top: '11px', color: '#64748b' }} />
                    <input
                      type="text"
                      value={siteLocation}
                      onChange={(e) => setSiteLocation(e.target.value)}
                      placeholder="e.g. Data Center Rack B4, Building 2 Floor 3"
                      required
                      style={{
                        width: '100%',
                        backgroundColor: '#0b0f17',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '9px 12px 9px 34px',
                        color: '#f8fafc',
                        fontSize: '0.9rem',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                {/* Issue Description */}
                <div style={{ marginBottom: '1.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8' }}>
                      Issue Description *
                    </label>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{issueDescription.length} / 2000</span>
                  </div>
                  <textarea
                    rows={4}
                    value={issueDescription}
                    onChange={(e) => setIssueDescription(e.target.value)}
                    placeholder="Provide diagnostic details: symptoms, error codes, affected ports, or troubleshooting performed..."
                    required
                    style={{
                      width: '100%',
                      backgroundColor: '#0b0f17',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '9px 12px',
                      color: '#f8fafc',
                      fontSize: '0.9rem',
                      outline: 'none',
                      resize: 'vertical'
                    }}
                  />
                </div>

                {/* Submit Action */}
                <button
                  type="submit"
                  disabled={isSubmitting || !user}
                  style={{
                    width: '100%',
                    backgroundColor: '#0284c7',
                    border: 'none',
                    color: '#ffffff',
                    padding: '12px 18px',
                    borderRadius: '7px',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: isSubmitting || !user ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" /> Dispatching to Field Queue…
                    </>
                  ) : (
                    <>
                      <Send size={16} /> Submit IT Service Ticket
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* My Tickets Tracking List */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
                  My Service Tickets ({myTickets.length})
                </h2>
                {isSyncing && (
                  <span style={{ fontSize: '0.8rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <RefreshCw size={13} className="animate-spin" /> Live Sync Active
                  </span>
                )}
              </div>

              {!user ? (
                <div
                  style={{
                    backgroundColor: '#111827',
                    border: '1px dashed #334155',
                    borderRadius: '10px',
                    padding: '3rem 2rem',
                    textAlign: 'center',
                    color: '#94a3b8'
                  }}
                >
                  <ShieldCheck size={40} style={{ color: '#475569', margin: '0 auto 0.75rem' }} />
                  <h3 style={{ fontSize: '1.1rem', color: '#e2e8f0', margin: '0 0 0.5rem' }}>No Active Session</h3>
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>
                    Sign in with Google using the button above to view your real-time tickets and technician worklogs.
                  </p>
                </div>
              ) : myTickets.length === 0 ? (
                <div
                  style={{
                    backgroundColor: '#111827',
                    border: '1px dashed #334155',
                    borderRadius: '10px',
                    padding: '3rem 2rem',
                    textAlign: 'center',
                    color: '#94a3b8'
                  }}
                >
                  <Terminal size={36} style={{ color: '#475569', margin: '0 auto 0.75rem' }} />
                  <h3 style={{ fontSize: '1.1rem', color: '#e2e8f0', margin: '0 0 0.5rem' }}>No Tickets Logged Yet</h3>
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>
                    Use the form on the left to submit a service request for hardware failures, switches, or servers.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {myTickets.map((t) => {
                    const isExpanded = expandedTicketId === t.id;
                    return (
                      <div
                        key={t.id}
                        style={{
                          backgroundColor: '#111827',
                          border: '1px solid #1e293b',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          transition: 'border-color 0.15s ease'
                        }}
                      >
                        {/* Header Row */}
                        <div
                          style={{
                            padding: '1rem 1.25rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.75rem',
                            borderBottom: isExpanded ? '1px solid #1e293b' : 'none',
                            cursor: 'pointer'
                          }}
                          onClick={() => setExpandedTicketId(isExpanded ? null : t.id)}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#38bdf8', fontSize: '0.92rem' }}>
                                #{t.id}
                              </span>
                              <span
                                style={{
                                  backgroundColor: '#1e293b',
                                  color: '#cbd5e1',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600
                                }}
                              >
                                {t.deviceType}
                              </span>
                              <span
                                style={{
                                  backgroundColor:
                                    t.priority === 'Critical'
                                      ? 'rgba(239, 68, 68, 0.2)'
                                      : t.priority === 'Medium'
                                      ? 'rgba(245, 158, 11, 0.2)'
                                      : 'rgba(16, 185, 129, 0.2)',
                                  color:
                                    t.priority === 'Critical'
                                      ? '#f87171'
                                      : t.priority === 'Medium'
                                      ? '#fbbf24'
                                      : '#34d399',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700
                                }}
                              >
                                {t.priority} Priority
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', fontSize: '0.82rem', color: '#94a3b8' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <MapPin size={13} /> {t.siteLocation}
                              </span>
                              <span>•</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Clock size={13} /> {new Date(t.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '4px 12px',
                                borderRadius: '20px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                backgroundColor:
                                  t.status === 'Resolved'
                                    ? 'rgba(16, 185, 129, 0.15)'
                                    : t.status === 'In Progress'
                                    ? 'rgba(56, 189, 248, 0.15)'
                                    : 'rgba(245, 158, 11, 0.15)',
                                color:
                                  t.status === 'Resolved'
                                    ? '#34d399'
                                    : t.status === 'In Progress'
                                    ? '#38bdf8'
                                    : '#fbbf24',
                                border:
                                  t.status === 'Resolved'
                                    ? '1px solid rgba(16, 185, 129, 0.4)'
                                    : t.status === 'In Progress'
                                    ? '1px solid rgba(56, 189, 248, 0.4)'
                                    : '1px solid rgba(245, 158, 11, 0.4)'
                              }}
                            >
                              {t.status === 'Resolved' ? (
                                <CheckCircle2 size={14} />
                              ) : t.status === 'In Progress' ? (
                                <RefreshCw size={14} className="animate-spin" />
                              ) : (
                                <Clock size={14} />
                              )}
                              {t.status}
                            </span>
                            {isExpanded ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
                          </div>
                        </div>

                        {/* Collapsible Details & Worklog */}
                        {isExpanded && (
                          <div style={{ padding: '1.25rem', backgroundColor: '#0c1017' }}>
                            <div style={{ marginBottom: '1rem' }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                                Issue Fault Report
                              </div>
                              <p style={{ margin: 0, fontSize: '0.9rem', color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                                {t.issueDescription}
                              </p>
                            </div>

                            {/* Technician Field Notes Log */}
                            <div style={{ borderTop: '1px solid #1e293b', paddingTop: '1rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8', marginBottom: '0.5rem' }}>
                                <Wrench size={14} />
                                Technician Field Worklog & Resolution Notes
                              </div>
                              {t.resolutionNotes ? (
                                <div
                                  style={{
                                    backgroundColor: '#111827',
                                    border: '1px solid #1e293b',
                                    borderRadius: '6px',
                                    padding: '0.85rem',
                                    fontFamily: 'monospace',
                                    fontSize: '0.82rem',
                                    color: '#cbd5e1',
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: 1.5
                                  }}
                                >
                                  {t.resolutionNotes}
                                </div>
                              ) : (
                                <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', fontStyle: 'italic' }}>
                                  Ticket is currently queued. Field technician will log resolution notes upon dispatch.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: IT FIELD TECH PORTAL (DISPATCHER & RESOLUTION WORKLOGS) */}
        {activeTab === 'tech' && (
          <div>
            {/* KPI Metrics Dashboard Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
              <div
                style={{
                  backgroundColor: '#111827',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                  padding: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem'
                }}
              >
                <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8' }}>
                  <Terminal size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Total Incidents</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc' }}>{totalTicketsCount}</div>
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#111827',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                  padding: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem'
                }}
              >
                <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24' }}>
                  <Clock size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Open / Queued</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fbbf24' }}>{openCount}</div>
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#111827',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                  padding: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem'
                }}
              >
                <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8' }}>
                  <Wrench size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>In Progress</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#38bdf8' }}>{inProgressCount}</div>
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#111827',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                  padding: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem'
                }}
              >
                <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#34d399' }}>
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Resolved</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#34d399' }}>{resolvedCount}</div>
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#111827',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                  padding: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem'
                }}
              >
                <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                  <Flame size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Critical SLA Incidents</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f87171' }}>{criticalCount}</div>
                </div>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div
              style={{
                backgroundColor: '#111827',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                padding: '1rem',
                marginBottom: '1.5rem',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1rem',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              {/* Search */}
              <div style={{ position: 'relative', minWidth: '260px', flex: 1 }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '11px', color: '#64748b' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by ticket ID, client, location, or symptom..."
                  style={{
                    width: '100%',
                    backgroundColor: '#0b0f17',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '8px 12px 8px 34px',
                    color: '#f8fafc',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Status Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>Status:</span>
                {(['All', 'Open', 'In Progress', 'Resolved'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    style={{
                      backgroundColor: statusFilter === st ? '#2563eb' : '#0b0f17',
                      color: statusFilter === st ? '#ffffff' : '#94a3b8',
                      border: statusFilter === st ? '1px solid #3b82f6' : '1px solid #1e293b',
                      borderRadius: '5px',
                      padding: '5px 10px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Priority Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>Priority:</span>
                {(['All', 'Critical', 'Medium', 'Low'] as const).map((pr) => (
                  <button
                    key={pr}
                    onClick={() => setPriorityFilter(pr)}
                    style={{
                      backgroundColor: priorityFilter === pr ? '#1e293b' : '#0b0f17',
                      color:
                        pr === 'Critical'
                          ? '#f87171'
                          : pr === 'Medium'
                          ? '#fbbf24'
                          : pr === 'Low'
                          ? '#34d399'
                          : '#cbd5e1',
                      border: priorityFilter === pr ? '1px solid #38bdf8' : '1px solid #1e293b',
                      borderRadius: '5px',
                      padding: '5px 10px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {pr}
                  </button>
                ))}
              </div>
            </div>

            {/* Tech Field Tickets Table */}
            <div
              style={{
                backgroundColor: '#111827',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  padding: '1rem 1.25rem',
                  borderBottom: '1px solid #1e293b',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Wrench size={18} style={{ color: '#38bdf8' }} />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f1f5f9' }}>
                    Active Field Dispatch Queue ({filteredAllTickets.length})
                  </h3>
                </div>
                {!isTech && (
                  <div style={{ fontSize: '0.78rem', color: '#fbbf24', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '4px 10px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                    Admin mode active for jawedimtiaz@gmail.com
                  </div>
                )}
              </div>

              {filteredAllTickets.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                  <CheckCircle2 size={36} style={{ color: '#10b981', margin: '0 auto 0.75rem' }} />
                  <p style={{ margin: 0, fontSize: '0.95rem' }}>No tickets match the selected filter criteria.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {filteredAllTickets.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        padding: '1.25rem',
                        borderBottom: '1px solid #1e293b',
                        display: 'grid',
                        gridTemplateColumns: 'minmax(200px, 1.4fr) minmax(260px, 2fr) minmax(220px, 1.2fr)',
                        gap: '1.5rem',
                        alignItems: 'start'
                      }}
                    >
                      {/* Column 1: Ticket & Client Metadata */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#38bdf8', fontSize: '0.92rem' }}>
                            #{t.id}
                          </span>
                          <span
                            style={{
                              backgroundColor:
                                t.priority === 'Critical'
                                  ? 'rgba(239, 68, 68, 0.2)'
                                  : t.priority === 'Medium'
                                  ? 'rgba(245, 158, 11, 0.2)'
                                  : 'rgba(16, 185, 129, 0.2)',
                              color:
                                t.priority === 'Critical'
                                  ? '#f87171'
                                  : t.priority === 'Medium'
                                  ? '#fbbf24'
                                  : '#34d399',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700
                            }}
                          >
                            {t.priority}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f1f5f9' }}>{t.clientName}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{t.clientEmail}</div>

                        <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.78rem', color: '#94a3b8' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Cpu size={13} style={{ color: '#38bdf8' }} /> {t.deviceType}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MapPin size={13} style={{ color: '#f59e0b' }} /> {t.siteLocation}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={13} style={{ color: '#94a3b8' }} /> {new Date(t.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Column 2: Issue Fault & Worklog History */}
                      <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                          Fault Description
                        </div>
                        <p style={{ margin: '0 0 0.75rem', fontSize: '0.88rem', color: '#e2e8f0', lineHeight: 1.45 }}>
                          {t.issueDescription}
                        </p>

                        {/* Recent Worklog Notes */}
                        {t.resolutionNotes && (
                          <div
                            style={{
                              backgroundColor: '#0c1017',
                              border: '1px solid #1e293b',
                              borderRadius: '6px',
                              padding: '0.65rem 0.85rem',
                              fontFamily: 'monospace',
                              fontSize: '0.78rem',
                              color: '#a5f3fc',
                              whiteSpace: 'pre-wrap',
                              maxHeight: '120px',
                              overflowY: 'auto'
                            }}
                          >
                            {t.resolutionNotes}
                          </div>
                        )}
                      </div>

                      {/* Column 3: Tech Action & Status Update Controls */}
                      <div
                        style={{
                          backgroundColor: '#0c1017',
                          border: '1px solid #1e293b',
                          borderRadius: '8px',
                          padding: '1rem'
                        }}
                      >
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                          Current Status: <span style={{ color: t.status === 'Resolved' ? '#34d399' : t.status === 'In Progress' ? '#38bdf8' : '#fbbf24' }}>{t.status}</span>
                        </div>

                        {/* Quick Status Buttons */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                          {t.status !== 'In Progress' && (
                            <button
                              onClick={() => handleOpenWorklog(t, 'In Progress')}
                              style={{
                                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                                border: '1px solid rgba(56, 189, 248, 0.4)',
                                color: '#38bdf8',
                                padding: '6px 10px',
                                borderRadius: '5px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <Wrench size={13} /> Set In Progress & Log Work
                            </button>
                          )}

                          {t.status !== 'Resolved' && (
                            <button
                              onClick={() => handleOpenWorklog(t, 'Resolved')}
                              style={{
                                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                border: '1px solid rgba(16, 185, 129, 0.4)',
                                color: '#34d399',
                                padding: '6px 10px',
                                borderRadius: '5px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <CheckCircle2 size={13} /> Mark Resolved & Close
                            </button>
                          )}

                          {t.status !== 'Open' && (
                            <button
                              onClick={() => handleOpenWorklog(t, 'Open')}
                              style={{
                                backgroundColor: '#1e293b',
                                border: '1px solid #334155',
                                color: '#94a3b8',
                                padding: '5px 8px',
                                borderRadius: '5px',
                                fontSize: '0.75rem',
                                cursor: 'pointer'
                              }}
                            >
                              Re-open Ticket
                            </button>
                          )}
                        </div>

                        {t.lastUpdatedBy && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            Last update by: <span style={{ color: '#94a3b8' }}>{t.lastUpdatedBy}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tech Worklog Modal */}
            {activeWorklogTicketId && (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.75)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 9999,
                  padding: '1rem'
                }}
              >
                <div
                  style={{
                    backgroundColor: '#111827',
                    border: '1px solid #38bdf8',
                    borderRadius: '12px',
                    padding: '1.75rem',
                    maxWidth: '560px',
                    width: '100%',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.8)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                    <Wrench size={20} style={{ color: '#38bdf8' }} />
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#f1f5f9' }}>
                      Log Field Resolution Note
                    </h3>
                  </div>

                  <p style={{ margin: '0 0 1rem', fontSize: '0.88rem', color: '#94a3b8' }}>
                    Updating ticket <strong style={{ color: '#38bdf8' }}>#{activeWorklogTicketId}</strong> status to{' '}
                    <strong style={{ color: worklogTargetStatus === 'Resolved' ? '#34d399' : '#38bdf8' }}>
                      {worklogTargetStatus}
                    </strong>
                    . This worklog entry will be stamped with the current time and technician identity.
                  </p>

                  {updateError && (
                    <div
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid #ef4444',
                        color: '#fca5a5',
                        padding: '0.75rem 1rem',
                        borderRadius: '6px',
                        marginBottom: '1rem',
                        fontSize: '0.85rem'
                      }}
                    >
                      {updateError}
                    </div>
                  )}

                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                      Worklog Action & Resolution Summary *
                    </label>
                    <textarea
                      rows={4}
                      value={worklogNote}
                      onChange={(e) => setWorklogNote(e.target.value)}
                      placeholder="e.g. Swapped bad optical SFP transceiver on Switch Port 8. Checked ping packet loss (0%). Services fully restored."
                      required
                      style={{
                        width: '100%',
                        backgroundColor: '#0b0f17',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        color: '#f8fafc',
                        fontSize: '0.88rem',
                        outline: 'none',
                        resize: 'vertical'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => setActiveWorklogTicketId(null)}
                      disabled={isUpdatingStatus}
                      style={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        color: '#cbd5e1',
                        padding: '9px 16px',
                        borderRadius: '6px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveWorklog}
                      disabled={isUpdatingStatus}
                      style={{
                        backgroundColor: worklogTargetStatus === 'Resolved' ? '#10b981' : '#0284c7',
                        border: 'none',
                        color: '#ffffff',
                        padding: '9px 18px',
                        borderRadius: '6px',
                        fontWeight: 700,
                        cursor: isUpdatingStatus ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {isUpdatingStatus ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" /> Saving…
                        </>
                      ) : (
                        <>
                          <Check size={14} /> Commit Resolution Note
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
};

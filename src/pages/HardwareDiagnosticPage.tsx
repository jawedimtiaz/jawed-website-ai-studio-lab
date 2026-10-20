import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Cpu,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Check,
  RefreshCw,
  ShieldAlert,
  ListChecks,
  Activity,
  FileText,
  Search,
  Zap,
  ArrowRight,
  Eye,
  Camera,
  Trash2,
  Layers,
  Wrench,
  Radio
} from 'lucide-react';
import { HardwareDiagnosticResult } from '../server/geminiHardwareDiagnostic';

// Realistic sample presets with high-fidelity SVG/Canvas-rendered hardware illustrations
const SAMPLE_PRESETS: {
  id: string;
  title: string;
  category: string;
  symptoms: string;
  badge: string;
  svgDataUri: string;
}[] = [
  {
    id: 'mb-post-code',
    title: 'Motherboard Debug Code "00"',
    category: 'Server / PC Motherboard',
    symptoms: 'Board powers on with fans at 100%, but no display. 7-segment hex display permanently halts on code 00.',
    badge: 'POST Code / CPU Rail',
    svgDataUri:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%23131c2e"/><rect x="20" y="20" width="360" height="260" rx="8" fill="%231e293b" stroke="%2338bdf8" stroke-width="2"/><circle cx="50" cy="50" r="12" fill="%230f172a" stroke="%2364748b" stroke-width="2"/><circle cx="50" cy="250" r="12" fill="%230f172a" stroke="%2364748b" stroke-width="2"/><circle cx="350" cy="50" r="12" fill="%230f172a" stroke="%2364748b" stroke-width="2"/><circle cx="350" cy="250" r="12" fill="%230f172a" stroke="%2364748b" stroke-width="2"/><rect x="90" y="60" width="130" height="130" rx="6" fill="%23090d16" stroke="%23f59e0b" stroke-width="3"/><text x="155" y="130" font-family="monospace" font-size="14" fill="%23f59e0b" font-weight="bold" text-anchor="middle">LGA 1700</text><rect x="250" y="70" width="90" height="60" rx="4" fill="%23050811" stroke="%23ef4444" stroke-width="2"/><text x="295" y="112" font-family="monospace" font-size="34" fill="%23ef4444" font-weight="bold" text-anchor="middle">00</text><text x="295" y="145" font-family="sans-serif" font-size="11" fill="%2394a3b8" text-anchor="middle">DEBUG HEX LED</text><rect x="90" y="210" width="250" height="40" rx="3" fill="%230f172a" stroke="%2338bdf8" stroke-width="1.5"/><text x="215" y="235" font-family="monospace" font-size="12" fill="%2338bdf8" text-anchor="middle">PCIe 5.0 x16 Primary Slot</text></svg>'
  },
  {
    id: 'blown-capacitor',
    title: 'Bulging Electrolytic Capacitor',
    category: 'Power Supply / VRM',
    symptoms: 'Intermittent power supply shutdown, burning electrical odor, and high ripple voltage.',
    badge: 'VRM / Capacitor',
    svgDataUri:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%23141e17"/><rect x="30" y="30" width="340" height="240" rx="8" fill="%231a2e22" stroke="%2310b981" stroke-width="2"/><rect x="60" y="80" width="80" height="130" rx="8" fill="%23064e3b" stroke="%2334d399" stroke-width="2"/><ellipse cx="100" cy="80" rx="40" ry="12" fill="%23047857"/><path d="M 80 80 Q 100 68 120 80" stroke="%23a7f3d0" stroke-width="2" fill="none"/><text x="100" y="150" font-family="sans-serif" font-size="11" fill="%23ecfdf5" text-anchor="middle" font-weight="bold">3300uF 16V</text><rect x="180" y="80" width="90" height="130" rx="8" fill="%23450a0a" stroke="%23ef4444" stroke-width="3"/><ellipse cx="225" cy="80" rx="45" ry="24" fill="%237f1d1d"/><path d="M 200 80 Q 225 45 250 80" stroke="%23f87171" stroke-width="4" fill="none"/><circle cx="230" cy="65" r="5" fill="%23f59e0b"/><text x="225" y="150" font-family="sans-serif" font-size="11" fill="%23fee2e2" text-anchor="middle" font-weight="bold">BLOWN VENT</text><text x="225" y="170" font-family="sans-serif" font-size="10" fill="%23f87171" text-anchor="middle">Electrolyte Crust</text><text x="200" y="250" font-family="sans-serif" font-size="12" fill="%23fca5a5" font-weight="bold" text-anchor="middle">High ESR / VRM Filter Failure</text></svg>'
  },
  {
    id: 'sfp-switch-flapping',
    title: 'Switch SFP+ Amber LED Flapping',
    category: 'Network Switch',
    symptoms: 'Port 8 optical link keeps dropping every 4 seconds. Ping drops 40% of packets.',
    badge: '10GBASE-SR / Fiber',
    svgDataUri:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%230b0f19"/><rect x="20" y="50" width="360" height="200" rx="6" fill="%231e293b" stroke="%23475569" stroke-width="2"/><rect x="40" y="80" width="70" height="50" rx="3" fill="%230f172a" stroke="%2338bdf8" stroke-width="1.5"/><circle cx="55" cy="70" r="4" fill="%2310b981"/><text x="75" y="110" font-family="monospace" font-size="11" fill="%2338bdf8" text-anchor="middle">10G-1</text><rect x="130" y="80" width="70" height="50" rx="3" fill="%230f172a" stroke="%2338bdf8" stroke-width="1.5"/><circle cx="145" cy="70" r="4" fill="%2310b981"/><text x="165" y="110" font-family="monospace" font-size="11" fill="%2338bdf8" text-anchor="middle">10G-2</text><rect x="220" y="80" width="90" height="60" rx="4" fill="%23450a0a" stroke="%23ef4444" stroke-width="2.5"/><circle cx="235" cy="70" r="6" fill="%23f59e0b" stroke="%23fbbf24" stroke-width="2"/><text x="265" y="112" font-family="monospace" font-size="13" fill="%23fca5a5" font-weight="bold" text-anchor="middle">SFP+ 8</text><text x="265" y="130" font-family="sans-serif" font-size="9" fill="%23f59e0b" text-anchor="middle">LINK LOSS</text><text x="200" y="210" font-family="monospace" font-size="13" fill="%23fbbf24" text-anchor="middle">CRC ERRORS: 14,291 / CRC RX DROP</text><text x="200" y="232" font-family="sans-serif" font-size="11" fill="%2394a3b8" text-anchor="middle">OM4 Multimode LC Duplex - Low Optical RX Power</text></svg>'
  },
  {
    id: 'rj45-t568-crimp',
    title: 'RJ45 Termination Pinout Mismatch',
    category: 'Cable / Connector',
    symptoms: 'Cable tester reports split pair on pins 3 and 6. Link negotiates at only 100Mbps instead of 1Gbps.',
    badge: 'T-568B / Ethernet',
    svgDataUri:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%2318181b"/><rect x="40" y="40" width="320" height="220" rx="8" fill="%2327272a" stroke="%2338bdf8" stroke-width="2"/><text x="200" y="75" font-family="sans-serif" font-size="14" fill="%23f4f4f5" font-weight="bold" text-anchor="middle">Cat6A 8P8C Modular Plug</text><g transform="translate(70, 100)"><rect x="0" y="0" width="25" height="70" fill="%23f97316"/><rect x="30" y="0" width="25" height="70" fill="%23ea580c"/><rect x="60" y="0" width="25" height="70" fill="%2322c55e"/><rect x="90" y="0" width="25" height="70" fill="%233b82f6"/><rect x="120" y="0" width="25" height="70" fill="%230284c7"/><rect x="150" y="0" width="25" height="70" fill="%2315803d"/><rect x="180" y="0" width="25" height="70" fill="%23a855f7"/><rect x="210" y="0" width="25" height="70" fill="%237e22ce"/><text x="12" y="90" font-family="monospace" font-size="11" fill="%23a1a1aa">1</text><text x="42" y="90" font-family="monospace" font-size="11" fill="%23a1a1aa">2</text><text x="72" y="90" font-family="monospace" font-size="11" fill="%23ef4444" font-weight="bold">3*</text><text x="102" y="90" font-family="monospace" font-size="11" fill="%23a1a1aa">4</text><text x="132" y="90" font-family="monospace" font-size="11" fill="%23a1a1aa">5</text><text x="162" y="90" font-family="monospace" font-size="11" fill="%23ef4444" font-weight="bold">6*</text><text x="192" y="90" font-family="monospace" font-size="11" fill="%23a1a1aa">7</text><text x="222" y="90" font-family="monospace" font-size="11" fill="%23a1a1aa">8</text></g><text x="200" y="225" font-family="sans-serif" font-size="12" fill="%23fca5a5" font-weight="bold" text-anchor="middle">Pin 3/6 Inverted (Split-Pair Wiring Detected)</text></svg>'
  }
];

export const HardwareDiagnosticPage: React.FC = () => {
  // Input State
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [deviceCategory, setDeviceCategory] = useState<string>('Server / PC Motherboard');
  const [symptoms, setSymptoms] = useState<string>('');

  // Processing State
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [diagnosticResult, setDiagnosticResult] = useState<HardwareDiagnosticResult | null>(null);

  // Interactive Checklist Completed Indices
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportSectionRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to report when generated
  useEffect(() => {
    if (diagnosticResult && reportSectionRef.current) {
      reportSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [diagnosticResult]);

  const handleImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please upload a valid image file (PNG, JPG, WebP, or SVG).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Image size exceeds 10MB. Please upload a smaller photo.');
      return;
    }

    setErrorMsg(null);
    setMimeType(file.type);

    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImage(e.target?.result as string);
      setDiagnosticResult(null);
      setCheckedItems({});
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleSelectPreset = (preset: (typeof SAMPLE_PRESETS)[0]) => {
    setSelectedImage(preset.svgDataUri);
    setMimeType('image/svg+xml');
    setDeviceCategory(preset.category);
    setSymptoms(preset.symptoms);
    setErrorMsg(null);
    setDiagnosticResult(null);
    setCheckedItems({});
  };

  const handleAnalyze = async () => {
    if (!selectedImage) {
      setErrorMsg('Please select or upload a hardware image first.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/hardware-diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: selectedImage,
          mimeType,
          deviceCategory,
          symptoms: symptoms.trim() || undefined
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to complete diagnostic analysis.');
      }

      setDiagnosticResult(data.result);
      setCheckedItems({});
    } catch (err: any) {
      console.error('Diagnostic error:', err);
      setErrorMsg(err.message || 'Diagnostic failed. Please check connection and try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleCheck = (index: number) => {
    setCheckedItems((prev) => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const handleCopyReport = () => {
    if (!diagnosticResult) return;
    const fullText = diagnosticResult.rawMarkdownReport;
    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleDownloadReport = () => {
    if (!diagnosticResult) return;
    const blob = new Blob([diagnosticResult.rawMarkdownReport], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Hardware-Diagnostic-Report-${Date.now().toString(36).toUpperCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <main
      id="main-content"
      style={{
        backgroundColor: '#0a0d14',
        color: '#e2e8f0',
        minHeight: '100vh',
        paddingBottom: '5rem'
      }}
    >
      {/* Top Banner Navigation Header */}
      <div
        style={{
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#0d131f',
          padding: '0.75rem 1.25rem',
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
              backgroundColor: '#38bdf8',
              boxShadow: '0 0 8px #38bdf8'
            }}
          />
          <span style={{ fontWeight: 700, color: '#38bdf8', letterSpacing: '0.05em' }}>
            GEMINI MULTIMODAL HARDWARE VISION INSPECTOR
          </span>
          <span style={{ color: '#64748b' }}>|</span>
          <span style={{ color: '#94a3b8' }}>
            Model Engine: <code style={{ color: '#a5f3fc' }}>gemini-3.8-flash</code>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link
            to="/it-service"
            style={{
              color: '#38bdf8',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Radio size={13} /> IT Service Desk & Portal
          </Link>
          <Link
            to="/tools/"
            style={{
              color: '#94a3b8',
              textDecoration: 'none',
              fontSize: '0.8rem'
            }}
          >
            All Interactive Tools
          </Link>
        </div>
      </div>

      <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1rem' }}>
        {/* Hero Section */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div className="breadcrumbs" style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
            <Link to="/" style={{ color: '#94a3b8', textDecoration: 'none' }}>Home</Link>
            <span style={{ margin: '0 0.5rem' }}>/</span>
            <Link to="/tools/" style={{ color: '#94a3b8', textDecoration: 'none' }}>Tools</Link>
            <span style={{ margin: '0 0.5rem' }}>/</span>
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>Hardware Diagnostic & Image Inspector</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div
              style={{
                padding: '10px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(56,189,248,0.2), rgba(99,102,241,0.2))',
                border: '1px solid rgba(56,189,248,0.4)',
                color: '#38bdf8'
              }}
            >
              <Cpu size={28} />
            </div>
            <div>
              <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                AI Hardware Diagnostic &amp; Image Inspector
              </h1>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.98rem' }}>
                Upload or drop photos of motherboard error codes, tangled server racks, blown capacitors, or network switch indicators for instant multimodal field analysis.
              </p>
            </div>
          </div>
        </div>

        {/* Global Error Alert */}
        {errorMsg && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              color: '#fca5a5',
              padding: '0.9rem 1.25rem',
              borderRadius: '8px',
              marginBottom: '1.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}
          >
            <AlertTriangle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* SECTION 1: WORKBENCH GRID (PRESETS + UPLOADER + CONTEXT) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.2fr) minmax(320px, 1.8fr)', gap: '2rem', marginBottom: '2.5rem' }}>
          {/* Left Column: Sample Scenarios & Device Context */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Sample Presets Card */}
            <div
              style={{
                backgroundColor: '#111827',
                border: '1px solid #1f293d',
                borderRadius: '12px',
                padding: '1.25rem',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <Zap size={16} style={{ color: '#38bdf8' }} />
                <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
                  Test Scenarios (1-Click Presets)
                </h2>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 1rem' }}>
                Don't have a hardware photo right now? Select a pre-configured failure scenario:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {SAMPLE_PRESETS.map((preset) => {
                  const isSelected = selectedImage === preset.svgDataUri;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      style={{
                        textAlign: 'left',
                        backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.15)' : '#0b0f17',
                        border: isSelected ? '1px solid #38bdf8' : '1px solid #1e293b',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: isSelected ? '#38bdf8' : '#f1f5f9' }}>
                          {preset.title}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                          {preset.category}
                        </div>
                      </div>
                      <span
                        style={{
                          backgroundColor: '#1e293b',
                          color: '#cbd5e1',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 600
                        }}
                      >
                        {preset.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Context Inputs */}
            <div
              style={{
                backgroundColor: '#111827',
                border: '1px solid #1f293d',
                borderRadius: '12px',
                padding: '1.25rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <Layers size={16} style={{ color: '#38bdf8' }} />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
                  Inspection Context
                </h3>
              </div>

              {/* Category Selector */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>
                  Hardware Category
                </label>
                <select
                  value={deviceCategory}
                  onChange={(e) => setDeviceCategory(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#0b0f17',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                >
                  <option value="Server / PC Motherboard">Server / PC Motherboard (POST codes, VRM, LGA/AM4)</option>
                  <option value="Power Supply / VRM">Power Supply Unit / VRM (Capacitors, Chokes, MOSFETs)</option>
                  <option value="Network Switch">Network Switch / SFP+ Transceiver (LEDs, Optical link)</option>
                  <option value="Cable / Connector">Structured Cabling / RJ45 / Fiber (T568A/B, LC/SC, terminations)</option>
                  <option value="Storage Drive">NVMe / SAS / SATA Drive (Disk backplane, controller card)</option>
                  <option value="Workstation Component">General Workstation / Mobile Device</option>
                </select>
              </div>

              {/* Symptoms Input */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>
                  Observed Symptoms / Beep Codes (Optional)
                </label>
                <textarea
                  rows={3}
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  placeholder="e.g. 3 short beeps on boot, link light amber, burning smell after power surge..."
                  style={{
                    width: '100%',
                    backgroundColor: '#0b0f17',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Right Column: Drag & Drop Image Uploader & Live Preview */}
          <div
            style={{
              backgroundColor: '#111827',
              border: '1px solid #1f293d',
              borderRadius: '12px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Camera size={18} style={{ color: '#38bdf8' }} />
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
                  Hardware Photo Feed
                </h2>
              </div>

              {selectedImage && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedImage(null);
                    setDiagnosticResult(null);
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid #334155',
                    color: '#fca5a5',
                    padding: '4px 10px',
                    borderRadius: '5px',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Trash2 size={12} /> Clear Image
                </button>
              )}
            </div>

            {/* Hidden native input */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

            {/* Drop Zone / Image Display */}
            {!selectedImage ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed #334155',
                  borderRadius: '10px',
                  padding: '3rem 2rem',
                  textAlign: 'center',
                  backgroundColor: '#0c1017',
                  cursor: 'pointer',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '260px',
                  transition: 'border-color 0.15s ease'
                }}
              >
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#38bdf8',
                    marginBottom: '1rem'
                  }}
                >
                  <Upload size={26} />
                </div>
                <h3 style={{ fontSize: '1.1rem', margin: '0 0 0.35rem', color: '#f8fafc', fontWeight: 700 }}>
                  Drag &amp; Drop Hardware Image
                </h3>
                <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#94a3b8', maxWidth: '360px' }}>
                  Supports photo uploads of motherboards, server backplanes, Ethernet pinouts, patch panels, or optical SFP transceivers (PNG, JPG, WebP up to 10MB).
                </p>
                <button
                  type="button"
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #38bdf8',
                    color: '#38bdf8',
                    padding: '8px 18px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    pointerEvents: 'none'
                  }}
                >
                  Browse Device Photo
                </button>
              </div>
            ) : (
              <div
                style={{
                  flex: 1,
                  backgroundColor: '#080c14',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '260px',
                  padding: '1rem',
                  position: 'relative'
                }}
              >
                <img
                  src={selectedImage}
                  alt="Hardware diagnostic subject"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '320px',
                    objectFit: 'contain',
                    borderRadius: '6px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.6)'
                  }}
                />
              </div>
            )}

            {/* Run Diagnostic CTA Button */}
            <div style={{ marginTop: '1.25rem' }}>
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={!selectedImage || isAnalyzing}
                style={{
                  width: '100%',
                  backgroundColor: !selectedImage || isAnalyzing ? '#1e293b' : '#0284c7',
                  border: 'none',
                  color: !selectedImage || isAnalyzing ? '#64748b' : '#ffffff',
                  padding: '14px 20px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: !selectedImage || isAnalyzing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: selectedImage && !isAnalyzing ? '0 4px 18px rgba(2, 132, 199, 0.45)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    Gemini Multimodal Reasoning in Progress…
                  </>
                ) : (
                  <>
                    <Search size={18} />
                    Inspect Hardware &amp; Generate Diagnostic Report
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 2: LIVE REPORT VIEW (GENERATED BY GEMINI) */}
        {diagnosticResult && (
          <div
            ref={reportSectionRef}
            style={{
              backgroundColor: '#111827',
              border: '1px solid #38bdf8',
              borderRadius: '12px',
              padding: '2rem',
              boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
              position: 'relative'
            }}
          >
            {/* Header with Title and Action Buttons */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                borderBottom: '1px solid #1e293b',
                paddingBottom: '1.25rem',
                marginBottom: '1.75rem'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                  <span
                    style={{
                      backgroundColor: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      textTransform: 'uppercase'
                    }}
                  >
                    Verified Diagnostic Result
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    Standard: <strong style={{ color: '#f8fafc' }}>{diagnosticResult.faultIdentified.standardsIdentified}</strong>
                  </span>
                </div>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
                  {diagnosticResult.faultIdentified.probableIssue}
                </h2>
              </div>

              {/* Action Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <button
                  type="button"
                  onClick={handleCopyReport}
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    color: copied ? '#34d399' : '#e2e8f0',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied to Clipboard!' : 'Copy Report'}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadReport}
                  style={{
                    backgroundColor: '#0284c7',
                    border: 'none',
                    color: '#ffffff',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Download size={14} />
                  Download .MD
                </button>

                <Link
                  to="/it-service"
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #38bdf8',
                    color: '#38bdf8',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  Log Service Ticket <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            {/* Executive Summary Callout */}
            <div
              style={{
                backgroundColor: '#0b0f17',
                borderLeft: '4px solid #38bdf8',
                borderRadius: '0 8px 8px 0',
                padding: '1rem 1.25rem',
                marginBottom: '1.75rem',
                fontSize: '0.95rem',
                color: '#e2e8f0',
                lineHeight: 1.6
              }}
            >
              <strong>Executive Diagnostic Summary: </strong>
              {diagnosticResult.summary}
            </div>

            {/* Diagnostic Details Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '1.75rem' }}>
              {/* Component & Probability */}
              <div
                style={{
                  backgroundColor: '#0c1017',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                  padding: '1.25rem'
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Target Component
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.75rem' }}>
                  {diagnosticResult.faultIdentified.component}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Confidence:</span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      backgroundColor:
                        diagnosticResult.faultIdentified.confidenceLevel === 'High'
                          ? 'rgba(16, 185, 129, 0.2)'
                          : 'rgba(245, 158, 11, 0.2)',
                      color:
                        diagnosticResult.faultIdentified.confidenceLevel === 'High'
                          ? '#34d399'
                          : '#fbbf24'
                    }}
                  >
                    {diagnosticResult.faultIdentified.confidenceLevel} Confidence
                  </span>
                </div>
              </div>

              {/* Visual Indicators Observed */}
              <div
                style={{
                  backgroundColor: '#0c1017',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                  padding: '1.25rem'
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                  Visual Cues &amp; Indicators
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.55 }}>
                  {diagnosticResult.faultIdentified.visualIndicators.map((cue, idx) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>
                      {cue}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommended Field Actions */}
              <div
                style={{
                  backgroundColor: '#0c1017',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                  padding: '1.25rem'
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                  Recommended Action / Parts
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.55 }}>
                  {diagnosticResult.recommendedActions.map((act, idx) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>
                      {act}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Interactive Step-by-Step Field Troubleshooting Checklist */}
            <div
              style={{
                backgroundColor: '#0b0f17',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                padding: '1.5rem',
                marginBottom: '1.75rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ListChecks size={20} style={{ color: '#38bdf8' }} />
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9' }}>
                    Interactive Field Troubleshooting Checklist ({diagnosticResult.troubleshootingChecklist.length} Steps)
                  </h3>
                </div>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Click to check off verified isolation steps
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {diagnosticResult.troubleshootingChecklist.map((step, idx) => {
                  const isChecked = Boolean(checkedItems[idx]);
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleCheck(idx)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.85rem',
                        backgroundColor: isChecked ? 'rgba(16, 185, 129, 0.08)' : '#111827',
                        border: isChecked ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid #1e293b',
                        borderRadius: '6px',
                        padding: '10px 14px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '4px',
                          backgroundColor: isChecked ? '#10b981' : '#0b0f17',
                          border: isChecked ? '1px solid #10b981' : '1px solid #475569',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          marginTop: '2px',
                          flexShrink: 0
                        }}
                      >
                        {isChecked && <Check size={12} strokeWidth={3} />}
                      </div>
                      <div
                        style={{
                          fontSize: '0.88rem',
                          color: isChecked ? '#94a3b8' : '#e2e8f0',
                          textDecoration: isChecked ? 'line-through' : 'none',
                          lineHeight: 1.5
                        }}
                      >
                        <strong style={{ color: isChecked ? '#64748b' : '#38bdf8', marginRight: '6px' }}>
                          Step {idx + 1}:
                        </strong>
                        {step}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Safety Precautions Warning Box */}
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '10px',
                padding: '1.25rem 1.5rem',
                marginBottom: '1.75rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', color: '#f87171' }}>
                <ShieldAlert size={20} />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                  Mandatory Hardware Safety Precautions
                </h4>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
                {diagnosticResult.safetyPrecautions.map((safe, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      fontSize: '0.85rem',
                      color: '#fecaca',
                      lineHeight: 1.45
                    }}
                  >
                    <span style={{ color: '#ef4444', fontWeight: 700 }}>⚠️</span>
                    <span>{safe}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Raw Markdown Report Accordion */}
            <details
              style={{
                backgroundColor: '#0c1017',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '0.75rem 1.25rem'
              }}
            >
              <summary
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#94a3b8',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                View Full Raw Markdown Report (for ticketing &amp; audit logging)
              </summary>
              <pre
                style={{
                  marginTop: '1rem',
                  backgroundColor: '#060910',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  padding: '1rem',
                  color: '#cbd5e1',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  whiteSpace: 'pre-wrap',
                  overflowX: 'auto',
                  lineHeight: 1.5
                }}
              >
                {diagnosticResult.rawMarkdownReport}
              </pre>
            </details>
          </div>
        )}
      </div>
    </main>
  );
};

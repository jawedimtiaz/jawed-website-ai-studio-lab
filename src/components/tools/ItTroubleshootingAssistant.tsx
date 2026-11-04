import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Camera,
  Upload,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  FileText,
  Search,
  ShieldAlert,
  ListChecks,
  Wrench,
  Layers,
  ArrowRight
} from 'lucide-react';
import { HardwareDiagnosticResult } from '../../server/geminiHardwareDiagnostic';

interface FlowNode {
  q: string;
  why: string;
  a: string;
  an: string;
  ak: string;
  kn: string;
  yesNext: string;
  noNext: string;
}

const FLOWS: Record<string, Record<string, FlowNode> | FlowNode> = {
  network: {
    start: {
      q: 'Can the device reach any known website or network resource?',
      why: 'This separates a local connectivity problem from a problem that may begin after basic connectivity.',
      a: 'Yes',
      an: 'Basic connectivity works. Next test name resolution.',
      ak: 'No',
      kn: 'Basic connectivity is not working. Check local connection state before moving to DNS or application tests.',
      yesNext: 'dns',
      noNext: 'end'
    },
    dns: {
      q: 'Can the device resolve a known domain name?',
      why: 'If connectivity works but names cannot be resolved, name resolution becomes the next boundary to investigate.',
      a: 'Yes',
      an: 'Name resolution works. Next test reachability to the target service.',
      ak: 'No',
      kn: 'Name resolution is the current boundary. Review DNS configuration/status using your approved support process.',
      yesNext: 'reach',
      noNext: 'end'
    }
  },
  reach: {
    q: 'Can the device reach the target service or endpoint?',
    why: 'This distinguishes reachability from a higher application/service-layer problem.',
    a: 'Yes',
    an: 'Reachability works. Investigate the application or service behavior.',
    ak: 'No',
    kn: 'The issue is at reachability or the path to the service. Check scope and approved network diagnostics.',
    yesNext: 'end',
    noNext: 'end'
  },
  microsoft: {
    start: {
      q: 'Does the sign-in problem occur for the same user in another relevant application or device?',
      why: 'A repeatable problem across contexts points toward the account/identity path; a problem limited to one device or application points elsewhere.',
      a: 'Yes',
      an: 'The issue follows the user across contexts. Review account/identity evidence and approved sign-in diagnostics.',
      ak: 'No',
      kn: 'The issue may be device or application specific. Test the same account in another context before changing the device.',
      yesNext: 'service',
      noNext: 'end'
    }
  },
  service: {
    q: 'Do other users have the same sign-in or service symptom?',
    why: 'Multiple affected users can indicate a shared identity or service issue rather than one local device.',
    a: 'Yes',
    an: 'Multiple users are affected. Check approved service/identity status and escalate if outside first-response scope.',
    ak: 'No',
    kn: 'The issue appears user-specific. Continue with approved account/identity checks.',
    yesNext: 'end',
    noNext: 'end'
  },
  apple: {
    start: {
      q: 'Does the same user or service work normally elsewhere?',
      why: 'A comparison helps determine whether the Mac/device is the likely boundary.',
      a: 'Yes',
      an: 'The comparison points toward the Mac/device. Check basic device state, network, storage and the affected application.',
      ak: 'No',
      kn: 'The issue may follow the user or service. Test scope before making device changes.',
      yesNext: 'appleChange',
      noNext: 'end'
    }
  },
  appleChange: {
    q: 'Was there a recent update, configuration or application change?',
    why: 'A recent change is useful evidence, but it is not proof of root cause.',
    a: 'Yes',
    an: 'Record the change and test whether it is relevant using a supported, reversible check.',
    ak: 'No',
    kn: 'No known change. Continue with basic device/application checks and scope comparisons.',
    yesNext: 'end',
    noNext: 'end'
  },
  windows: {
    start: {
      q: 'Does the same user work normally on another device?',
      why: 'This is a high-value comparison for separating device-specific behavior from account or service behavior.',
      a: 'Yes',
      an: 'The issue points toward the Windows device. Check device state, connectivity and the affected application.',
      ak: 'No',
      kn: 'The issue may follow the user or service. Compare another user or device before changing the Windows device.',
      yesNext: 'windowsChange',
      noNext: 'end'
    }
  },
  windowsChange: {
    q: 'Did the problem begin after a recent update, configuration or application change?',
    why: 'Timing can identify a useful variable to test without assuming causation.',
    a: 'Yes',
    an: 'Record the change and test it with the least disruptive supported step.',
    ak: 'No',
    kn: 'No known change. Continue with scope and basic device/application checks.',
    yesNext: 'end',
    noNext: 'end'
  },
  general: {
    start: {
      q: 'Does the issue follow the same user in another relevant context?',
      why: 'A comparison helps separate a user or service issue from a device-specific issue.',
      a: 'Yes',
      an: 'The issue follows the user across contexts. Compare another user or approved service status before changing the device.',
      ak: 'No',
      kn: 'The issue may be device-specific. Check device state and the affected application using the least disruptive supported steps.',
      yesNext: 'end',
      noNext: 'end'
    }
  }
};

const HARDWARE_PRESETS = [
  {
    id: 'mb-post-code',
    title: 'Motherboard Debug Code "00"',
    category: 'Server / PC Motherboard',
    symptoms: 'Board powers on with fans at 100%, but no display. 7-segment hex display permanently halts on code 00.',
    svgDataUri:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%23131c2e"/><rect x="20" y="20" width="360" height="260" rx="8" fill="%231e293b" stroke="%2338bdf8" stroke-width="2"/><rect x="250" y="70" width="90" height="60" rx="4" fill="%23050811" stroke="%23ef4444" stroke-width="2"/><text x="295" y="112" font-family="monospace" font-size="34" fill="%23ef4444" font-weight="bold" text-anchor="middle">00</text><text x="295" y="145" font-family="sans-serif" font-size="11" fill="%2394a3b8" text-anchor="middle">DEBUG HEX LED</text></svg>'
  },
  {
    id: 'blown-capacitor',
    title: 'Bulging Electrolytic Capacitor',
    category: 'Power Supply / VRM',
    symptoms: 'Intermittent power supply shutdown, burning electrical odor, high ripple voltage on CPU VRM rail.',
    svgDataUri:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%23141e17"/><rect x="30" y="30" width="340" height="240" rx="8" fill="%231a2e22" stroke="%2310b981" stroke-width="2"/><rect x="180" y="80" width="90" height="130" rx="8" fill="%23450a0a" stroke="%23ef4444" stroke-width="3"/><ellipse cx="225" cy="80" rx="45" ry="24" fill="%237f1d1d"/><text x="225" y="150" font-family="sans-serif" font-size="11" fill="%23fee2e2" text-anchor="middle" font-weight="bold">BLOWN VENT</text></svg>'
  },
  {
    id: 'sfp-switch-flapping',
    title: 'Switch SFP+ Port Amber LED',
    category: 'Network Switch',
    symptoms: '10G link flapping every 4 seconds. High CRC RX errors and optical power loss.',
    svgDataUri:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%230b0f19"/><rect x="20" y="50" width="360" height="200" rx="6" fill="%231e293b" stroke="%23475569" stroke-width="2"/><rect x="220" y="80" width="90" height="60" rx="4" fill="%23450a0a" stroke="%23ef4444" stroke-width="2.5"/><circle cx="235" cy="70" r="6" fill="%23f59e0b"/><text x="265" y="112" font-family="monospace" font-size="13" fill="%23fca5a5" font-weight="bold" text-anchor="middle">SFP+ 8</text></svg>'
  }
];

export const ItTroubleshootingAssistant: React.FC = () => {
  const [symptom, setSymptom] = useState('');
  const [category, setCategory] = useState('');
  const [currentNode, setCurrentNode] = useState<FlowNode | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [finalEvidence, setFinalEvidence] = useState('');

  // Dedicated Hardware Image Inspection Card State
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/jpeg');
  const [equipmentCategory, setEquipmentCategory] = useState<string>('Server / PC Motherboard');
  const [equipmentNotes, setEquipmentNotes] = useState<string>('');
  const [isAnalyzingImage, setIsAnalyzingImage] = useState<boolean>(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [diagnosticResult, setDiagnosticResult] = useState<HardwareDiagnosticResult | null>(null);
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [copiedServiceNote, setCopiedServiceNote] = useState<boolean>(false);
  const [symptomSearchQuery, setSymptomSearchQuery] = useState<string>('');

  const handleFormatServiceDeskNote = () => {
    if (!diagnosticResult) return;
    const checkedList = [
      'Fan Noise 100% RPM',
      'Storage SMART Error',
      'Display Flickering',
      'Blown Electrolytic Cap',
      'SFP+ Link Flapping',
      'Split-Pair RJ45 Crimp'
    ].filter((_, idx) => checkedSymptoms[idx]);

    const note = `Issue / Request: Hardware inspection for ${equipmentCategory} (${equipmentNotes || diagnosticResult.faultIdentified.component})

Actions Taken: Performed AI visual inspection and symptom checklist.
- Detected Visual Indicators: ${diagnosticResult.faultIdentified.visualIndicators.join(', ')}
- Inspected Symptoms Checked: ${checkedList.length > 0 ? checkedList.join(', ') : 'None marked'}

Resolution / Current Status: Identified ${diagnosticResult.faultIdentified.component} issue (${diagnosticResult.faultIdentified.probableIssue}) with ${diagnosticResult.faultIdentified.confidenceLevel} confidence. Standard: ${diagnosticResult.faultIdentified.standardsIdentified}.

Follow-up: Recommended checklist steps:
${diagnosticResult.troubleshootingChecklist.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;

    navigator.clipboard.writeText(note);
    setCopiedServiceNote(true);
    setTimeout(() => setCopiedServiceNote(false), 3000);
  };
  const [checkedSymptoms, setCheckedSymptoms] = useState<Record<number, boolean>>(() => {
    try {
      const saved = localStorage.getItem('it_checked_symptoms');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleToggleSymptom = (index: number, checked: boolean) => {
    const updated = { ...checkedSymptoms, [index]: checked };
    setCheckedSymptoms(updated);
    try {
      localStorage.setItem('it_checked_symptoms', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save checked symptoms', e);
    }
  };

  const handleResetChecklist = () => {
    setCheckedSymptoms({});
    try {
      localStorage.removeItem('it_checked_symptoms');
    } catch (e) {
      console.error('Failed to reset checked symptoms', e);
    }
  };
  const [diagnosticHistory, setDiagnosticHistory] = useState<Array<{
    id: string;
    timestamp: string;
    category: string;
    result: HardwareDiagnosticResult;
  }>>(() => {
    try {
      const saved = localStorage.getItem('it_diagnostic_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const saveToHistory = (res: HardwareDiagnosticResult) => {
    const newItem = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleString(),
      category: equipmentCategory,
      result: res
    };
    const updated = [newItem, ...diagnosticHistory.slice(0, 9)];
    setDiagnosticHistory(updated);
    try {
      localStorage.setItem('it_diagnostic_history', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save history', e);
    }
  };

  const handleClearHistory = () => {
    setDiagnosticHistory([]);
    try {
      localStorage.removeItem('it_diagnostic_history');
    } catch (e) {
      console.error('Failed to clear history', e);
    }
  };

  const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);

  const handleCopyHistoryItem = (item: typeof diagnosticHistory[0]) => {
    const summary = `[Hardware Inspection Summary - ${item.timestamp}]
Category: ${item.category}
Component: ${item.result.faultIdentified.component}
Probable Issue: ${item.result.faultIdentified.probableIssue} (${item.result.faultIdentified.confidenceLevel} Confidence)
Visual Indicators: ${item.result.faultIdentified.visualIndicators.join(', ')}
Checklist:
${item.result.troubleshootingChecklist.map((c, i) => `${i + 1}. ${c}`).join('\n')}
Safety Precautions:
${item.result.safetyPrecautions.map((s) => `- ${s}`).join('\n')}`;

    navigator.clipboard.writeText(summary);
    setCopiedHistoryId(item.id);
    setTimeout(() => setCopiedHistoryId(null), 2500);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!symptom.trim() || !category) return;

    const catFlow = FLOWS[category];
    if (catFlow && 'start' in catFlow) {
      setCurrentNode((catFlow as Record<string, FlowNode>).start);
      setIsFinished(false);
      setFinalEvidence('');
    }
  };

  const handleAnswer = (choice: 'yes' | 'no') => {
    if (!currentNode) return;
    const text = choice === 'yes' ? currentNode.an : currentNode.kn;
    const nextKey = choice === 'yes' ? currentNode.yesNext : currentNode.noNext;

    if (nextKey === 'end') {
      setIsFinished(true);
      setFinalEvidence(text);
      return;
    }

    const catFlow = FLOWS[category];
    let nextNode: FlowNode | null = null;
    if (catFlow && typeof catFlow === 'object' && nextKey in catFlow) {
      nextNode = (catFlow as Record<string, FlowNode>)[nextKey];
    } else if (FLOWS[nextKey]) {
      nextNode = FLOWS[nextKey] as FlowNode;
    }

    if (nextNode) {
      setCurrentNode(nextNode);
    } else {
      setIsFinished(true);
      setFinalEvidence(text);
    }
  };

  const handleClear = () => {
    setSymptom('');
    setCategory('');
    setCurrentNode(null);
    setIsFinished(false);
    setFinalEvidence('');
  };

  // Image Upload Handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith('image/')) {
        setImageError('Please select a valid image file (PNG, JPG, WebP, SVG).');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setImageError('Image file exceeds 10MB limit.');
        return;
      }

      setImageError(null);
      setImageMime(file.type);
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImagePreview(ev.target?.result as string);
        setDiagnosticResult(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectPreset = (preset: typeof HARDWARE_PRESETS[0]) => {
    setImagePreview(preset.svgDataUri);
    setImageMime('image/svg+xml');
    setEquipmentCategory(preset.category);
    setEquipmentNotes(preset.symptoms);
    setImageError(null);
    setDiagnosticResult(null);
  };

  const handleInspectImage = async () => {
    if (!imagePreview) {
      setImageError('Please upload an equipment photo or select a sample preset first.');
      return;
    }

    setIsAnalyzingImage(true);
    setImageError(null);

    try {
      const res = await fetch('/api/hardware-diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imagePreview,
          mimeType: imageMime,
          deviceCategory: equipmentCategory,
          symptoms: equipmentNotes.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to analyze equipment photo.');
      }

      setDiagnosticResult(data.result);
      saveToHistory(data.result);
    } catch (err: any) {
      console.error('Image diagnostic error:', err);
      setImageError(err.message || 'Failed to inspect hardware image. Please try again.');
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const handleApplyResultToFlow = () => {
    if (!diagnosticResult) return;
    const summaryText = `[Hardware Photo Inspection] ${diagnosticResult.faultIdentified.component}: ${diagnosticResult.faultIdentified.probableIssue} (${diagnosticResult.faultIdentified.confidenceLevel} Confidence). Visual indicators: ${diagnosticResult.faultIdentified.visualIndicators.join(', ')}.`;
    setSymptom(summaryText);
    if (equipmentCategory.toLowerCase().includes('network')) {
      setCategory('network');
    } else if (equipmentCategory.toLowerCase().includes('apple') || equipmentCategory.toLowerCase().includes('mac')) {
      setCategory('apple');
    } else if (equipmentCategory.toLowerCase().includes('windows')) {
      setCategory('windows');
    } else {
      setCategory('general');
    }
    // Scroll smoothly to top form
    window.scrollTo({ top: 200, behavior: 'smooth' });
  };

  const handleCopyReport = () => {
    if (!diagnosticResult) return;
    navigator.clipboard.writeText(diagnosticResult.rawMarkdownReport);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
  };

  const handleDownloadReport = () => {
    if (!diagnosticResult) return;
    const reportData = {
      timestamp: new Date().toISOString(),
      equipmentCategory,
      operatorNotes: equipmentNotes || 'None',
      analysisSummary: diagnosticResult.summary,
      faultIdentified: diagnosticResult.faultIdentified,
      troubleshootingChecklist: diagnosticResult.troubleshootingChecklist,
      safetyPrecautions: diagnosticResult.safetyPrecautions,
      recommendedActions: diagnosticResult.recommendedActions,
      rawMarkdownReport: diagnosticResult.rawMarkdownReport
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hardware-diagnostic-report-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <main id="it-troubleshooting-assistant" className="container narrow page">
      <p className="eyebrow">Tool · IT Support</p>
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <span>/</span>
        <Link to="/tools/">Tools</Link>
        <span>/</span>
        <span aria-current="page">IT Troubleshooting Assistant</span>
      </div>

      <h1>IT Troubleshooting Assistant</h1>
      <p className="lead">
        A guided first-response workflow that helps you scope an IT issue and build a reviewable next-step checklist.
      </p>

      <section className="content-section">
        <div className="card">
          <p>
            <strong>Browser-only.</strong> Your answers stay in this page and are not sent to an AI service or server by this tool. Do not enter passwords, authentication codes, private keys, confidential employee information or restricted company data.
          </p>
        </div>
      </section>

      {/* DEDICATED HARDWARE IMAGE INSPECTION DIAGNOSTIC CARD */}
      <section id="hardware-image-inspection-card" className="content-section">
        <div
          className="card"
          style={{
            border: '1px solid var(--accent)',
            background: 'var(--surface-accent)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.4rem' }}>📷</span>
            <h2 style={{ margin: 0, fontSize: '1.35rem' }}>
              Hardware Photo Diagnostic &amp; Image Inspector
            </h2>
          </div>
          <p style={{ color: 'var(--text)', fontSize: '0.92rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            Upload a photo of equipment failure indicators (motherboard debug POST code display, blown capacitors, SFP optical link LEDs, damaged RJ45 pins, or server rack wiring) to get instant multimodal AI failure analysis.
          </p>

          {/* Preset Buttons */}
          <div style={{ marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.5rem' }}>
              Or test with a sample hardware preset photo:
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {HARDWARE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className="button button-secondary"
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                >
                  ⚡ {preset.title}
                </button>
              ))}
            </div>
          </div>

          {/* Photo Upload Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--line)',
              borderRadius: '8px',
              padding: '1.5rem',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: 'var(--surface)',
              marginBottom: '1rem',
              transition: 'border-color 0.2s ease'
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
            {imagePreview ? (
              <div>
                <img
                  src={imagePreview}
                  alt="Equipment photo preview"
                  style={{ maxHeight: '180px', maxWidth: '100%', borderRadius: '6px', margin: '0 auto 0.75rem' }}
                />
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 600 }}>
                  ✓ Equipment photo loaded. Click to replace photo.
                </p>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>📁</div>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
                  Click or drag equipment photo here to upload
                </p>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  Supports PNG, JPG, WebP or SVG up to 10MB
                </span>
              </div>
            )}
          </div>

          {/* Category & Observation Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label htmlFor="equipCat" style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                Equipment Category:
              </label>
              <select
                id="equipCat"
                value={equipmentCategory}
                onChange={(e) => setEquipmentCategory(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--line)', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
              >
                <option value="Server / PC Motherboard">Server / PC Motherboard</option>
                <option value="Power Supply / VRM">Power Supply / VRM</option>
                <option value="Network Switch">Network Switch</option>
                <option value="Cable / Connector">Cable / Connector</option>
                <option value="Storage / RAID Array">Storage / RAID Array</option>
              </select>
            </div>
            <div>
              <label htmlFor="equipNotes" style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                Operator Notes / Visible Symptoms:
              </label>
              <input
                id="equipNotes"
                type="text"
                placeholder="e.g. Amber LED flapping, code 00 on hex display..."
                value={equipmentNotes}
                onChange={(e) => setEquipmentNotes(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--line)', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
              />
            </div>
          </div>

          {imageError && (
            <div style={{ color: 'var(--error, #ef4444)', fontSize: '0.85rem', marginBottom: '1rem', fontWeight: 600 }}>
              ⚠️ {imageError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            <button
              type="button"
              className="button"
              disabled={isAnalyzingImage || !imagePreview}
              onClick={handleInspectImage}
            >
              {isAnalyzingImage ? 'Analyzing Equipment Photo…' : 'Inspect Equipment Photo 🔍'}
            </button>
            {imagePreview && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setImagePreview(null);
                  setDiagnosticResult(null);
                  setImageError(null);
                }}
              >
                Clear Photo
              </button>
            )}
          </div>

          {/* Dynamic Common Hardware Failure Indicators Reference List with Interactive Checkboxes */}
          <div
            style={{
              backgroundColor: 'var(--surface)',
              borderRadius: '8px',
              border: '1px solid var(--line)',
              padding: '1rem',
              marginBottom: '1rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>☑️</span> Common Hardware Failure Indicators Checklist ({Object.values(checkedSymptoms).filter(Boolean).length} / 6 Inspected)
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                  Check items as inspected or click to auto-fill:
                </span>
                {Object.values(checkedSymptoms).some(Boolean) && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={handleResetChecklist}
                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
            {/* Searchable Symptoms Database Input */}
            <div style={{ marginBottom: '0.75rem' }}>
              <input
                type="text"
                placeholder="🔍 Search failure symptoms database (e.g. fan, SMART, flickering, capacitor, SFP, RJ45)..."
                value={symptomSearchQuery}
                onChange={(e) => setSymptomSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--line)', backgroundColor: 'var(--surface-accent)', color: 'var(--text)', fontSize: '0.85rem' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem' }}>
              {[
                { id: 0, title: 'Fan Bearing Whine (Auditory)', desc: 'Loud whining fan at 100% RPM or bearing friction noise', category: 'Server / PC Motherboard', symptom: 'Loud whining fan noise at 100% RPM with thermal shutdown risk' },
                { id: 1, title: 'Rhythm-Based Disk Clicking (Auditory)', desc: 'Rhythmic mechanical HDD clicking or tapping head crash', category: 'Storage / RAID Array', symptom: 'Rhythmic mechanical drive clicking sound with storage SMART read/write failure' },
                { id: 2, title: 'Flickering Pixels & Artifacts (Visual)', desc: 'Screen tearing, flickering pixels, or purple/green GPU blocks', category: 'Server / PC Motherboard', symptom: 'Display flickering, flickering pixels, screen tearing, and intermittent black screen' },
                { id: 3, title: 'Bulging Capacitor Venting (Visual)', desc: 'Domed/bulging capacitor tops or crusty brown residue', category: 'Power Supply / VRM', symptom: 'Bulging electrolytic capacitor vent with electronic burning odor' },
                { id: 4, title: 'SFP+ Link Flapping LED (Visual)', desc: 'Switch SFP+ port amber LED flapping & optical power loss', category: 'Network Switch', symptom: 'Switch SFP+ port amber LED flapping with high CRC errors' },
                { id: 5, title: 'Split-Pair RJ45 Crimp (Physical)', desc: 'T568A vs T568B pin 3/6 mismatch on cable tester', category: 'Cable / Connector', symptom: 'RJ45 cable tester split-pair error limiting link to 100Mbps' }
              ].filter(ind => {
                if (!symptomSearchQuery.trim()) return true;
                const q = symptomSearchQuery.toLowerCase();
                return ind.title.toLowerCase().includes(q) || ind.desc.toLowerCase().includes(q) || ind.category.toLowerCase().includes(q) || ind.symptom.toLowerCase().includes(q);
              }).map((ind) => {
                const isChecked = !!checkedSymptoms[ind.id];
                return (
                  <div
                    key={ind.id}
                    style={{
                      textAlign: 'left',
                      backgroundColor: isChecked ? 'rgba(16, 185, 129, 0.08)' : 'var(--surface-accent)',
                      border: `1px solid ${isChecked ? '#10b981' : 'var(--line)'}`,
                      borderRadius: '6px',
                      padding: '0.6rem 0.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleToggleSymptom(ind.id, e.target.checked);
                        }}
                        style={{ marginTop: '0.2rem', cursor: 'pointer', accentColor: '#10b981' }}
                        aria-label={`Mark ${ind.title} as inspected`}
                      />
                      <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => {
                        setEquipmentCategory(ind.category);
                        setEquipmentNotes(ind.symptom);
                      }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: isChecked ? '#10b981' : 'var(--accent)', textDecoration: isChecked ? 'line-through' : 'none' }}>
                          {ind.title}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                          {ind.desc}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        setEquipmentCategory(ind.category);
                        setEquipmentNotes(ind.symptom);
                        const el = document.getElementById('hardware-image-inspection-card');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }}
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', alignSelf: 'flex-start', marginTop: '0.2rem' }}
                    >
                      Verify with AI Photo 🔍
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dynamic Pro-tips List for Hardware Inspection */}
          <div
            style={{
              backgroundColor: 'rgba(56, 189, 248, 0.05)',
              borderRadius: '8px',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              padding: '1rem',
              marginBottom: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--accent)', fontSize: '0.85rem' }}>
              <span>💡</span> Dynamic Hardware Inspection Pro-Tips
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <li>
                <strong>Flashlight Port Inspection:</strong> Use a bright LED flashlight and angled view to inspect USB-C, Ethernet, and HDMI ports for bent pins, lint buildup, or foreign debris.
              </li>
              <li>
                <strong>Mechanical Drive Acoustics:</strong> Listen carefully for rhythmic clicking, metallic scratching, or tapping sounds from mechanical HDDs—a classic indicator of head crash or impending failure.
              </li>
              <li>
                <strong>Capacitor &amp; VRM Venting:</strong> Check motherboard and GPU electrolytic capacitor tops for domed/bulging vents or crusty brown residue indicating electrolyte leakage.
              </li>
              <li>
                <strong>Thermal &amp; Airflow Checks:</strong> Verify heatsink intake fins are clear of dust bunnies and check if exhaust airflow matches CPU thermal load.
              </li>
            </ul>
          </div>

          {/* Field Technician Physical Inspection Guide */}
          <div
            style={{
              backgroundColor: 'var(--surface)',
              borderRadius: '8px',
              border: '1px solid var(--line)',
              padding: '1rem',
              marginBottom: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text)', fontSize: '0.9rem' }}>
              <span>📖</span> Field Technician Physical Inspection Guide
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
              Standard operating procedure for hardware diagnostics and physical assessment in the field.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
              <div style={{ backgroundColor: 'var(--surface-accent)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--line)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)', marginBottom: '0.3rem' }}>
                  🛠️ Required Inspection Tools
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.78rem', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <li>Antistatic ESD wrist strap &amp; mat</li>
                  <li>High-lumen LED flashlight &amp; magnifying loupe</li>
                  <li>Precision electronics screwdriver set</li>
                  <li>Digital multimeter (voltage/continuity testing)</li>
                </ul>
              </div>
              <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ef4444', marginBottom: '0.3rem' }}>
                  ⚠️ Critical Safety Precautions
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.78rem', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <li>Disconnect AC power cords &amp; remove internal batteries before touching components.</li>
                  <li>Always ground yourself with an ESD wrist strap to protect sensitive CMOS/VRM chips.</li>
                  <li>Allow power supply capacitors to discharge fully (minimum 2 minutes after power-off).</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Inspection Result Output */}
          {diagnosticResult && (
            <div
              style={{
                marginTop: '1.5rem',
                paddingTop: '1.25rem',
                borderTop: '1px solid var(--line)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '4px',
                      backgroundColor: diagnosticResult.faultIdentified.confidenceLevel === 'High' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: diagnosticResult.faultIdentified.confidenceLevel === 'High' ? '#10b981' : '#f59e0b',
                      border: '1px solid var(--line)'
                    }}
                  >
                    {diagnosticResult.faultIdentified.confidenceLevel} Confidence Detection
                  </span>
                  <h3 style={{ margin: '0.5rem 0 0.2rem', fontSize: '1.2rem' }}>
                    {diagnosticResult.faultIdentified.component} — {diagnosticResult.faultIdentified.probableIssue}
                  </h3>
                  <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                    Standard: {diagnosticResult.faultIdentified.standardsIdentified}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={handleApplyResultToFlow}
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                  >
                    Apply to Decision Flow →
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={handleFormatServiceDeskNote}
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                  >
                    {copiedServiceNote ? '✓ Service Note Formatted!' : '📝 Format as Service Desk Note'}
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={handleCopyReport}
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                  >
                    {copiedReport ? '✓ Report Copied!' : 'Copy Markdown Report'}
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={handleDownloadReport}
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                  >
                    📥 Download Report (JSON)
                  </button>
                </div>
              </div>

              {/* Visual Indicators */}
              <div style={{ backgroundColor: 'var(--surface)', padding: '0.85rem', borderRadius: '8px' }}>
                <strong style={{ fontSize: '0.88rem', display: 'block', marginBottom: '0.4rem' }}>
                  👁️ Detected Visual Indicators:
                </strong>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--text)' }}>
                  {diagnosticResult.faultIdentified.visualIndicators.map((ind, idx) => (
                    <li key={idx}>{ind}</li>
                  ))}
                </ul>
              </div>

              {/* Field Troubleshooting Checklist */}
              <div>
                <strong style={{ fontSize: '0.88rem', display: 'block', marginBottom: '0.4rem' }}>
                  📋 Sequential Field Troubleshooting Checklist:
                </strong>
                <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {diagnosticResult.troubleshootingChecklist.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              </div>

              {/* Safety Precautions */}
              <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderLeft: '4px solid #ef4444', padding: '0.85rem', borderRadius: '0 8px 8px 0' }}>
                <strong style={{ fontSize: '0.88rem', color: '#ef4444', display: 'block', marginBottom: '0.4rem' }}>
                  ⚠️ Safety Precautions:
                </strong>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--text)' }}>
                  {diagnosticResult.safetyPrecautions.map((sec, idx) => (
                    <li key={idx}>{sec}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Persistent Visual Diagnostic History Card (Last 5 results from localStorage) */}
          <div
            className="card"
            style={{
              marginTop: '1.5rem',
              border: '1px solid var(--line)',
              background: 'var(--surface)',
              borderRadius: '12px',
              padding: '1.25rem',
              boxShadow: '0 4px 16px rgba(0,0,0,0.05)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text)' }}>
                <span>📜</span> Diagnostic History (Showing Last {Math.min(diagnosticHistory.length, 5)} of {diagnosticHistory.length} Saved)
              </h3>
              {diagnosticHistory.length > 0 && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={handleClearHistory}
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                >
                  Clear History
                </button>
              )}
            </div>

            {diagnosticHistory.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: 0 }}>
                No past equipment scans recorded yet. Completed AI hardware inspections will automatically log here from browser storage.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '280px', overflowY: 'auto' }}>
                {diagnosticHistory.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      backgroundColor: 'var(--surface-accent)',
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.75rem',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.2rem' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent)' }}>
                          {item.category}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{item.timestamp}</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                        {item.result.faultIdentified.component}: {item.result.faultIdentified.probableIssue}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => handleCopyHistoryItem(item)}
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                      >
                        {copiedHistoryId === item.id ? '✓ Copied Summary!' : '📋 Copy Scan Summary'}
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => setDiagnosticResult(item.result)}
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                      >
                        View Report →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* COMMON HARDWARE FAILURE INDICATORS GUIDE */}
      <section id="common-hardware-failure-indicators" className="content-section">
        <div
          className="card"
          style={{
            border: '1px solid var(--line)',
            background: 'var(--surface)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 4px 16px rgba(0,0,0,0.05)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '1.3rem' }}>⚡</span>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>
              Common Hardware Failure Indicators Guide
            </h2>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            Self-diagnose common auditory, visual, and performance symptoms before capturing equipment photos for AI inspection.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {/* Symptom 1: Fan & Thermal Noise */}
            <div style={{ backgroundColor: 'var(--surface-accent)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontWeight: 600, color: 'var(--accent)' }}>
                <span>💨</span> Fan Noise &amp; Thermal Throttling
              </div>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: 'var(--text)' }}>
                <strong>Symptoms:</strong> Loud whining fan noise at 100% RPM, sudden thermal shutdowns, or CPU throttling under light load.
              </p>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                <strong>Check:</strong> Dust occlusion on heatsink fins, dried thermal paste, or failing fan bearings.
              </span>
            </div>

            {/* Symptom 2: Storage SMART & Disk Errors */}
            <div style={{ backgroundColor: 'var(--surface-accent)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontWeight: 600, color: 'var(--accent)' }}>
                <span>💾</span> Storage SMART &amp; Read/Write Errors
              </div>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: 'var(--text)' }}>
                <strong>Symptoms:</strong> Slow boot times, unbootable OS (blue screen / kernel panic), clicking/grinding HDD sounds, or SMART reallocated sector warnings.
              </p>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                <strong>Check:</strong> Run `smartctl` disk health test or NVMe wear-level telemetry.
              </span>
            </div>

            {/* Symptom 3: Display Flickering & Artifacts */}
            <div style={{ backgroundColor: 'var(--surface-accent)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontWeight: 600, color: 'var(--accent)' }}>
                <span>🖥️</span> Display Flickering &amp; Artifacts
              </div>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: 'var(--text)' }}>
                <strong>Symptoms:</strong> Screen tearing, horizontal lines, green/purple artifact blocks, or intermittent black screen during movement.
              </p>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                <strong>Check:</strong> Reseat HDMI/DP cable, check GPU PCIe seating, or test external display output.
              </span>
            </div>
          </div>

          {/* Pro-Tips for Hardware Inspection */}
          <div style={{ marginTop: '1.25rem', backgroundColor: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '8px', padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 600, color: 'var(--accent)' }}>
              <span>💡</span> Field Inspector Pro-Tips
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <li>
                <strong>Port &amp; Connector Debris:</strong> Use a bright LED flashlight and magnifier to inspect USB-C/Ethernet/HDMI ports for bent pins, dust buildup, or foreign lint debris.
              </li>
              <li>
                <strong>Auditory Drive Diagnostics:</strong> Listen closely for rhythmic clicking, tapping, or scratching sounds from mechanical HDDs—a classic indicator of head crash or imminent drive failure.
              </li>
              <li>
                <strong>Capacitor &amp; VRM Inspection:</strong> Check motherboard capacitor tops for domed/bulging vents or crusty brown residue indicating electrolyte leakage.
              </li>
              <li>
                <strong>Thermal &amp; Airflow Checks:</strong> Verify intake grilles are unobstructed and check if exhaust air temperature matches CPU thermal load.
              </li>
            </ul>
          </div>

          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              Have photos of these indicators? Use the hardware image inspector above for instant AI analysis.
            </span>
            <a
              href="#hardware-image-inspection-card"
              className="button button-secondary"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', textDecoration: 'none' }}
            >
              Jump to Photo Inspector ↑
            </a>
          </div>
        </div>
      </section>

      {/* GUIDED FIRST RESPONSE DECISION PATH */}
      <section className="content-section">
        <form className="contact-form" onSubmit={handleStart}>
          <div className="form-field">
            <label htmlFor="symptom">What is happening?</label>
            <textarea
              id="symptom"
              rows={4}
              placeholder="Describe the exact symptom or visible error. Avoid confidential information."
              value={symptom}
              onChange={(e) => setSymptom(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="type">What area is closest?</label>
            <select
              id="type"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="">Choose one</option>
              <option value="general">General IT issue</option>
              <option value="apple">macOS / Apple device</option>
              <option value="windows">Windows device</option>
              <option value="microsoft">Microsoft sign-in / Microsoft 365</option>
              <option value="network">Network / connectivity</option>
            </select>
          </div>

          <div className="actions">
            <button className="button" type="submit">
              Start Diagnosis Path
            </button>
            <button className="button button-secondary" type="button" onClick={handleClear}>
              Clear
            </button>
          </div>
        </form>
      </section>

      <section className="content-section" aria-live="polite">
        {!currentNode && !isFinished && (
          <div>
            <h2>Next diagnostic step</h2>
            <p className="form-note">
              Describe the issue and choose an area above to start a guided decision path.
            </p>
          </div>
        )}

        {currentNode && !isFinished && (
          <div className="card" style={{ background: 'var(--surface)' }}>
            <h2>Next diagnostic step</h2>
            <p>
              <strong>Symptom:</strong> {symptom}
            </p>
            <p>
              <strong>Why this matters:</strong> {currentNode.why}
            </p>
            <h3 style={{ fontSize: '1.2rem', marginTop: '14px' }}>{currentNode.q}</h3>
            <div className="actions">
              <button
                className="button"
                type="button"
                onClick={() => handleAnswer('yes')}
              >
                {currentNode.a}
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => handleAnswer('no')}
              >
                {currentNode.ak}
              </button>
            </div>
          </div>
        )}

        {isFinished && (
          <div className="card" style={{ background: 'var(--surface-accent)' }}>
            <h2>Recommended next action</h2>
            <p>
              <strong>Evidence:</strong> {finalEvidence}
            </p>
            <h3>What to do next:</h3>
            <ol>
              <li>{finalEvidence}</li>
              <li>Apply only the least disruptive supported check that matches the evidence.</li>
              <li>Retest the original task and confirm the expected result with the user.</li>
              <li>Document the symptom, test, result, and current state.</li>
            </ol>
            <p>
              <strong>Escalate when:</strong> the next step requires elevated permissions, specialist access, infrastructure changes, security investigation or knowledge outside your support scope.
            </p>
            <div className="actions" style={{ marginTop: '16px' }}>
              <Link className="button" to="/tools/service-desk-note-formatter/">
                Format Service Desk Note →
              </Link>
              <button className="button button-secondary" type="button" onClick={handleClear}>
                Restart Path
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="content-section">
        <h2>Source Notes</h2>
        <ul>
          <li>
            <Link to="/notes/it-service-desk-troubleshooting-workflow/">
              A Practical Service Desk Troubleshooting Workflow
            </Link>
          </li>
          <li>
            <Link to="/notes/scoping-it-issues-user-device-service/">
              User, Device or Service? A Simple Way to Scope IT Issues
            </Link>
          </li>
          <li>
            <Link to="/notes/apple-macos-first-response-checklist/">
              macOS First-Response Troubleshooting Checklist
            </Link>
          </li>
          <li>
            <Link to="/notes/windows-first-response-troubleshooting-checklist/">
              Windows First-Response Troubleshooting Checklist
            </Link>
          </li>
          <li>
            <Link to="/notes/microsoft-sign-in-troubleshooting-guide/">
              Microsoft Sign-In Troubleshooting: A Practical First-Response Guide
            </Link>
          </li>
          <li>
            <Link to="/notes/network-connectivity-first-response-checklist/">
              Network Connectivity First-Response Troubleshooting Checklist
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
};

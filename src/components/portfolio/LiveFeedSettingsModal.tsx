import React, { useState, useEffect } from 'react';
import {
  X,
  Cloud,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Code,
  FileJson,
  Database
} from 'lucide-react';
import { PortfolioData, DataSourceMode } from '../../types/portfolio';
import {
  fetchLivePortfolio,
  normalizePortfolioPayload,
  MOCK_PORTFOLIO_DATA
} from '../../services/portfolioService';

interface LiveFeedSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataSource: DataSourceMode;
  endpointUrl: string;
  authToken: string;
  onSaveAndConnect: (
    url: string,
    token: string,
    fetchedData: PortfolioData,
    mode: DataSourceMode
  ) => void;
  onResetToDemo: () => void;
}

export const LiveFeedSettingsModal: React.FC<LiveFeedSettingsModalProps> = ({
  isOpen,
  onClose,
  dataSource,
  endpointUrl,
  authToken,
  onSaveAndConnect,
  onResetToDemo
}) => {
  const [urlInput, setUrlInput] = useState(endpointUrl);
  const [tokenInput, setTokenInput] = useState(authToken);
  const [activeTab, setActiveTab] = useState<'endpoint' | 'jsonPaste'>('endpoint');
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(MOCK_PORTFOLIO_DATA, null, 2)
  );
  const [isTesting, setIsTesting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setUrlInput(endpointUrl);
  }, [endpointUrl]);

  useEffect(() => {
    setTokenInput(authToken);
  }, [authToken]);

  if (!isOpen) return null;

  const handleConnectUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsTesting(true);

    try {
      const liveData = await fetchLivePortfolio(urlInput, tokenInput);
      setSuccessMsg(
        `Connected! Loaded ${liveData.holdings.length} holdings and ${liveData.watchlist.length} watchlist targets.`
      );
      onSaveAndConnect(urlInput.trim(), tokenInput.trim(), liveData, 'live');
      // Close modal automatically so the dashboard updates immediately
      setTimeout(() => {
        onClose();
      }, 350);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to connect to live endpoint.'
      );
    } finally {
      setIsTesting(false);
    }
  };

  const handleApplyCustomJson = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const parsed = JSON.parse(jsonText);
      const normalized = normalizePortfolioPayload(parsed);
      setSuccessMsg(
        `Validated custom JSON feed (${normalized.holdings.length} holdings, USD/INR ₹${normalized.meta.usdInr}).`
      );
      onSaveAndConnect(urlInput.trim(), tokenInput.trim(), normalized, 'live');
      setTimeout(() => {
        onClose();
      }, 350);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Invalid JSON syntax or missing required fields.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-[#0f172a] border border-slate-700 rounded-xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Cloud className="w-5 h-5 text-sky-400" />
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Data Source &amp; Live Google Sheet / Worker Sync
              </h2>
              <p className="text-xs text-slate-400">
                Connect your Cloudflare Worker or Google Apps Script JSON endpoint or test a custom JSON feed.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#0b1120] border border-slate-800 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => {
              setActiveTab('endpoint');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-2 px-3 rounded-md font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'endpoint'
                ? 'bg-[#1e293b] text-sky-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Remote Endpoint URL (Worker / Apps Script)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('jsonPaste');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-2 px-3 rounded-md font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'jsonPaste'
                ? 'bg-[#1e293b] text-sky-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>Direct JSON Feed Inspector &amp; Simulator</span>
          </button>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2.5 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {activeTab === 'endpoint' ? (
          <form onSubmit={handleConnectUrl} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">
                Cloudflare Worker / Google Apps Script JSON URL *
              </label>
              <input
                type="url"
                required
                placeholder="https://portfolio-feed.your-domain.workers.dev/api/portfolio"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Endpoint must return a JSON object conforming to the <code className="text-sky-400">PortfolioData</code> interface with CORS enabled.
              </p>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">
                Optional Bearer Auth Token / API Key Header
              </label>
              <input
                type="password"
                placeholder="Optional Authorization Bearer token..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Sent via <code className="text-slate-300">Authorization: Bearer &lt;token&gt;</code> request header when fetching your private sheet feed.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0b1120] border border-slate-800 space-y-1.5 text-[11px] text-slate-400">
              <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5 text-sky-400" />
                <span>Service Hook Architecture</span>
              </div>
              <p>
                Uses <code className="text-sky-400">fetchLivePortfolio(endpointUrl, authToken)</code> with a 15-second AbortController timeout and automatic schema normalization.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  onResetToDemo();
                  setSuccessMsg('Switched back to built-in Demo Portfolio data.');
                }}
                className="px-3.5 py-2 bg-[#1e293b] hover:bg-slate-700 text-slate-300 rounded-lg font-medium cursor-pointer"
              >
                Use Built-In Demo Data
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-[#0b1120] border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isTesting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'Syncing Feed...' : 'Fetch & Activate Live Sync'}</span>
                </button>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleApplyCustomJson} className="space-y-4 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-slate-300 font-medium">
                  Paste or Edit Live JSON Payload (<code className="text-sky-400">PortfolioData</code>)
                </label>
                <button
                  type="button"
                  onClick={() => setJsonText(JSON.stringify(MOCK_PORTFOLIO_DATA, null, 2))}
                  className="text-[11px] text-sky-400 hover:underline cursor-pointer"
                >
                  Reset to Default Schema
                </button>
              </div>
              <textarea
                rows={12}
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                className="w-full p-3 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-200 font-mono text-[11px] leading-relaxed focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-[11px] text-slate-400">
                Current Mode:{' '}
                <strong className="text-sky-400 uppercase">{dataSource}</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-[#0b1120] border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-lg cursor-pointer"
                >
                  Validate &amp; Apply JSON Feed
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

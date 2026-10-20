import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';

// Layout components
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { JawedAiWidget } from './components/layout/JawedAiWidget';

// Eagerly loaded landing page for optimal First Contentful Paint
import { HomePage } from './pages/HomePage';

// Code-split route components for optimal initial payload and fast navigation
const AboutPage = lazy(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })));
const WorkPage = lazy(() => import('./pages/WorkPage').then((m) => ({ default: m.WorkPage })));
const NotesPage = lazy(() => import('./pages/NotesPage').then((m) => ({ default: m.NotesPage })));
const NoteDetailPage = lazy(() => import('./pages/NoteDetailPage').then((m) => ({ default: m.NoteDetailPage })));
const BlogPage = lazy(() => import('./pages/BlogPage').then((m) => ({ default: m.BlogPage })));
const BlogDetailPage = lazy(() => import('./pages/BlogDetailPage').then((m) => ({ default: m.BlogDetailPage })));
const TopicsPage = lazy(() => import('./pages/TopicsPage').then((m) => ({ default: m.TopicsPage })));
const ResourcesPage = lazy(() => import('./pages/ResourcesPage').then((m) => ({ default: m.ResourcesPage })));
const ToolsPage = lazy(() => import('./pages/ToolsPage').then((m) => ({ default: m.ToolsPage })));
const ToolDetailPage = lazy(() => import('./pages/ToolDetailPage').then((m) => ({ default: m.ToolDetailPage })));
const AiPage = lazy(() => import('./pages/AiPage').then((m) => ({ default: m.AiPage })));
const ContactPage = lazy(() => import('./pages/ContactPage').then((m) => ({ default: m.ContactPage })));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
const ItServicePage = lazy(() => import('./pages/ItServicePage').then((m) => ({ default: m.ItServicePage })));
const HardwareDiagnosticPage = lazy(() => import('./pages/HardwareDiagnosticPage').then((m) => ({ default: m.HardwareDiagnosticPage })));

import { AuthProvider } from './context/AuthContext';
import { DocumentHead } from './components/common/DocumentHead';
import { PwaInstallPrompt } from './components/common/PwaInstallPrompt';
import { ErrorBoundary, RouteErrorBoundary } from './components/common/ErrorBoundary';

// Accessible page loading fallback preventing layout shifts
const PageLoadingFallback: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    style={{
      minHeight: '50vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--muted)',
      fontSize: '0.95rem'
    }}
  >
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          width: '28px',
          height: '28px',
          margin: '0 auto 12px',
          border: '3px solid var(--line)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }}
      />
      <span>Loading content…</span>
    </div>
  </div>
);

// Scroll to top helper on route navigation
const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <DocumentHead />
        <ErrorBoundary>
          <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header />
        
        <div style={{ flex: 1 }}>
          <RouteErrorBoundary>
            <Suspense fallback={<PageLoadingFallback />}>
              <Routes>
                {/* Home */}
                <Route path="/" element={<HomePage />} />

                {/* About */}
                <Route path="/about" element={<AboutPage />} />
                <Route path="/about/" element={<AboutPage />} />

                {/* Work & Subroutes */}
                <Route path="/work" element={<WorkPage initialTab="overview" />} />
                <Route path="/work/" element={<WorkPage initialTab="overview" />} />
                <Route path="/work/experience" element={<WorkPage initialTab="experience" />} />
                <Route path="/work/experience/" element={<WorkPage initialTab="experience" />} />
                <Route path="/work/skills" element={<WorkPage initialTab="skills" />} />
                <Route path="/work/skills/" element={<WorkPage initialTab="skills" />} />
                <Route path="/work/certifications" element={<WorkPage initialTab="certifications" />} />
                <Route path="/work/certifications/" element={<WorkPage initialTab="certifications" />} />
                <Route path="/work/projects" element={<WorkPage initialTab="projects" />} />
                <Route path="/work/projects/" element={<WorkPage initialTab="projects" />} />

                {/* Notes */}
                <Route path="/notes" element={<NotesPage />} />
                <Route path="/notes/" element={<NotesPage />} />
                <Route path="/notes/:slug" element={<NoteDetailPage />} />
                <Route path="/notes/:slug/" element={<NoteDetailPage />} />

                {/* Blog */}
                <Route path="/blog" element={<BlogPage />} />
                <Route path="/blog/" element={<BlogPage />} />
                <Route path="/blog/:slug" element={<BlogDetailPage />} />
                <Route path="/blog/:slug/" element={<BlogDetailPage />} />

                {/* Topics */}
                <Route path="/topics" element={<TopicsPage />} />
                <Route path="/topics/" element={<TopicsPage />} />

                {/* Resources */}
                <Route path="/resources" element={<ResourcesPage />} />
                <Route path="/resources/" element={<ResourcesPage />} />

                {/* Tools */}
                <Route path="/tools" element={<ToolsPage />} />
                <Route path="/tools/" element={<ToolsPage />} />
                <Route path="/tools/:slug" element={<ToolDetailPage />} />
                <Route path="/tools/:slug/" element={<ToolDetailPage />} />

                {/* AI */}
                <Route path="/ai" element={<AiPage />} />
                <Route path="/ai/" element={<AiPage />} />

                {/* Contact */}
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/contact/" element={<ContactPage />} />

                {/* Privacy */}
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/privacy/" element={<PrivacyPage />} />

                {/* IT Service & Field Tech Portal */}
                <Route path="/it-service" element={<ItServicePage />} />
                <Route path="/it-service/" element={<ItServicePage />} />
                <Route path="/service-desk" element={<ItServicePage />} />
                <Route path="/service-desk/" element={<ItServicePage />} />
                <Route path="/it-portal" element={<ItServicePage />} />
                <Route path="/it-portal/" element={<ItServicePage />} />

                {/* AI Hardware Diagnostic & Image Inspector */}
                <Route path="/diagnostic" element={<HardwareDiagnosticPage />} />
                <Route path="/diagnostic/" element={<HardwareDiagnosticPage />} />
                <Route path="/hardware-diagnostic" element={<HardwareDiagnosticPage />} />
                <Route path="/hardware-diagnostic/" element={<HardwareDiagnosticPage />} />
                <Route path="/tools/hardware-diagnostic" element={<HardwareDiagnosticPage />} />
                <Route path="/tools/hardware-diagnostic/" element={<HardwareDiagnosticPage />} />

                {/* 404 */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </RouteErrorBoundary>
        </div>

        <Footer />
        <JawedAiWidget />
        <PwaInstallPrompt />
      </div>
    </ErrorBoundary>
    </AuthProvider>
  </BrowserRouter>
);
};

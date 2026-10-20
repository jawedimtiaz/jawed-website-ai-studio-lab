import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { toolsList, ToolItem } from '../data/toolsData';

// Import all 14 tool components
import { ServiceDeskNoteFormatter } from '../components/tools/ServiceDeskNoteFormatter';
import { ItTroubleshootingAssistant } from '../components/tools/ItTroubleshootingAssistant';
import { TicketToKbDraft } from '../components/tools/TicketToKbDraft';
import { AppleMacOsJamfSupportHelper } from '../components/tools/AppleMacOsJamfSupportHelper';
import { M365WorkplaceSignInDiagnostic } from '../components/tools/M365WorkplaceSignInDiagnostic';
import { AiPromptBuilder } from '../components/tools/AiPromptBuilder';
import { CareerMatchResumeReview } from '../components/tools/CareerMatchResumeReview';
import { ResumeBulletStrengthChecker } from '../components/tools/ResumeBulletStrengthChecker';
import { InterviewPreparationPlanner } from '../components/tools/InterviewPreparationPlanner';
import { CompoundGrowthSipCalculator } from '../components/tools/CompoundGrowthSipCalculator';
import { InflationGoalPlanningCalculator } from '../components/tools/InflationGoalPlanningCalculator';
import { PersonalFinanceSnapshot } from '../components/tools/PersonalFinanceSnapshot';
import { RetirementPlanningCalculator } from '../components/tools/RetirementPlanningCalculator';
import { FinancePlanningWorkspace } from '../components/tools/FinancePlanningWorkspace';
import { HardwareDiagnosticPage } from './HardwareDiagnosticPage';

export const ToolDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const cleanSlug = slug?.replace(/\/$/, '');
  const tool = toolsList.find((t) => t.slug === cleanSlug);

  if (!tool) {
    return (
      <main id="main-content" className="container page" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <h1>Tool Not Found</h1>
        <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>
          The requested interactive tool could not be located.
        </p>
        <Link to="/tools/" className="button">
          ← Back to All Tools
        </Link>
      </main>
    );
  }

  // Get related tools
  const relatedTools: ToolItem[] = tool.relatedSlugs
    .map((rSlug) => toolsList.find((t) => t.slug === rSlug))
    .filter((t): t is ToolItem => Boolean(t));

  // Render the appropriate interactive tool component
  const renderToolComponent = () => {
    switch (tool.slug) {
      case 'hardware-diagnostic':
        return <HardwareDiagnosticPage />;
      case 'service-desk-note-formatter':
        return <ServiceDeskNoteFormatter />;
      case 'it-troubleshooting-assistant':
        return <ItTroubleshootingAssistant />;
      case 'ticket-to-knowledge-base-draft':
        return <TicketToKbDraft />;
      case 'apple-macos-jamf-support-helper':
        return <AppleMacOsJamfSupportHelper />;
      case 'm365-workplace-sign-in-diagnostic':
        return <M365WorkplaceSignInDiagnostic />;
      case 'ai-prompt-builder':
        return <AiPromptBuilder />;
      case 'career-match-resume-review':
        return <CareerMatchResumeReview />;
      case 'resume-bullet-strength-checker':
        return <ResumeBulletStrengthChecker />;
      case 'interview-preparation-planner':
        return <InterviewPreparationPlanner />;
      case 'compound-growth-sip-calculator':
        return <CompoundGrowthSipCalculator />;
      case 'inflation-goal-planning-calculator':
        return <InflationGoalPlanningCalculator />;
      case 'personal-finance-snapshot':
        return <PersonalFinanceSnapshot />;
      case 'retirement-planning-calculator':
        return <RetirementPlanningCalculator />;
      case 'finance-planning-workspace':
        return <FinancePlanningWorkspace />;
      default:
        return <div>Tool implementation pending</div>;
    }
  };

  return (
    <>
      {/* Interactive Tool Component */}
      {renderToolComponent()}

      {/* Structured SEO & Practical Guidance Documentation */}
      <div className="container narrow" style={{ margin: '0 auto 3.5rem', padding: '0 1rem' }}>
        {/* Purpose & Operational Scope */}
        <section className="content-section" style={{ borderTop: '1px solid var(--line)', paddingTop: '2.5rem' }}>
          <h2>Purpose &amp; Operational Scope</h2>
          <p style={{ fontSize: '1.02rem', lineHeight: 1.6, color: 'var(--text)' }}>
            {tool.purpose}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600, alignSelf: 'center' }}>
              Keywords &amp; Scope:
            </span>
            {tool.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: '0.78rem',
                  padding: '0.2rem 0.55rem',
                  backgroundColor: 'var(--surface-accent)',
                  borderRadius: '4px',
                  color: 'var(--accent)',
                  border: '1px solid var(--line)'
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        </section>

        {/* Step-by-Step Instructions */}
        <section className="content-section">
          <h2>How to Use This Tool</h2>
          <ol style={{ paddingLeft: '1.25rem', lineHeight: 1.7, fontSize: '0.98rem' }}>
            {tool.steps.map((step, idx) => (
              <li key={idx} style={{ marginBottom: '0.5rem' }}>
                {step}
              </li>
            ))}
          </ol>
        </section>

        {/* Worked Example Output */}
        <section className="content-section">
          <h2>Worked Example Output</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.92rem', marginBottom: '0.75rem' }}>
            {tool.exampleOutput.description}
          </p>
          <div className="card" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)' }}>
            <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem', color: 'var(--accent)' }}>
              {tool.exampleOutput.title}
            </h3>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.88rem', lineHeight: 1.5, margin: 0 }}>
              {tool.exampleOutput.content}
            </pre>
          </div>
        </section>

        {/* Frequently Asked Questions (FAQ) */}
        {tool.faq.length > 0 && (
          <section className="content-section">
            <h2>Frequently Asked Questions</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {tool.faq.map((faqItem, idx) => (
                <details
                  key={idx}
                  style={{
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '6px',
                    padding: '0.85rem 1rem'
                  }}
                >
                  <summary style={{ fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem' }}>
                    {faqItem.question}
                  </summary>
                  <p style={{ margin: '0.65rem 0 0', fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--text)' }}>
                    {faqItem.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>
        )}

        {/* Related Tool Suggestions */}
        {relatedTools.length > 0 && (
          <section className="content-section">
            <h2>Related Tools &amp; Next Steps</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.92rem', marginBottom: '1.25rem' }}>
              Explore complementary utilities for Service Desk operations, career development, or planning:
            </p>
            <div className="card-grid two">
              {relatedTools.map((relTool) => (
                <article key={relTool.slug} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span className="badge" style={{ fontSize: '0.72rem' }}>{relTool.category}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>⏱ {relTool.estimatedTime}</span>
                  </div>
                  <h3 style={{ fontSize: '1.05rem', margin: '0.2rem 0 0.4rem' }}>{relTool.title}</h3>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text)', flex: 1, margin: '0 0 1rem', lineHeight: 1.5 }}>
                    {relTool.benefit}
                  </p>
                  <div style={{ marginTop: 'auto' }}>
                    <Link to={relTool.path} className="button button-secondary" style={{ width: '100%', textAlign: 'center', fontSize: '0.85rem' }}>
                      Use Tool →
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Conversion & Consultation CTA Card */}
        <section
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            padding: '1.75rem',
            marginTop: '2.5rem',
            textAlign: 'center'
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem' }}>
            Need Custom IT Tooling, macOS/Jamf Workflows, or Support Consulting?
          </h3>
          <p style={{ color: 'var(--text)', fontSize: '0.92rem', maxWidth: '40rem', margin: '0 auto 1.25rem', lineHeight: 1.5 }}>
            I design structured Service Desk triage sequences, automated device management runbooks, and private browser utilities tailored to enterprise workplace environments.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to={`/contact/?reason=${encodeURIComponent(tool.title)}`} className="button" style={{ fontSize: '0.9rem' }}>
              Work With Me on Similar Solutions →
            </Link>
            <Link to="/ai/" className="button button-secondary" style={{ fontSize: '0.9rem' }}>
              Ask Jawed AI 🤖
            </Link>
          </div>
        </section>

        {/* Contextual Hub Links */}
        <section style={{ borderTop: '1px solid var(--line)', paddingTop: '1.5rem', marginTop: '2rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link to="/tools/" className="button button-secondary" style={{ fontSize: '0.85rem' }}>
            ← All 14 Interactive Tools
          </Link>
          <Link to="/notes/" className="button button-secondary" style={{ fontSize: '0.85rem' }}>
            📖 Troubleshooting Notes
          </Link>
          <Link to="/contact/" className="button" style={{ fontSize: '0.85rem' }}>
            ✉️ Contact Jawed
          </Link>
        </section>
      </div>
    </>
  );
};

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { toolsList } from '../data/toolsData';
import { notesList, getNoteCategory } from '../data/notesData';

export const HomePage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
  const featuredTools = toolsList.slice(0, 4);
  const featuredNotes = notesList.slice(0, 4);

  return (
    <main id="main-content" className="container page">
      {/* Hero Section */}
      <section className="hero-section" style={{ padding: '3rem 0 2rem' }}>
        <p className="eyebrow">Portfolio &amp; Practical Workplace Technology Hub</p>
        <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.15, marginBottom: '1.25rem' }}>
          IT Field Tech, Practical Guides &amp; Interactive Browser Tools
        </h1>
        <p className="lead" style={{ maxWidth: '48rem', marginBottom: '1.75rem' }}>
          Welcome! I’m <strong>Jawed Imtiaz</strong>, an IT Field Tech supporting users, devices, and enterprise technology at Milestone Technologies (supporting the Uber environment). I build structured troubleshooting workflows, technical documentation, and privacy-first browser tools for IT professionals and individuals.
        </p>
        <div className="actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link className="button" to="/contact/">
            Work With Me / Contact →
          </Link>
          <Link className="button button-secondary" to="/work/">
            My Work &amp; Experience →
          </Link>
          <Link className="button button-secondary" to="/tools/">
            Browse 16 Tools →
          </Link>
          <Link className="button button-secondary" to="/ai/">
            Ask Jawed AI 🤖
          </Link>
        </div>
      </section>

      {/* Highlights / Quick Stats */}
      <section className="content-section" style={{ borderTop: '1px solid var(--line)', paddingTop: '2.5rem' }}>
        <h2>Core Focus &amp; Recognition</h2>
        <div className="stats-grid">
          <div className="stat">
            <strong>Field &amp; Service Desk</strong>
            <span>Hands-on macOS, Windows, Jamf &amp; SaaS support</span>
          </div>
          <div className="stat">
            <strong>16 Interactive Tools</strong>
            <span>Client-side, privacy-first IT &amp; career utilities</span>
          </div>
          <div className="stat">
            <strong>30 Practical Notes</strong>
            <span>Step-by-step diagnostic workflows &amp; checklists</span>
          </div>
          <div className="stat">
            <strong>Multiple Awards</strong>
            <span>Tech Support Guru, Employee of Quarter, Jugaad Genius</span>
          </div>
        </div>
      </section>

      {/* Most Useful Tools Section */}
      <section className="content-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <p className="eyebrow">Interactive Utilities</p>
            <h2 style={{ margin: 0 }}>Most Useful Tools</h2>
          </div>
          <Link to="/tools/" className="button button-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}>
            View All 16 Tools →
          </Link>
        </div>
        <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
          Browser-based, zero-tracking tools engineered to accelerate daily IT Service Desk triage, Apple/Jamf endpoint support, Microsoft 365 sign-in diagnostics, and career preparation.
        </p>
        <div className="card-grid">
          {[
            toolsList.find((t) => t.slug === 'service-desk-note-formatter')!,
            toolsList.find((t) => t.slug === 'apple-macos-jamf-support-helper')!,
            toolsList.find((t) => t.slug === 'm365-workplace-sign-in-diagnostic')!,
            toolsList.find((t) => t.slug === 'career-match-resume-review')!
          ].filter(Boolean).map((tool) => (
            <article key={tool.slug} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className="badge" style={{ fontSize: '0.72rem' }}>
                    {tool.category}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 500 }}>
                    ⏱ {tool.estimatedTime}
                  </span>
                </div>
                <h3 style={{ fontSize: '1.15rem', margin: '0.2rem 0 0.4rem' }}>
                  <Link to={tool.path} style={{ textDecoration: 'none', color: 'inherit' }}>
                    {tool.title}
                  </Link>
                </h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text)', margin: '0 0 0.75rem', lineHeight: 1.5, fontWeight: 500 }}>
                  {tool.benefit}
                </p>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  {tool.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.1rem 0.4rem',
                        backgroundColor: 'var(--surface-accent)',
                        borderRadius: '3px',
                        color: 'var(--accent)',
                        border: '1px solid var(--line)'
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: '0.75rem', marginTop: 'auto' }}>
                <Link to={tool.path} className="button" style={{ width: '100%', textAlign: 'center', fontSize: '0.88rem' }}>
                  Use Tool →
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Selected Work Evidence */}
      <section className="content-section">
        <p className="eyebrow">Operational Methodology</p>
        <h2>From Symptoms to Resolution</h2>
        <p>
          Technical support requires structured problem isolation rather than guessing. Here is the operational philosophy applied across my projects and documentation:
        </p>
        <div className="card-grid">
          <article className="card">
            <h3>1. Isolate Scope &amp; User Impact</h3>
            <p>
              Clarify what task is blocked, distinguish whether the issue is isolated to a single user, device, or enterprise service, and record exact timestamps.
            </p>
            <Link to="/notes/scoping-it-issues-user-device-service/">Read Scoping Guide →</Link>
          </article>
          <article className="card">
            <h3>2. Layered Diagnostics</h3>
            <p>
              Test lowest-risk assumptions first: physical connectivity, IP leasing, DNS resolution, TLS certificates, identity tokens, and app permissions.
            </p>
            <Link to="/notes/networking-layer-by-layer-diagnostic-framework/">Read Layered Framework →</Link>
          </article>
          <article className="card">
            <h3>3. Repeatable Handoffs</h3>
            <p>
              Document exact reproduction steps, changes tested, validated outcomes, and actionable next steps so colleagues never have to re-test blind.
            </p>
            <Link to="/notes/it-support-escalation-handoff-checklist/">Read Escalation Checklist →</Link>
          </article>
        </div>
      </section>

      {/* Latest Technical Notes */}
      <section className="content-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <p className="eyebrow">Knowledge Base</p>
            <h2 style={{ margin: 0 }}>Recent Technical Guides &amp; Notes</h2>
          </div>
          <Link to="/notes/" className="button button-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}>
            Browse All 30 Notes →
          </Link>
        </div>
        <div className="card-grid">
          {featuredNotes.map((note) => (
            <article key={note.slug} className="card">
              <span className="badge" style={{ marginBottom: '0.5rem', display: 'inline-block' }}>
                {getNoteCategory(note)}
              </span>
              <h3 style={{ fontSize: '1.15rem' }}>
                <Link to={`/notes/${note.slug}/`}>{note.title}</Link>
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                {note.readTime} read · Updated {note.updatedDate}
              </p>
              <p style={{ fontSize: '0.95rem' }}>{note.summary}</p>
              <Link to={`/notes/${note.slug}/`} style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                Read Note →
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* Ready to Collaborate / Conversion CTA Banner */}
      <section
        className="content-section"
        style={{
          backgroundColor: 'var(--surface)',
          borderRadius: '8px',
          padding: '2.5rem 2rem',
          border: '1px solid var(--line)',
          textAlign: 'center',
          marginTop: '3.5rem'
        }}
      >
        <p className="eyebrow">Work With Me &amp; Let's Collaborate</p>
        <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', margin: '0.25rem 0 0.75rem' }}>
          Need Workplace Technology, Mac Support, or IT Guidance?
        </h2>
        <p style={{ maxWidth: '44rem', margin: '0 auto 1.75rem', color: 'var(--text)', fontSize: '1rem', lineHeight: 1.6 }}>
          Whether you’re seeking a dedicated IT support specialist, need structured onboarding/offboarding workflows, require Apple &amp; Jamf device management assistance, or want custom browser utilities, I’m ready to collaborate.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/contact/" className="button" style={{ padding: '0.65rem 1.5rem', fontSize: '1rem' }}>
            Work With Me / Send a Message →
          </Link>
          <Link to="/tools/" className="button button-secondary" style={{ padding: '0.65rem 1.25rem', fontSize: '1rem' }}>
            Browse All 16 Interactive Tools →
          </Link>
          <Link to="/ai/" className="button button-secondary" style={{ padding: '0.65rem 1.25rem', fontSize: '1rem' }}>
            Ask Jawed AI 🤖
          </Link>
        </div>
      </section>
    </main>
  );
};

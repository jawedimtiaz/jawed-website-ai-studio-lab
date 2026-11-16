import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toolsList, ToolCategory } from '../data/toolsData';

const CATEGORIES: (ToolCategory | 'All')[] = [
  'All',
  'IT & Service Desk',
  'Apple, macOS & Jamf',
  'Microsoft 365 & Workplace',
  'Career & Resume',
  'Finance & Planning',
  'AI & Productivity'
];

export const ToolsPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredTools = useMemo(() => {
    return toolsList.filter((tool) => {
      const matchCat = selectedCategory === 'All' || tool.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        tool.title.toLowerCase().includes(q) ||
        tool.benefit.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        tool.tags.some((tag) => tag.toLowerCase().includes(q)) ||
        tool.category.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [selectedCategory, searchQuery]);

  return (
    <main id="main-content" className="container page">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <span>/</span>
        <span aria-current="page">Tools</span>
      </div>

      <p className="eyebrow">Interactive Browser Utilities</p>
      <h1>Interactive Tools</h1>
      <p className="lead" style={{ maxWidth: '52rem', marginBottom: '2rem' }}>
        A collection of 16 practical, privacy-first browser utilities designed for IT Service Desk analysts, Apple &amp; Windows workplace technicians, career builders, and financial planners. All calculations and text processing run strictly inside your browser—no user data is logged or sent to any server.
      </p>

      {/* Search and Category Filters */}
      <div
        className="tools-filter-box"
        style={{
          backgroundColor: 'var(--surface)',
          padding: '1.5rem',
          borderRadius: '8px',
          border: '1px solid var(--line)',
          marginBottom: '2rem'
        }}
      >
        <div style={{ marginBottom: '1.25rem', position: 'relative' }}>
          <label htmlFor="tools-search-input" style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.4rem' }}>
            Search Tools
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              id="tools-search-input"
              type="search"
              placeholder="Search by name, symptom, technology (e.g. Jamf, MFA, Resume, SIP, Ticket)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                padding: '0.65rem 0.85rem',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                fontSize: '0.95rem'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setSearchQuery('')}
                style={{ padding: '0.65rem 1rem' }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div>
          <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600, marginBottom: '0.5rem' }}>
            Filter by Category:
          </span>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {CATEGORIES.map((cat) => {
              const count = cat === 'All' ? toolsList.length : toolsList.filter((t) => t.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`button ${selectedCategory === cat ? '' : 'button-secondary'}`}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.82rem',
                    borderRadius: '20px'
                  }}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>
          {selectedCategory === 'All' ? 'All Interactive Tools' : selectedCategory}
          <span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--muted)', marginLeft: '0.5rem' }}>
            ({filteredTools.length} {filteredTools.length === 1 ? 'tool' : 'tools'} available)
          </span>
        </h2>
      </div>

      {/* Tool Cards Grid */}
      {filteredTools.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', backgroundColor: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--line)' }}>
          <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.5rem' }}>No tools matched your search</p>
          <p style={{ color: 'var(--muted)', fontSize: '0.92rem', marginBottom: '1.5rem' }}>
            Try searching for terms like "note", "MFA", "Jamf", "SIP", or "resume", or reset filters.
          </p>
          <button
            type="button"
            className="button"
            onClick={() => {
              setSelectedCategory('All');
              setSearchQuery('');
            }}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="card-grid">
          {filteredTools.map((tool) => (
            <article
              key={tool.slug}
              className="card tool-card"
              data-testid={`tool-card-${tool.slug}`}
              data-tool-slug={tool.slug}
              data-tool-title={tool.title}
              data-title={tool.title}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className="badge" style={{ fontSize: '0.72rem' }}>
                    {tool.category}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 500 }}>
                    ⏱ {tool.estimatedTime}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.2rem', margin: '0.2rem 0 0.4rem', lineHeight: 1.3 }}>
                  <Link to={tool.path} style={{ textDecoration: 'none', color: 'inherit' }} data-testid={`tool-link-${tool.slug}`}>
                    {tool.title}
                  </Link>
                </h3>

                {/* Tool Description */}
                <p
                  className="tool-description description"
                  style={{
                    fontSize: '0.92rem',
                    color: 'var(--text)',
                    margin: '0 0 0.75rem',
                    lineHeight: 1.5,
                    fontWeight: 500
                  }}
                >
                  {tool.description}
                </p>

                {/* Tags */}
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                  {tool.tags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: '0.72rem',
                        padding: '0.15rem 0.45rem',
                        backgroundColor: 'var(--surface-accent)',
                        borderRadius: '3px',
                        color: 'var(--accent)',
                        border: '1px solid var(--line)'
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action */}
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: '0.75rem', marginTop: 'auto' }}>
                <Link
                  to={tool.path}
                  className="button"
                  style={{ width: '100%', textAlign: 'center', fontSize: '0.9rem' }}
                >
                  Use Tool →
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Operational Philosophy */}
      <section className="content-section" style={{ marginTop: '3.5rem', borderTop: '1px solid var(--line)', paddingTop: '2rem' }}>
        <h2>Privacy &amp; Browser-Only Design</h2>
        <div className="card-grid two">
          <div className="card">
            <h3>🔒 Complete Client-Side Privacy</h3>
            <p style={{ fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
              All 16 utilities execute purely in client memory via HTML5, React, and Web APIs. Your input notes, resumes, financial scenarios, and device identifiers are never transmitted to external APIs or stored in cookies.
            </p>
          </div>
          <div className="card">
            <h3>⚡ Offline Capable</h3>
            <p style={{ fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
              Because tools rely on deterministic browser logic, they remain functional offline through our Progressive Web App (PWA) service worker cache, even in disconnected data center environments.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};

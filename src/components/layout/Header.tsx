import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';

export const Header: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const location = useLocation();
  const exploreRef = useRef<HTMLDetailsElement>(null);

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setExploreOpen(false);
    if (exploreRef.current) {
      exploreRef.current.open = false;
    }
  }, [location.pathname]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        setExploreOpen(false);
        if (exploreRef.current) {
          exploreRef.current.open = false;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const isExploreActive = ['/topics', '/notes', '/blog', '/resources'].some((p) =>
    location.pathname.startsWith(p)
  );

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <Link className="site-name" to="/" aria-label="Jawed Imtiaz home">
            Jawed Imtiaz
          </Link>

          <button
            className="menu-toggle"
            type="button"
            aria-expanded={mobileMenuOpen}
            aria-controls="site-nav"
            aria-label="Toggle navigation menu"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            Menu
          </button>

          <nav
            id="site-nav"
            className={`site-nav ${mobileMenuOpen ? 'is-open' : ''}`}
            aria-label="Main navigation"
          >
            <Link to="/" aria-current={isActive('/') ? 'page' : undefined}>
              Home
            </Link>
            <Link to="/about/" aria-current={isActive('/about') ? 'page' : undefined}>
              About
            </Link>
            <Link to="/work/" aria-current={isActive('/work') ? 'page' : undefined}>
              Work
            </Link>

            <details
              className="nav-group"
              ref={exploreRef}
              open={exploreOpen || isExploreActive}
              onToggle={(e) => setExploreOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary aria-current={isExploreActive ? 'true' : undefined}>
                Explore
              </summary>
              <div className="nav-group-menu">
                <Link to="/topics/" aria-current={isActive('/topics') ? 'page' : undefined}>
                  Topics
                </Link>
                <Link to="/notes/" aria-current={isActive('/notes') ? 'page' : undefined}>
                  Notes
                </Link>
                <Link to="/blog/" aria-current={isActive('/blog') ? 'page' : undefined}>
                  Blog
                </Link>
                <Link to="/resources/" aria-current={isActive('/resources') ? 'page' : undefined}>
                  Resources
                </Link>
              </div>
            </details>

            <Link to="/tools/" aria-current={isActive('/tools') ? 'page' : undefined}>
              Tools
            </Link>
            <Link to="/ai/" aria-current={isActive('/ai') ? 'page' : undefined}>
              AI
            </Link>
            <Link to="/contact/" aria-current={isActive('/contact') ? 'page' : undefined}>
              Contact
            </Link>
            <Link
              to="/it-service"
              aria-current={isActive('/it-service') || isActive('/it-portal') ? 'page' : undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontWeight: 600,
                color: (isActive('/it-service') || isActive('/it-portal')) ? 'var(--accent)' : undefined
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: '#0284c7'
                }}
              />
              IT Service Desk
            </Link>

            <button
              type="button"
              onClick={() => {
                const btn = document.getElementById('pwa-install-btn');
                if (btn) btn.click();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: 'var(--surface-accent)',
                color: 'var(--accent-dark)',
                border: '1px solid #cbdcf6',
                borderRadius: '7px',
                padding: '6px 12px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              aria-label="Install app on device"
            >
              <span>📥</span> Install App
            </button>
          </nav>
        </div>
      </header>
    </>
  );
};

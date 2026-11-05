import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <nav className="footer-discovery" aria-label="Explore site">
          <Link to="/">Home</Link>
          <Link to="/work/">Work</Link>
          <Link to="/notes/">Notes</Link>
          <Link to="/tools/">Tools</Link>
          <Link to="/ai/">AI</Link>
          <a
            href="https://www.jawed.co.in/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Main Website ↗
          </a>
        </nav>

        <div className="footer-bottom">
          <p>© {currentYear} Jawed Imtiaz</p>
          <div>
            <a
              href="https://www.jawed.co.in/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Main Website
            </a>
            <Link to="/contact/">Contact</Link>
            <a
              href="https://www.linkedin.com/in/jawedimtiaz/"
              target="_blank"
              rel="noopener noreferrer me"
            >
              LinkedIn
            </a>
            <Link to="/privacy/">Privacy</Link>
            <button
              type="button"
              onClick={() => {
                const btn = document.getElementById('pwa-install-btn');
                if (btn) btn.click();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                font: 'inherit',
                padding: 0,
                textDecoration: 'underline'
              }}
            >
              Install App
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};

import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button, Icon } from '../ui/index.jsx';

export function Brand({ to = '/' }) {
  return (
    <Link to={to} className="brand">
      <span className="brand__mark">
        <Icon name="swap" size={18} strokeWidth={2.2} />
      </span>
      SkillSwap
    </Link>
  );
}

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/about', label: 'About' },
];

export function PublicLayout() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const appHome = user?.role === 'ADMIN' ? '/admin' : '/app';

  return (
    <>
      <header className="public-nav">
        <div className="public-nav__inner">
          <Brand />
          <nav className="public-nav__links" aria-label="Main">
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end}>
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="public-nav__actions">
            {user ? (
              <Button to={appHome}>Go to dashboard</Button>
            ) : (
              <>
                <Button to="/login" variant="ghost">
                  Log in
                </Button>
                <Button to="/register">Join SkillSwap</Button>
              </>
            )}
          </div>
          <button type="button" className="public-nav__toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Toggle menu">
            <Icon name={open ? 'x' : 'menu'} size={24} />
          </button>
        </div>
        {open && (
          <nav className="public-nav__mobile" aria-label="Mobile">
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} onClick={() => setOpen(false)}>
                {link.label}
              </NavLink>
            ))}
            {user ? (
              <Button to={appHome} onClick={() => setOpen(false)} block>
                Go to dashboard
              </Button>
            ) : (
              <>
                <Button to="/login" variant="outline" onClick={() => setOpen(false)} block>
                  Log in
                </Button>
                <Button to="/register" onClick={() => setOpen(false)} block>
                  Join SkillSwap
                </Button>
              </>
            )}
          </nav>
        )}
      </header>
      <main className="public-main">
        <Outlet />
      </main>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__grid">
          <div>
            <Brand />
            <p className="mt-3">Learn a skill. Share a skill. SkillSwap connects people who teach with people who want to learn.</p>
          </div>
          <div>
            <h4>Platform</h4>
            <Link to="/how-it-works">How it works</Link>
            <Link to="/about">About SkillSwap</Link>
            <Link to="/register">Join</Link>
          </div>
          <div>
            <h4>Account</h4>
            <Link to="/login">Log in</Link>
            <Link to="/register">Create account</Link>
            <Link to="/forgot-password">Reset password</Link>
          </div>
          <div>
            <h4>Community</h4>
            <Link to="/app/find">Find a skill partner</Link>
            <Link to="/app/search">Browse skills</Link>
          </div>
        </div>
        <div className="site-footer__bottom">
          <span>© {new Date().getFullYear()} SkillSwap. Built for learners and teachers everywhere.</span>
          <span>SkillSwap Points have no monetary value.</span>
        </div>
      </div>
    </footer>
  );
}

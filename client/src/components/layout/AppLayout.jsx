import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Avatar, Icon } from '../ui/index.jsx';
import { Brand } from './PublicLayout.jsx';
import { NotificationBell } from './NotificationPanel.jsx';

const USER_NAV = [
  { to: '/app', label: 'Dashboard', icon: 'home', end: true },
  { to: '/app/find', label: 'Find a Skill Partner', icon: 'users' },
  { to: '/app/search', label: 'Browse Skills', icon: 'search' },
  { to: '/app/requests', label: 'Requests', icon: 'swap', badge: 'requests' },
  { to: '/app/sessions', label: 'Sessions', icon: 'calendar' },
  { to: '/app/messages', label: 'Messages', icon: 'message', badge: 'messages' },
  { to: '/app/points', label: 'My Points', icon: 'coins' },
  { to: '/app/reviews', label: 'Reviews', icon: 'star' },
];
const USER_ACCOUNT_NAV = [
  { to: '/app/profile', label: 'My Profile', icon: 'user' },
  { to: '/app/skills', label: 'My Skills', icon: 'book' },
  { to: '/app/notifications', label: 'Notifications', icon: 'bell', badge: 'notifications' },
  { to: '/app/settings', label: 'Settings', icon: 'settings' },
];
const ADMIN_NAV = [
  { to: '/admin', label: 'Dashboard', icon: 'chart', end: true },
  { to: '/admin/users', label: 'Manage Users', icon: 'users' },
  { to: '/admin/skills', label: 'Manage Skills', icon: 'book' },
  { to: '/admin/categories', label: 'Manage Categories', icon: 'tag' },
  { to: '/admin/reports', label: 'Manage Reports', icon: 'flag' },
  { to: '/admin/reviews', label: 'Manage Reviews', icon: 'star' },
  { to: '/admin/points', label: 'Points Management', icon: 'coins' },
  { to: '/admin/activity', label: 'Activity', icon: 'history' },
  { to: '/admin/settings', label: 'Admin Settings', icon: 'settings' },
];
const MOBILE_USER_NAV = [
  { to: '/app', label: 'Home', icon: 'home', end: true },
  { to: '/app/find', label: 'Find', icon: 'users' },
  { to: '/app/requests', label: 'Requests', icon: 'swap', badge: 'requests' },
  { to: '/app/messages', label: 'Messages', icon: 'message', badge: 'messages' },
  { to: '/app/profile', label: 'Profile', icon: 'user' },
];
const MOBILE_ADMIN_NAV = [
  { to: '/admin', label: 'Home', icon: 'chart', end: true },
  { to: '/admin/users', label: 'Users', icon: 'users' },
  { to: '/admin/reports', label: 'Reports', icon: 'flag' },
  { to: '/admin/points', label: 'Points', icon: 'coins' },
  { to: '/admin/settings', label: 'Settings', icon: 'settings' },
];

export function AppLayout({ admin = false }) {
  const { user, logout, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(user?.unreadNotifications ?? 0);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    setUnread(user?.unreadNotifications ?? 0);
  }, [user?.unreadNotifications]);

  // Light polling keeps counters fresh without a socket connection.
  useEffect(() => {
    const timer = setInterval(() => refresh(), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const badges = {
    requests: user?.pendingReceived,
    messages: user?.unreadMessages,
    notifications: unread,
  };

  async function handleLogout() {
    await logout();
    toast.info('You have been signed out.');
    navigate('/');
  }

  function submitSearch(event) {
    event.preventDefault();
    if (!search.trim()) return;
    navigate(`/app/search?q=${encodeURIComponent(search.trim())}`);
    setSearch('');
  }

  const renderLink = (item) => (
    <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
      <Icon name={item.icon} size={19} />
      {item.label}
      {item.badge && badges[item.badge] > 0 && <span className="nav-link__badge">{badges[item.badge]}</span>}
    </NavLink>
  );

  const mobileNav = admin ? MOBILE_ADMIN_NAV : MOBILE_USER_NAV;

  return (
    <div className="app-shell">
      <div className={`sidebar-backdrop ${open ? 'sidebar-backdrop--open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className={`sidebar ${open ? 'sidebar--open' : ''}`} aria-label="Sidebar">
        <div className="sidebar__brand">
          <Brand to={admin ? '/admin' : '/app'} />
          {admin && <span className="admin-badge" style={{ marginLeft: 10 }}>ADMIN</span>}
        </div>
        <nav className="sidebar__nav">
          {admin ? (
            <>
              <span className="sidebar__section">Administration</span>
              {ADMIN_NAV.map(renderLink)}
            </>
          ) : (
            <>
              <span className="sidebar__section">Exchange</span>
              {USER_NAV.map(renderLink)}
              <span className="sidebar__section">Account</span>
              {USER_ACCOUNT_NAV.map(renderLink)}
            </>
          )}
        </nav>
        <div className="sidebar__footer">
          <div className="row row--between row--nowrap">
            <Link to={admin ? '/admin/settings' : '/app/profile'} className="sidebar__user">
              <Avatar name={user?.fullName} src={user?.profile?.avatarUrl} size={38} />
              <div style={{ minWidth: 0 }}>
                <strong>{user?.fullName}</strong>
                <span>{admin ? 'Administrator' : `${user?.wallet?.availableBalance ?? 0} points`}</span>
              </div>
            </Link>
            <button type="button" className="icon-button" onClick={handleLogout} aria-label="Log out" title="Log out">
              <Icon name="logout" size={20} />
            </button>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar__left">
            <button type="button" className="topbar__menu" onClick={() => setOpen(true)} aria-label="Open navigation">
              <Icon name="menu" size={24} />
            </button>
            {!admin && (
              <form className="topbar__search" role="search" onSubmit={submitSearch}>
                <Icon name="search" size={18} />
                <input className="input" type="search" placeholder="Search skills or people…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search skills or people" />
              </form>
            )}
          </div>
          <div className="topbar__right">
            {!admin && (
              <Link to="/app/points" className="points-pill" title="SkillSwap Points available">
                <Icon name="coins" size={16} />
                {user?.wallet?.availableBalance ?? 0}
              </Link>
            )}
            <NotificationBell unreadCount={unread} onCountChange={setUnread} />
            <Link to={admin ? '/admin/settings' : '/app/profile'} aria-label="My profile">
              <Avatar name={user?.fullName} src={user?.profile?.avatarUrl} size={36} />
            </Link>
          </div>
        </header>
        <main className="app-content" id="main">
          <Outlet />
        </main>
        <nav className="bottom-nav" aria-label="Mobile navigation">
          {mobileNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <Icon name={item.icon} size={22} />
              {item.label}
              {item.badge && badges[item.badge] > 0 && <span className="bottom-nav__badge">{badges[item.badge]}</span>}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { notificationsApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { timeAgo } from '../../utils/format.js';
import { Icon, Spinner } from '../ui/index.jsx';

const TYPE_ICONS = {
  REQUEST_RECEIVED: 'swap',
  REQUEST_ACCEPTED: 'check',
  REQUEST_REJECTED: 'x',
  REQUEST_CANCELLED: 'ban',
  SESSION_SCHEDULED: 'calendar',
  SESSION_UPDATED: 'calendar',
  SESSION_CANCELLED: 'calendar',
  SESSION_COMPLETED: 'check',
  NEW_MESSAGE: 'message',
  REVIEW_RECEIVED: 'star',
  REPORT_CREATED: 'flag',
  REPORT_STATUS: 'flag',
  POINTS_EARNED: 'coins',
  POINTS_SPENT: 'coins',
  POINTS_RESERVED: 'lock',
  POINTS_REFUNDED: 'refresh',
  POINTS_ADJUSTED: 'coins',
  BONUS_RECEIVED: 'gift',
  ACCOUNT_SUSPENDED: 'ban',
  ACCOUNT_ACTIVATED: 'check',
  WELCOME: 'sparkles',
};

export function notificationIcon(type) {
  return TYPE_ICONS[type] || 'bell';
}

export function NotificationBell({ unreadCount, onCountChange }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function load() {
    setLoading(true);
    try {
      const data = await notificationsApi.list({ limit: 8 });
      setItems(data.items);
      onCountChange?.(data.unreadCount);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) load();
  }

  async function openItem(item) {
    setOpen(false);
    if (!item.isRead) {
      try {
        await notificationsApi.markRead(item.id);
        onCountChange?.(Math.max(0, unreadCount - 1));
      } catch {
        // ignore
      }
    }
    if (item.link) navigate(item.link);
    refresh();
  }

  async function markAll() {
    await notificationsApi.markAllRead();
    setItems((current) => current?.map((item) => ({ ...item, isRead: true })));
    onCountChange?.(0);
  }

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button type="button" className="icon-button" onClick={toggle} aria-expanded={open} aria-haspopup="dialog" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}>
        <Icon name="bell" size={22} />
        {unreadCount > 0 && <span className="icon-button__dot">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel__header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button type="button" className="link-button small" onClick={markAll}>
                Mark all as read
              </button>
            )}
          </div>
          <div className="notif-panel__list">
            {loading && !items ? (
              <div className="page-loader" style={{ padding: 24 }}>
                <Spinner size={22} />
              </div>
            ) : items?.length ? (
              items.map((item) => (
                <button key={item.id} type="button" className={`notif-item ${item.isRead ? '' : 'notif-item--unread'}`} onClick={() => openItem(item)}>
                  <span className="notif-item__icon">
                    <Icon name={notificationIcon(item.type)} size={16} />
                  </span>
                  <span className="notif-item__body">
                    <strong>{item.title}</strong>
                    <p>{item.message}</p>
                  </span>
                  <span className="notif-item__time">{timeAgo(item.createdAt)}</span>
                </button>
              ))
            ) : (
              <p className="muted text-center" style={{ padding: 24 }}>
                You're all caught up.
              </p>
            )}
          </div>
          <div className="notif-panel__footer">
            <Link to="/app/notifications" onClick={() => setOpen(false)} className="small">
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

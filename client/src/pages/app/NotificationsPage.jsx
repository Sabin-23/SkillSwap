import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { timeAgo } from '../../utils/format.js';
import { notificationIcon } from '../../components/layout/NotificationPanel.jsx';
import { Button, Card, EmptyState, ErrorMessage, Icon, PageHeader, PageLoader, Pagination, Tabs } from '../../components/ui/index.jsx';

export function NotificationsPage() {
  const { refresh, isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [marking, setMarking] = useState(false);
  const { data, loading, error, reload, setData } = useAsync(() => notificationsApi.list({ unread: filter === 'unread' ? 'true' : undefined, page }), [filter, page]);

  async function open(item) {
    if (!item.isRead) {
      try {
        await notificationsApi.markRead(item.id);
        setData((current) => ({ ...current, unreadCount: Math.max(0, current.unreadCount - 1), items: current.items.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)) }));
        refresh();
      } catch {
        // Not critical — the link still works.
      }
    }
    if (item.link) navigate(isAdmin ? item.link.replace(/^\/app\//, '/admin/') : item.link);
  }

  async function markAll() {
    setMarking(true);
    try {
      await notificationsApi.markAllRead();
      toast.success('All notifications marked as read.');
      reload({ silent: true });
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setMarking(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Requests, sessions, messages and points activity in one place."
        actions={
          <Button variant="outline" onClick={markAll} loading={marking} disabled={!data?.unreadCount} icon={<Icon name="check" size={16} />}>
            Mark all as read
          </Button>
        }
      />
      <Tabs
        active={filter}
        onChange={(value) => {
          setFilter(value);
          setPage(1);
        }}
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread', count: data?.unreadCount },
        ]}
      />
      {loading && !data ? (
        <PageLoader />
      ) : error ? (
        <ErrorMessage error={error} onRetry={reload} />
      ) : data.items.length ? (
        <Card padded={false}>
          <div className="list-plain">
            {data.items.map((item) => (
              <button key={item.id} type="button" className={`notif-item ${item.isRead ? '' : 'notif-item--unread'}`} onClick={() => open(item)} style={{ width: '100%' }}>
                <span className="notif-item__icon">
                  <Icon name={notificationIcon(item.type)} size={16} />
                </span>
                <span className="notif-item__body">
                  <strong>{item.title}</strong>
                  <p>{item.message}</p>
                </span>
                <span className="notif-item__time">{timeAgo(item.createdAt)}</span>
              </button>
            ))}
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            <Pagination pagination={data.pagination} onPageChange={setPage} />
          </div>
        </Card>
      ) : (
        <EmptyState icon="bell" title={filter === 'unread' ? "You're all caught up." : 'No notifications yet.'} message={filter === 'unread' ? 'No unread notifications right now.' : 'You will be notified here when someone sends a request, message or review.'} />
      )}
    </div>
  );
}

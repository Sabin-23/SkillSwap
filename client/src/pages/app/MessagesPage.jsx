import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { messagesApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAsync, useDebouncedValue } from '../../hooks/useAsync.js';
import { formatDate, formatDateTime, timeAgo } from '../../utils/format.js';
import { ReportDialog } from '../../components/domain/ReportDialog.jsx';
import { Avatar, Button, ConfirmDialog, EmptyState, ErrorMessage, Icon, Input, Spinner, Textarea } from '../../components/ui/index.jsx';

const POLL_MS = 8000;

export function MessagesPage() {
  const { id } = useParams();
  const { user, refresh } = useAuth();
  const conversationId = id ? Number(id) : null;
  const [search, setSearch] = useState('');
  const query = useDebouncedValue(search);
  const conversations = useAsync(() => messagesApi.conversations(query ? { q: query } : undefined), [query]);

  useEffect(() => {
    const timer = setInterval(() => conversations.reload({ silent: true }), POLL_MS * 2);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function onConversationChanged() {
    conversations.reload({ silent: true });
    refresh();
  }

  return (
    <div className={`chat-layout ${conversationId ? 'chat-layout--conversation' : ''}`}>
      <aside className="chat-list" aria-label="Conversations">
        <div className="chat-list__header">
          <h2>Messages</h2>
          <Input type="search" placeholder="Search conversations" aria-label="Search conversations" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="chat-list__items">
          {conversations.loading && !conversations.data ? (
            <div className="row" style={{ justifyContent: "center", padding: 24 }}>
              <Spinner />
            </div>
          ) : conversations.error ? (
            <div style={{ padding: 24 }}>
              <ErrorMessage error={conversations.error} onRetry={conversations.reload} />
            </div>
          ) : conversations.data.items.length ? (
            conversations.data.items.map((conversation) => (
              <Link key={conversation.id} to={`/app/messages/${conversation.id}`} className={`chat-item ${conversation.id === conversationId ? 'is-active' : ''} ${conversation.unreadCount ? 'chat-item--unread' : ''}`}>
                <Avatar name={conversation.partner.fullName} src={conversation.partner.avatarUrl} size={44} />
                <div className="chat-item__body">
                  <div className="chat-item__top">
                    <strong>{conversation.partner.fullName}</strong>
                    {conversation.lastActivityAt && <time dateTime={conversation.lastActivityAt}>{timeAgo(conversation.lastActivityAt)}</time>}
                  </div>
                  <div className="chat-item__preview">{conversation.lastMessage ? `${conversation.lastMessage.senderId === user.id ? 'You: ' : ''}${conversation.lastMessage.content ?? 'Message deleted'}` : 'No messages yet'}</div>
                </div>
                {conversation.unreadCount > 0 && <span className="chat-item__unread">{conversation.unreadCount}</span>}
              </Link>
            ))
          ) : (
            <EmptyState compact icon="message" title={query ? 'No conversations match.' : 'No conversations yet.'} message={query ? 'Try another name.' : 'Send or accept a skill exchange request to start chatting.'} />
          )}
        </div>
      </aside>
      <section className="chat-pane">
        {conversationId ? <ChatPane key={conversationId} conversationId={conversationId} onChanged={onConversationChanged} /> : <EmptyState icon="message" title="Select a conversation" message="Choose a conversation on the left, or open one from a request." action={<Button to="/app/requests" variant="outline">Go to requests</Button>} />}
      </section>
    </div>
  );
}

function ChatPane({ conversationId, onChanged }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [reporting, setReporting] = useState(null);
  const listRef = useRef(null);
  const { data, loading, error, reload, setData } = useAsync(() => messagesApi.messages(conversationId, { limit: 100 }), [conversationId]);

  useEffect(() => {
    if (!data) return;
    const hasUnread = data.items.some((m) => m.receiverId === user.id && !m.isRead);
    if (hasUnread) messagesApi.markRead(conversationId).then(onChanged).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, conversationId]);

  useEffect(() => {
    const timer = setInterval(() => reload({ silent: true }), POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [data?.items.length]);

  async function send(event) {
    event.preventDefault();
    const text = content.trim();
    if (!text) return;
    setSending(true);
    try {
      const { message } = await messagesApi.send(conversationId, text);
      setData((current) => ({ ...current, items: [...current.items, message] }));
      setContent('');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  }

  async function confirmDelete() {
    try {
      const { message } = await messagesApi.remove(conversationId, deleting.id);
      setData((current) => ({ ...current, items: current.items.map((m) => (m.id === message.id ? message : m)) }));
      toast.success('Message deleted.');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(null);
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send(event);
    }
  }

  if (loading && !data) {
    return (
      <div className="row" style={{ justifyContent: 'center', flex: 1 }}>
        <Spinner label="Loading conversation…" />
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <Button variant="ghost" size="sm" className="chat-pane__back" onClick={() => navigate('/app/messages')} icon={<Icon name="chevronLeft" size={16} />}>
          Back
        </Button>
        <ErrorMessage error={error.status === 404 || error.status === 403 ? 'This conversation is not available.' : error} onRetry={reload} />
      </div>
    );
  }

  const { conversation, items } = data;
  const partner = conversation.partner;
  const canSend = partner.status === 'ACTIVE';

  const grouped = [];
  let lastDay = null;
  for (const message of items) {
    const day = formatDate(message.createdAt);
    if (day !== lastDay) {
      grouped.push({ type: 'day', key: `day-${day}`, label: day });
      lastDay = day;
    }
    grouped.push({ type: 'message', key: message.id, message });
  }

  return (
    <>
      <header className="chat-pane__header">
        <button type="button" className="btn btn--ghost btn--sm chat-pane__back" onClick={() => navigate('/app/messages')} aria-label="Back to conversations">
          <Icon name="chevronLeft" size={18} />
        </button>
        <Avatar name={partner.fullName} src={partner.avatarUrl} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>
            <Link to={`/app/users/${partner.id}`}>{partner.fullName}</Link>
          </strong>
          <div className="small muted">{partner.status === 'ACTIVE' ? 'Skill exchange partner' : 'Account suspended'}</div>
        </div>
        <Button size="sm" variant="ghost" to={`/app/users/${partner.id}`} icon={<Icon name="user" size={14} />}>
          Profile
        </Button>
      </header>
      <div className="chat-pane__messages" ref={listRef} role="log" aria-live="polite">
        {items.length === 0 && <EmptyState compact icon="send" title="Say hello!" message={`Introduce yourself to ${partner.fullName} and agree on the details of your exchange.`} />}
        {grouped.map((entry) =>
          entry.type === 'day' ? (
            <span key={entry.key} className="chat-day">
              {entry.label}
            </span>
          ) : (
            <MessageBubble key={entry.key} message={entry.message} mine={entry.message.senderId === user.id} onDelete={() => setDeleting(entry.message)} onReport={() => setReporting(entry.message)} />
          ),
        )}
      </div>
      <form className="chat-pane__composer" onSubmit={send}>
        <Textarea aria-label="Message" placeholder={canSend ? 'Write a message… (Enter to send, Shift+Enter for a new line)' : 'You cannot message this member right now.'} rows={2} value={content} onChange={(e) => setContent(e.target.value)} onKeyDown={onKeyDown} maxLength={2000} disabled={!canSend || sending} />
        <Button type="submit" loading={sending} disabled={!content.trim() || !canSend} icon={<Icon name="send" size={16} />} aria-label="Send message">
          Send
        </Button>
      </form>
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={confirmDelete} title="Delete this message?" message="The message will be removed for both of you. This cannot be undone." confirmLabel="Delete" danger />
      <ReportDialog open={Boolean(reporting)} onClose={() => setReporting(null)} target={reporting ? { type: 'MESSAGE', id: reporting.id, userId: reporting.senderId, label: `Message from ${partner.fullName}` } : null} />
    </>
  );
}

function MessageBubble({ message, mine, onDelete, onReport }) {
  return (
    <div className={`message-bubble ${mine ? 'message-bubble--mine' : ''}`}>
      <div className={`message-bubble__content ${message.isDeleted ? 'message-bubble__content--deleted' : ''}`}>{message.isDeleted ? 'This message was deleted.' : message.content}</div>
      <div className="message-bubble__meta">
        <time dateTime={message.createdAt} title={formatDateTime(message.createdAt)}>
          {new Date(message.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </time>
        {mine && !message.isDeleted && (
          <>
            <span title={message.isRead ? `Read ${formatDateTime(message.readAt)}` : 'Sent'}>{message.isRead ? 'Read' : 'Sent'}</span>
            <button type="button" className="message-bubble__delete" onClick={onDelete} aria-label="Delete message">
              <Icon name="trash" size={12} />
            </button>
          </>
        )}
        {!mine && !message.isDeleted && (
          <button type="button" className="message-bubble__delete" onClick={onReport} aria-label="Report message">
            <Icon name="flag" size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { matchesApi, messagesApi, notificationsApi, requestsApi, reviewsApi, sessionsApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDate, formatTime, timeAgo } from '../../utils/format.js';
import { notificationIcon } from '../../components/layout/NotificationPanel.jsx';
import { RequestDialog } from '../../components/domain/RequestDialog.jsx';
import { MatchChip } from '../../components/domain/UserCard.jsx';
import { Avatar, Badge, Button, Card, EmptyState, ErrorMessage, Icon, ProgressBar, SkillTag, Spinner, StarRating } from '../../components/ui/index.jsx';

const QUICK_ACTIONS = [
  { to: '/app/find', label: 'Find Skill Partner', icon: 'users' },
  { to: '/app/skills', label: 'Add Skill', icon: 'plus' },
  { to: '/app/requests', label: 'View Requests', icon: 'swap' },
  { to: '/app/sessions', label: 'Schedule Session', icon: 'calendar' },
  { to: '/app/messages', label: 'Messages', icon: 'message' },
  { to: '/app/profile/edit', label: 'Edit Profile', icon: 'edit' },
];

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requestTarget, setRequestTarget] = useState(null);

  const { data, loading, error, reload } = useAsync(
    () =>
      Promise.all([
        matchesApi.list({ limit: 3 }),
        requestsApi.received({ status: 'PENDING', limit: 4 }),
        sessionsApi.list({ view: 'upcoming', limit: 3 }),
        messagesApi.conversations(),
        notificationsApi.list({ limit: 5 }),
        reviewsApi.mine({ limit: 3 }),
      ]).then(([matches, requests, sessions, conversations, notifications, reviews]) => ({
        matches: matches.items,
        requests: requests.items,
        pendingCount: requests.pagination.total,
        sessions: sessions.items,
        conversations: conversations.items.slice(0, 4),
        notifications: notifications.items,
        reviews: reviews.received.items,
      })),
    [],
  );

  const firstName = user.fullName.split(' ')[0];
  const wallet = user.wallet;

  return (
    <div className="stack stack--lg">
      <div className="welcome-card">
        <div>
          <h1>Welcome back, {firstName}!</h1>
          <p>
            {user.completion.percent < 100
              ? `Your profile is ${user.completion.percent}% complete. Finish it to get better matches.`
              : 'Your profile is complete. Time to find your next skill partner.'}
          </p>
        </div>
        <Button to="/app/find" variant="white" icon={<Icon name="users" size={18} />}>
          Find a Skill Partner
        </Button>
      </div>

      <div className="quick-actions">
        {QUICK_ACTIONS.map((action) => (
          <Link key={action.to} to={action.to} className="quick-action">
            <Icon name={action.icon} size={22} />
            {action.label}
          </Link>
        ))}
      </div>

      {error && <ErrorMessage error={error} onRetry={reload} />}

      <div className="dashboard-grid">
        <div className="stack stack--lg">
          <Card>
            <div className="card__header">
              <h2>Suggested matches</h2>
              <Link to="/app/find" className="small">
                See all
              </Link>
            </div>
            {loading ? (
              <Spinner />
            ) : data?.matches.length ? (
              <div className="list-plain">
                {data.matches.map((match) => (
                  <div className="list-item" key={match.id}>
                    <Avatar name={match.fullName} src={match.avatarUrl} size={44} />
                    <div className="list-item__body">
                      <strong>
                        <Link to={`/app/users/${match.id}`}>{match.fullName}</Link> <MatchChip match={match.match} />
                      </strong>
                      <span>Teaches {match.skills.teaches.map((s) => s.name).join(', ') || '—'}</span>
                    </div>
                    <Button size="sm" onClick={() => setRequestTarget(match)} disabled={!match.skills.teaches.length}>
                      Request
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState compact icon="users" title="No skill partners found yet." message="Add skills you teach and want to learn to get suggestions." action={<Button to="/app/skills" size="sm" variant="outline">Add skills</Button>} />
            )}
          </Card>

          <Card>
            <div className="card__header">
              <h2>Pending requests {data?.pendingCount ? <Badge tone="warning">{data.pendingCount}</Badge> : null}</h2>
              <Link to="/app/requests?tab=received" className="small">
                View requests
              </Link>
            </div>
            {loading ? (
              <Spinner />
            ) : data?.requests.length ? (
              <div className="list-plain">
                {data.requests.map((request) => (
                  <div className="list-item" key={request.id}>
                    <Avatar name={request.sender.fullName} src={request.sender.avatarUrl} size={40} />
                    <div className="list-item__body">
                      <strong>{request.sender.fullName}</strong>
                      <span>
                        wants to learn {request.skill.name} · {request.pointCost} points · {timeAgo(request.createdAt)}
                      </span>
                    </div>
                    <Button size="sm" variant="outline" to="/app/requests?tab=received">
                      Respond
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState compact icon="swap" title="You don't have any exchange requests." message="Requests from learners who want your skills will show up here." />
            )}
          </Card>

          <Card>
            <div className="card__header">
              <h2>Upcoming sessions</h2>
              <Link to="/app/sessions" className="small">
                All sessions
              </Link>
            </div>
            {loading ? (
              <Spinner />
            ) : data?.sessions.length ? (
              <div className="list-plain">
                {data.sessions.map((session) => (
                  <div className="list-item" key={session.id}>
                    <span className="stat-card__icon stat-card__icon--info">
                      <Icon name="calendar" size={18} />
                    </span>
                    <div className="list-item__body">
                      <strong>
                        {session.skill.name} with {session.partner.fullName}
                      </strong>
                      <span>
                        {formatDate(session.scheduledDate, { weekday: 'short' })} · {formatTime(session.startTime)} · {session.format === 'ONLINE' ? 'Online' : session.location}
                      </span>
                    </div>
                    <Badge status={session.status} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState compact icon="calendar" title="You don't have any upcoming sessions." message="Accepted requests can be scheduled from the Requests page." />
            )}
          </Card>

          <Card>
            <div className="card__header">
              <h2>Latest reviews</h2>
              <Link to="/app/reviews" className="small">
                All reviews
              </Link>
            </div>
            {loading ? (
              <Spinner />
            ) : data?.reviews.length ? (
              <div className="list-plain">
                {data.reviews.map((review) => (
                  <div className="list-item" key={review.id}>
                    <Avatar name={review.reviewer.fullName} src={review.reviewer.avatarUrl} size={40} />
                    <div className="list-item__body">
                      <strong>
                        {review.reviewer.fullName} <StarRating value={review.rating} size={12} />
                      </strong>
                      <span>{review.comment || `${review.skillName} exchange`}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState compact icon="star" title="No reviews yet." message="Complete an exchange to receive your first review." />
            )}
          </Card>
        </div>

        <div className="stack stack--lg">
          <Card className="points-card">
            <div className="card__header">
              <h2>
                <Icon name="coins" size={18} className="text-accent" /> SkillSwap Points
              </h2>
            </div>
            <p className="points-card__balance">{wallet.availableBalance}</p>
            <p className="small muted">available points</p>
            <div className="points-card__grid">
              <div>
                <span>Reserved</span>
                <strong>{wallet.reservedBalance}</strong>
              </div>
              <div>
                <span>Earned</span>
                <strong>{wallet.totalEarned}</strong>
              </div>
              <div>
                <span>Spent</span>
                <strong>{wallet.totalSpent}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{wallet.totalBalance}</strong>
              </div>
            </div>
            <Button to="/app/points" variant="outline" size="sm" block className="mt-4">
              View Transaction History
            </Button>
          </Card>

          <Card>
            <div className="card__header">
              <h2>Profile completion</h2>
            </div>
            <ProgressBar value={user.completion.percent} label={`Profile ${user.completion.percent}% complete`} showValue={false} tone={user.completion.percent === 100 ? 'success' : 'primary'} />
            {user.completion.missing.length ? (
              <ul className="completion-list mt-3">
                {user.completion.missing.map((item) => (
                  <li key={item.key}>
                    <Icon name="alert" size={14} /> {item.label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small text-success mt-3">All set. Great profile!</p>
            )}
            <Button to="/app/profile/edit" variant="ghost" size="sm" className="mt-2">
              Edit profile
            </Button>
          </Card>

          <Card>
            <div className="card__header">
              <h3>Skills I teach</h3>
              <Link to="/app/skills" className="small">
                Manage
              </Link>
            </div>
            <div className="skill-list">{user.skills.teaches.length ? user.skills.teaches.map((s) => <SkillTag key={s.id} skill={s} tone="teach" />) : <span className="faint small">None yet</span>}</div>
            <h3 className="mt-4">Skills I want to learn</h3>
            <div className="skill-list">{user.skills.wantsToLearn.length ? user.skills.wantsToLearn.map((s) => <SkillTag key={s.id} skill={s} tone="learn" />) : <span className="faint small">None yet</span>}</div>
          </Card>

          <Card>
            <div className="card__header">
              <h3>Recent messages</h3>
              <Link to="/app/messages" className="small">
                Open inbox
              </Link>
            </div>
            {loading ? (
              <Spinner />
            ) : data?.conversations.length ? (
              <div className="list-plain">
                {data.conversations.map((conversation) => (
                  <button key={conversation.id} type="button" className="list-item" style={{ width: '100%', background: 'none', border: 0, textAlign: 'left' }} onClick={() => navigate(`/app/messages/${conversation.id}`)}>
                    <Avatar name={conversation.partner.fullName} src={conversation.partner.avatarUrl} size={36} />
                    <div className="list-item__body">
                      <strong>{conversation.partner.fullName}</strong>
                      <span>{conversation.lastMessage?.content || 'No messages yet'}</span>
                    </div>
                    {conversation.unreadCount > 0 && <span className="chat-item__unread">{conversation.unreadCount}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted small">Start a conversation with a skill partner.</p>
            )}
          </Card>

          <Card>
            <div className="card__header">
              <h3>Recent notifications</h3>
              <Link to="/app/notifications" className="small">
                View all
              </Link>
            </div>
            {loading ? (
              <Spinner />
            ) : data?.notifications.length ? (
              <div className="list-plain">
                {data.notifications.map((item) => (
                  <div className="list-item" key={item.id}>
                    <span className="notif-item__icon">
                      <Icon name={notificationIcon(item.type)} size={15} />
                    </span>
                    <div className="list-item__body">
                      <strong>{item.title}</strong>
                      <span>{item.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">You're all caught up.</p>
            )}
          </Card>
        </div>
      </div>

      <RequestDialog open={Boolean(requestTarget)} onClose={() => setRequestTarget(null)} partner={requestTarget} onSent={() => reload({ silent: true })} />
    </div>
  );
}

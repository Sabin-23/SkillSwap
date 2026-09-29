import { query, withTransaction } from '../../db/pool.js';
import { ApiError } from '../../utils/errors.js';
import { escapeLike } from '../../utils/sanitize.js';
import { parsePagination, paginatedResult } from '../../utils/pagination.js';
import { notify } from '../notifications/notificationService.js';

/**
 * Two users may message each other once an exchange request exists between
 * them (pending, accepted or completed). Administrators may message anyone.
 */
export async function canCommunicate(user, otherId) {
  if (user.role === 'ADMIN') return true;
  const { rows } = await query(
    `SELECT 1 FROM exchange_requests
     WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
       AND status IN ('PENDING', 'ACCEPTED', 'COMPLETED')
     LIMIT 1`,
    [user.id, otherId],
  );
  return rows.length > 0;
}

function mapConversation(row, viewerId) {
  const otherIsOne = row.user_one_id !== viewerId;
  return {
    id: row.id,
    partner: {
      id: otherIsOne ? row.user_one_id : row.user_two_id,
      fullName: otherIsOne ? row.one_name : row.two_name,
      avatarUrl: otherIsOne ? row.one_avatar : row.two_avatar,
      status: otherIsOne ? row.one_status : row.two_status,
    },
    lastMessage: row.last_message_id
      ? {
          id: row.last_message_id,
          content: row.last_content,
          senderId: row.last_sender_id,
          createdAt: row.last_created_at,
        }
      : null,
    lastActivityAt: row.last_message_at,
    unreadCount: row.unread_count,
    createdAt: row.created_at,
  };
}

const CONVERSATION_SELECT = (viewerParam) => `
  c.id, c.user_one_id, c.user_two_id, c.last_message_at, c.created_at,
  u1.full_name AS one_name, p1.avatar_url AS one_avatar, u1.status AS one_status,
  u2.full_name AS two_name, p2.avatar_url AS two_avatar, u2.status AS two_status,
  lm.id AS last_message_id, lm.content AS last_content, lm.sender_id AS last_sender_id, lm.created_at AS last_created_at,
  (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.receiver_id = ${viewerParam} AND m.is_read = FALSE AND m.deleted_at IS NULL) AS unread_count`;

const CONVERSATION_FROM = `
  FROM conversations c
  JOIN users u1 ON u1.id = c.user_one_id
  JOIN profiles p1 ON p1.user_id = u1.id
  JOIN users u2 ON u2.id = c.user_two_id
  JOIN profiles p2 ON p2.user_id = u2.id
  LEFT JOIN LATERAL (
    SELECT id, content, sender_id, created_at FROM messages m
    WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC LIMIT 1
  ) lm ON TRUE`;

export async function listConversations(userId, params) {
  const values = [userId];
  const conditions = ['(c.user_one_id = $1 OR c.user_two_id = $1)'];
  if (params.q) {
    values.push(`%${escapeLike(params.q)}%`);
    conditions.push(
      `((c.user_one_id <> $1 AND u1.full_name ILIKE $${values.length}) OR (c.user_two_id <> $1 AND u2.full_name ILIKE $${values.length}))`,
    );
  }
  const { rows } = await query(
    `SELECT ${CONVERSATION_SELECT('$1')} ${CONVERSATION_FROM}
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
     LIMIT 100`,
    values,
  );
  return rows.map((row) => mapConversation(row, userId));
}

export async function getConversation(userId, id) {
  const { rows } = await query(
    `SELECT ${CONVERSATION_SELECT('$2')} ${CONVERSATION_FROM} WHERE c.id = $1`,
    [id, userId],
  );
  const row = rows[0];
  if (!row) throw ApiError.notFound('Conversation not found.');
  if (row.user_one_id !== userId && row.user_two_id !== userId) {
    throw ApiError.forbidden('You are not part of this conversation.');
  }
  return mapConversation(row, userId);
}

/** Find or create the conversation between the current user and another user. */
export async function openConversation(user, otherId) {
  if (otherId === user.id) throw ApiError.badRequest('You cannot message yourself.');
  const other = await query('SELECT id, status FROM users WHERE id = $1', [otherId]);
  if (!other.rows[0]) throw ApiError.notFound('User not found.');
  if (!(await canCommunicate(user, otherId))) {
    throw ApiError.forbidden('You can message this person once an exchange request exists between you.');
  }
  const [one, two] = user.id < otherId ? [user.id, otherId] : [otherId, user.id];
  const { rows } = await query(
    `INSERT INTO conversations (user_one_id, user_two_id) VALUES ($1, $2)
     ON CONFLICT (user_one_id, user_two_id) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [one, two],
  );
  return getConversation(user.id, rows[0].id);
}

function mapMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    content: row.deleted_at ? null : row.content,
    isDeleted: Boolean(row.deleted_at),
    isRead: row.is_read,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function listMessages(userId, conversationId, params) {
  const conversation = await getConversation(userId, conversationId);
  const pagination = parsePagination(params, { limit: 50 });
  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
      [conversationId, pagination.limit, pagination.offset],
    ),
    query('SELECT COUNT(*)::int AS total FROM messages WHERE conversation_id = $1', [conversationId]),
  ]);
  const result = paginatedResult(rows.reverse().map(mapMessage), count.rows[0].total, pagination);
  return { ...result, conversation };
}

export async function sendMessage(user, conversationId, content) {
  const conversation = await getConversation(user.id, conversationId);
  if (conversation.partner.status !== 'ACTIVE') {
    throw ApiError.conflict('This user is no longer available for messaging.');
  }
  if (!(await canCommunicate(user, conversation.partner.id))) {
    throw ApiError.forbidden('You can message this person once an exchange request exists between you.');
  }
  const message = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO messages (conversation_id, sender_id, receiver_id, content) VALUES ($1, $2, $3, $4) RETURNING *`,
      [conversationId, user.id, conversation.partner.id, content],
    );
    await client.query('UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1', [conversationId]);
    // Collapse message notifications: only notify if there is no unread "new message" notification from this conversation.
    const existing = await client.query(
      `SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'NEW_MESSAGE' AND link = $2 AND is_read = FALSE LIMIT 1`,
      [conversation.partner.id, `/app/messages/${conversationId}`],
    );
    if (!existing.rows[0]) {
      await notify(
        conversation.partner.id,
        {
          type: 'NEW_MESSAGE',
          title: 'New message',
          message: `${user.full_name} sent you a message.`,
          link: `/app/messages/${conversationId}`,
        },
        client,
      );
    }
    return rows[0];
  });
  return mapMessage(message);
}

export async function markConversationRead(userId, conversationId) {
  await getConversation(userId, conversationId);
  const result = await query(
    `UPDATE messages SET is_read = TRUE, read_at = NOW()
     WHERE conversation_id = $1 AND receiver_id = $2 AND is_read = FALSE`,
    [conversationId, userId],
  );
  await query(
    `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND type = 'NEW_MESSAGE' AND link = $2 AND is_read = FALSE`,
    [userId, `/app/messages/${conversationId}`],
  );
  return { updated: result.rowCount };
}

export async function deleteMessage(userId, conversationId, messageId) {
  await getConversation(userId, conversationId);
  const result = await query(
    `UPDATE messages SET deleted_at = NOW() WHERE id = $1 AND conversation_id = $2 AND sender_id = $3 AND deleted_at IS NULL RETURNING *`,
    [messageId, conversationId, userId],
  );
  if (!result.rows[0]) throw ApiError.notFound('Message not found or you cannot delete it.');
  return mapMessage(result.rows[0]);
}

export async function unreadMessageCount(userId) {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS count FROM messages WHERE receiver_id = $1 AND is_read = FALSE AND deleted_at IS NULL',
    [userId],
  );
  return rows[0].count;
}

/** Used by the reporting module to locate a message and its author. */
export async function findMessageForReport(messageId) {
  const { rows } = await query('SELECT id, sender_id, receiver_id, conversation_id FROM messages WHERE id = $1', [messageId]);
  return rows[0] ?? null;
}

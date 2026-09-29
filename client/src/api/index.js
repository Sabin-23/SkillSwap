import { http } from './client.js';

export const authApi = {
  register: (data) => http.post('/auth/register', data),
  login: (data) => http.post('/auth/login', data),
  logout: () => http.post('/auth/logout'),
  me: () => http.get('/auth/me'),
  forgotPassword: (email) => http.post('/auth/forgot-password', { email }),
  resetPassword: (data) => http.post('/auth/reset-password', data),
  changePassword: (data) => http.post('/auth/change-password', data),
};

export const usersApi = {
  discover: (params) => http.get('/users', params),
  get: (id) => http.get(`/users/${id}`),
  update: (id, data) => http.patch(`/users/${id}`, data),
  remove: (id, password) => http.del(`/users/${id}`, { password }),
  uploadAvatar: (id, file) => {
    const form = new FormData();
    form.append('avatar', file);
    return http.upload(`/users/${id}/avatar`, form);
  },
  deleteAvatar: (id) => http.del(`/users/${id}/avatar`),
  skills: (id) => http.get(`/users/${id}/skills`),
  addSkill: (id, data) => http.post(`/users/${id}/skills`, data),
  removeSkill: (id, skillId, type) => http.del(`/users/${id}/skills/${skillId}${type ? `?type=${type}` : ''}`),
  reviews: (id, params) => http.get(`/users/${id}/reviews`, params),
};

export const skillsApi = {
  list: (params) => http.get('/skills', params),
  get: (id) => http.get(`/skills/${id}`),
  create: (data) => http.post('/skills', data),
  update: (id, data) => http.patch(`/skills/${id}`, data),
  remove: (id) => http.del(`/skills/${id}`),
  categories: () => http.get('/categories'),
  createCategory: (data) => http.post('/categories', data),
  updateCategory: (id, data) => http.patch(`/categories/${id}`, data),
  removeCategory: (id) => http.del(`/categories/${id}`),
};

export const matchesApi = {
  list: (params) => http.get('/matches', params),
  get: (id) => http.get(`/matches/${id}`),
};

export const requestsApi = {
  counts: () => http.get('/requests/counts'),
  sent: (params) => http.get('/requests/sent', params),
  received: (params) => http.get('/requests/received', params),
  completed: (params) => http.get('/requests/completed', params),
  all: (params) => http.get('/requests', params),
  get: (id) => http.get(`/requests/${id}`),
  quote: (data) => http.post('/requests/quote', data),
  create: (data) => http.post('/requests', data),
  accept: (id) => http.patch(`/requests/${id}/accept`),
  reject: (id) => http.patch(`/requests/${id}/reject`),
  cancel: (id) => http.patch(`/requests/${id}/cancel`),
};

export const sessionsApi = {
  list: (params) => http.get('/sessions', params),
  get: (id) => http.get(`/sessions/${id}`),
  create: (data) => http.post('/sessions', data),
  update: (id, data) => http.patch(`/sessions/${id}`, data),
  cancel: (id) => http.patch(`/sessions/${id}/cancel`),
  complete: (id) => http.patch(`/sessions/${id}/complete`),
};

export const messagesApi = {
  conversations: (params) => http.get('/conversations', params),
  open: (userId) => http.post('/conversations', { userId }),
  conversation: (id) => http.get(`/conversations/${id}`),
  messages: (id, params) => http.get(`/conversations/${id}/messages`, params),
  send: (id, content) => http.post(`/conversations/${id}/messages`, { content }),
  markRead: (id) => http.patch(`/conversations/${id}/read`),
  remove: (id, messageId) => http.del(`/conversations/${id}/messages/${messageId}`),
  unreadCount: () => http.get('/conversations/unread-count'),
};

export const notificationsApi = {
  list: (params) => http.get('/notifications', params),
  unreadCount: () => http.get('/notifications/unread-count'),
  markRead: (id) => http.patch(`/notifications/${id}/read`),
  markAllRead: () => http.patch('/notifications/read-all'),
};

export const reviewsApi = {
  mine: (params) => http.get('/reviews/mine', params),
  create: (data) => http.post('/reviews', data),
  update: (id, data) => http.patch(`/reviews/${id}`, data),
  remove: (id) => http.del(`/reviews/${id}`),
};

export const reportsApi = {
  create: (data) => http.post('/reports', data),
  mine: () => http.get('/reports/mine'),
  reasons: () => http.get('/reports/reasons'),
};

export const pointsApi = {
  wallet: () => http.get('/points/wallet'),
  transactions: (params) => http.get('/points/transactions', params),
  rates: () => http.get('/points/rates'),
};

export const adminApi = {
  dashboard: () => http.get('/admin/dashboard'),
  users: (params) => http.get('/admin/users', params),
  user: (id) => http.get(`/admin/users/${id}`),
  setUserStatus: (id, status, reason) => http.patch(`/admin/users/${id}/status`, { status, reason }),
  deleteUser: (id) => http.del(`/admin/users/${id}`),
  skills: (params) => http.get('/admin/skills', params),
  requests: (params) => http.get('/admin/requests', params),
  sessions: (params) => http.get('/admin/sessions', params),
  reports: (params) => http.get('/admin/reports', params),
  report: (id) => http.get(`/admin/reports/${id}`),
  updateReport: (id, data) => http.patch(`/admin/reports/${id}`, data),
  reviews: (params) => http.get('/admin/reviews', params),
  removeReview: (id) => http.del(`/admin/reviews/${id}`),
  restoreReview: (id) => http.patch(`/admin/reviews/${id}/restore`),
  pointsOverview: () => http.get('/admin/points/overview'),
  pointsTransactions: (params) => http.get('/admin/points/transactions', params),
  adjustPoints: (data) => http.post('/admin/points/adjust', data),
  createRate: (data) => http.post('/admin/points/rates', data),
  updateRate: (id, data) => http.patch(`/admin/points/rates/${id}`, data),
  updateBonus: (id, data) => http.patch(`/admin/points/bonuses/${id}`, data),
  resolveDispute: (requestId, data) => http.post(`/admin/points/disputes/${requestId}/resolve`, data),
  auditLogs: (params) => http.get('/admin/audit-logs', params),
};

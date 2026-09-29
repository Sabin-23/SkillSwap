const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
    this.fields = details?.fields ?? {};
  }
}

function buildQuery(params) {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/**
 * Thin fetch wrapper. Sends the session cookie, the CSRF header expected by the
 * API on mutating requests, and converts non-2xx responses into ApiError.
 */
export async function apiFetch(path, { method = 'GET', body, params, formData } = {}) {
  const headers = { Accept: 'application/json', 'X-Requested-With': 'SkillSwap' };
  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}${buildQuery(params)}`, {
      method,
      headers,
      body: payload,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, 'Unable to reach the server. Check your connection and try again.');
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message = data?.error || (response.status >= 500 ? 'Something went wrong. Please try again.' : 'Request failed.');
    throw new ApiError(response.status, message, data?.details);
  }
  return data;
}

export const http = {
  get: (path, params) => apiFetch(path, { params }),
  post: (path, body) => apiFetch(path, { method: 'POST', body }),
  patch: (path, body) => apiFetch(path, { method: 'PATCH', body }),
  del: (path, body) => apiFetch(path, { method: 'DELETE', body }),
  upload: (path, formData) => apiFetch(path, { method: 'POST', formData }),
};

export function assetUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}${url}`;
}

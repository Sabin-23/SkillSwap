const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

/** Normalise `page` / `limit` query parameters into safe SQL offsets. */
export function parsePagination(query, defaults = {}) {
  const limitRaw = Number.parseInt(query.limit, 10);
  const pageRaw = Number.parseInt(query.page, 10);
  const limit = Math.min(
    MAX_LIMIT,
    Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : defaults.limit || DEFAULT_LIMIT,
  );
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  return { page, limit, offset: (page - 1) * limit };
}

export function paginatedResult(items, total, { page, limit }) {
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

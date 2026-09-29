import { query } from '../../db/pool.js';
import { ApiError } from '../../utils/errors.js';
import { escapeLike } from '../../utils/sanitize.js';
import { parsePagination, paginatedResult } from '../../utils/pagination.js';
import { audit } from '../admin/auditService.js';

const SKILL_SELECT = `
  s.id, s.name, s.description, s.status, s.created_at, s.updated_at,
  c.id AS category_id, c.name AS category_name,
  (SELECT COUNT(*)::int FROM user_skills us WHERE us.skill_id = s.id AND us.type = 'TEACHES') AS teacher_count,
  (SELECT COUNT(*)::int FROM user_skills us WHERE us.skill_id = s.id AND us.type = 'WANTS_TO_LEARN') AS learner_count`;

function mapSkill(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    category: row.category_id ? { id: row.category_id, name: row.category_name } : null,
    teacherCount: row.teacher_count,
    learnerCount: row.learner_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSkills(params, { includeInactive = false } = {}) {
  const pagination = parsePagination(params, { limit: 50 });
  const conditions = [];
  const values = [];
  if (!includeInactive) conditions.push("s.status = 'ACTIVE'");
  if (params.status && includeInactive) {
    values.push(params.status);
    conditions.push(`s.status = $${values.length}`);
  }
  if (params.q) {
    values.push(`%${escapeLike(params.q)}%`);
    conditions.push(`(s.name ILIKE $${values.length} OR s.description ILIKE $${values.length})`);
  }
  if (params.categoryId) {
    values.push(Number(params.categoryId));
    conditions.push(`s.category_id = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = params.sort === 'popular' ? 'teacher_count DESC, s.name ASC' : params.sort === 'newest' ? 's.created_at DESC' : 's.name ASC';

  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT ${SKILL_SELECT} FROM skills s LEFT JOIN categories c ON c.id = s.category_id
       ${where} ORDER BY ${orderBy} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset],
    ),
    query(`SELECT COUNT(*)::int AS total FROM skills s ${where}`, values),
  ]);
  return paginatedResult(rows.map(mapSkill), count.rows[0].total, pagination);
}

export async function getSkill(id) {
  const { rows } = await query(
    `SELECT ${SKILL_SELECT} FROM skills s LEFT JOIN categories c ON c.id = s.category_id WHERE s.id = $1`,
    [id],
  );
  if (!rows[0]) throw ApiError.notFound('Skill not found.');
  return mapSkill(rows[0]);
}

export async function createSkill(adminId, data) {
  const duplicate = await query('SELECT id FROM skills WHERE LOWER(name) = LOWER($1)', [data.name]);
  if (duplicate.rows[0]) throw ApiError.conflict('A skill with that name already exists.');
  if (data.categoryId) {
    const category = await query('SELECT id FROM categories WHERE id = $1', [data.categoryId]);
    if (!category.rows[0]) throw ApiError.badRequest('Category not found.');
  }
  const { rows } = await query(
    'INSERT INTO skills (name, description, category_id, status) VALUES ($1, $2, $3, $4) RETURNING id',
    [data.name, data.description ?? null, data.categoryId ?? null, data.status ?? 'ACTIVE'],
  );
  await audit(adminId, 'SKILL_CREATED', 'SKILL', rows[0].id, { name: data.name });
  return getSkill(rows[0].id);
}

export async function updateSkill(adminId, id, data) {
  await getSkill(id);
  if (data.name) {
    const duplicate = await query('SELECT id FROM skills WHERE LOWER(name) = LOWER($1) AND id <> $2', [data.name, id]);
    if (duplicate.rows[0]) throw ApiError.conflict('A skill with that name already exists.');
  }
  if (data.categoryId) {
    const category = await query('SELECT id FROM categories WHERE id = $1', [data.categoryId]);
    if (!category.rows[0]) throw ApiError.badRequest('Category not found.');
  }
  const fields = [];
  const values = [];
  const columns = { name: 'name', description: 'description', categoryId: 'category_id', status: 'status' };
  for (const [key, column] of Object.entries(columns)) {
    if (data[key] !== undefined) {
      values.push(data[key]);
      fields.push(`${column} = $${values.length}`);
    }
  }
  if (!fields.length) throw ApiError.badRequest('Nothing to update.');
  values.push(id);
  await query(`UPDATE skills SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
  await audit(adminId, 'SKILL_UPDATED', 'SKILL', id, data);
  return getSkill(id);
}

/**
 * Skills referenced by exchange requests or sessions are deactivated rather than
 * deleted so historical records stay intact. Unreferenced skills are removed.
 */
export async function deleteSkill(adminId, id) {
  const skill = await getSkill(id);
  const refs = await query(
    'SELECT (SELECT COUNT(*) FROM exchange_requests WHERE skill_id = $1)::int AS requests',
    [id],
  );
  if (refs.rows[0].requests > 0) {
    await query("UPDATE skills SET status = 'INACTIVE', updated_at = NOW() WHERE id = $1", [id]);
    await audit(adminId, 'SKILL_DEACTIVATED', 'SKILL', id, { name: skill.name, reason: 'referenced by exchanges' });
    return { deleted: false, deactivated: true };
  }
  await query('DELETE FROM skills WHERE id = $1', [id]);
  await audit(adminId, 'SKILL_DELETED', 'SKILL', id, { name: skill.name });
  return { deleted: true, deactivated: false };
}

// ---------- categories ----------

function mapCategory(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    skillCount: row.skill_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCategories() {
  const { rows } = await query(
    `SELECT c.*, (SELECT COUNT(*)::int FROM skills s WHERE s.category_id = c.id) AS skill_count
     FROM categories c ORDER BY c.name`,
  );
  return rows.map(mapCategory);
}

export async function createCategory(adminId, data) {
  const duplicate = await query('SELECT id FROM categories WHERE LOWER(name) = LOWER($1)', [data.name]);
  if (duplicate.rows[0]) throw ApiError.conflict('A category with that name already exists.');
  const { rows } = await query(
    `INSERT INTO categories (name, description) VALUES ($1, $2)
     RETURNING *, 0 AS skill_count`,
    [data.name, data.description ?? null],
  );
  await audit(adminId, 'CATEGORY_CREATED', 'CATEGORY', rows[0].id, { name: data.name });
  return mapCategory(rows[0]);
}

export async function updateCategory(adminId, id, data) {
  if (data.name) {
    const duplicate = await query('SELECT id FROM categories WHERE LOWER(name) = LOWER($1) AND id <> $2', [data.name, id]);
    if (duplicate.rows[0]) throw ApiError.conflict('A category with that name already exists.');
  }
  const { rows } = await query(
    `UPDATE categories SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = NOW()
     WHERE id = $3
     RETURNING *, (SELECT COUNT(*)::int FROM skills s WHERE s.category_id = categories.id) AS skill_count`,
    [data.name ?? null, data.description ?? null, id],
  );
  if (!rows[0]) throw ApiError.notFound('Category not found.');
  await audit(adminId, 'CATEGORY_UPDATED', 'CATEGORY', id, data);
  return mapCategory(rows[0]);
}

export async function deleteCategory(adminId, id) {
  const { rows } = await query('SELECT name FROM categories WHERE id = $1', [id]);
  if (!rows[0]) throw ApiError.notFound('Category not found.');
  // Skills keep existing; their category becomes "Uncategorised" (FK ON DELETE SET NULL).
  await query('DELETE FROM categories WHERE id = $1', [id]);
  await audit(adminId, 'CATEGORY_DELETED', 'CATEGORY', id, { name: rows[0].name });
}

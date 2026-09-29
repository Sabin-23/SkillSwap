import { query } from '../../db/pool.js';
import { escapeLike } from '../../utils/sanitize.js';
import { parsePagination, paginatedResult } from '../../utils/pagination.js';
import { USER_CARD_SELECT, mapUserCard, skillsForUsers } from '../users/userRepository.js';

/**
 * Compatibility scoring lives in SQL so it can be paginated and sorted.
 * Weights are internal; clients only receive a percentage, a label and
 * human-readable reasons.
 */
const SCORE_SQL = `
  CASE WHEN sc.they_teach_i_want > 0 OR sc.they_want_i_teach > 0 THEN
    LEAST(100,
      CASE WHEN sc.they_teach_i_want > 0 THEN 35 + LEAST(2, sc.they_teach_i_want - 1) * 5 ELSE 0 END +
      CASE WHEN sc.they_want_i_teach > 0 THEN 35 + LEAST(2, sc.they_want_i_teach - 1) * 5 ELSE 0 END +
      CASE WHEN sc.they_teach_i_want > 0 AND sc.they_want_i_teach > 0 THEN 10 ELSE 0 END +
      sc.format_ok * 5 + sc.location_ok * 5)
  ELSE 0 END`;

// $1 is always the viewer's id.
const SCORING_CTE = `
  WITH me AS (SELECT learning_format, location FROM profiles WHERE user_id = $1),
  sc AS (
    SELECT u.id,
      (SELECT COUNT(*) FROM user_skills us WHERE us.user_id = u.id AND us.type = 'TEACHES'
         AND us.skill_id IN (SELECT skill_id FROM user_skills WHERE user_id = $1 AND type = 'WANTS_TO_LEARN'))::int AS they_teach_i_want,
      (SELECT COUNT(*) FROM user_skills us WHERE us.user_id = u.id AND us.type = 'WANTS_TO_LEARN'
         AND us.skill_id IN (SELECT skill_id FROM user_skills WHERE user_id = $1 AND type = 'TEACHES'))::int AS they_want_i_teach,
      CASE WHEN me.learning_format IS NULL OR p.learning_format IS NULL OR me.learning_format = 'EITHER'
                OR p.learning_format = 'EITHER' OR me.learning_format = p.learning_format THEN 1 ELSE 0 END AS format_ok,
      CASE WHEN me.location IS NOT NULL AND p.location IS NOT NULL AND LOWER(p.location) = LOWER(me.location) THEN 1 ELSE 0 END AS location_ok
    FROM users u
    JOIN profiles p ON p.user_id = u.id
    LEFT JOIN me ON TRUE
    WHERE u.id <> $1
  )`;

const SORTS = {
  match: 'score DESC, rating DESC NULLS LAST, u.full_name ASC',
  rating: 'rating DESC NULLS LAST, score DESC, u.full_name ASC',
  newest: 'u.created_at DESC',
  name: 'u.full_name ASC',
};

export function compatibilityLabel(score) {
  if (score >= 80) return 'Great Match';
  if (score >= 40) return 'Good Match';
  if (score > 0) return 'Potential Match';
  return null;
}

function buildReasons(viewerSkills, candidateSkills, candidate, viewerProfile) {
  const reasons = [];
  const mine = viewerSkills ?? { teaches: [], wantsToLearn: [] };
  const theirs = candidateSkills ?? { teaches: [], wantsToLearn: [] };
  const iWant = new Set(mine.wantsToLearn.map((s) => s.id));
  const iTeach = new Set(mine.teaches.map((s) => s.id));

  for (const skill of theirs.teaches) {
    if (iWant.has(skill.id)) {
      reasons.push(`They can teach ${skill.name}`, `You want to learn ${skill.name}`);
    }
  }
  for (const skill of theirs.wantsToLearn) {
    if (iTeach.has(skill.id)) {
      reasons.push(`You can teach ${skill.name}`, `They want to learn ${skill.name}`);
    }
  }
  if (reasons.length && viewerProfile) {
    const a = viewerProfile.learning_format;
    const b = candidate.learningFormat;
    if (a && b && (a === 'EITHER' || b === 'EITHER' || a === b)) {
      reasons.push('Compatible learning format');
    }
    if (viewerProfile.location && candidate.location && viewerProfile.location.toLowerCase() === candidate.location.toLowerCase()) {
      reasons.push(`Both located in ${candidate.location}`);
    }
  }
  return reasons;
}

/**
 * Discover users, scored against the viewer.
 * options.requireMatch limits results to users with a positive compatibility score.
 */
export async function discoverUsers(viewerId, params, { requireMatch = false } = {}) {
  const pagination = parsePagination(params, { limit: 12 });
  const values = [viewerId];
  const conditions = ["u.status = 'ACTIVE'", "u.role = 'USER'", 'p.is_public = TRUE', 'u.id <> $1'];

  if (params.q) {
    values.push(`%${escapeLike(params.q)}%`);
    conditions.push(
      `(u.full_name ILIKE $${values.length} OR p.location ILIKE $${values.length}
        OR EXISTS (SELECT 1 FROM user_skills us JOIN skills s ON s.id = us.skill_id
                   WHERE us.user_id = u.id AND us.type = 'TEACHES' AND s.name ILIKE $${values.length}))`,
    );
  }
  if (params.skillId) {
    values.push(Number(params.skillId));
    const type = params.skillType === 'WANTS_TO_LEARN' ? 'WANTS_TO_LEARN' : 'TEACHES';
    conditions.push(
      `EXISTS (SELECT 1 FROM user_skills us WHERE us.user_id = u.id AND us.skill_id = $${values.length} AND us.type = '${type}')`,
    );
  }
  if (params.skill) {
    values.push(`%${escapeLike(params.skill)}%`);
    const type = params.skillType === 'WANTS_TO_LEARN' ? 'WANTS_TO_LEARN' : 'TEACHES';
    conditions.push(
      `EXISTS (SELECT 1 FROM user_skills us JOIN skills s ON s.id = us.skill_id
               WHERE us.user_id = u.id AND us.type = '${type}' AND s.name ILIKE $${values.length})`,
    );
  }
  if (params.categoryId) {
    values.push(Number(params.categoryId));
    conditions.push(
      `EXISTS (SELECT 1 FROM user_skills us JOIN skills s ON s.id = us.skill_id
               WHERE us.user_id = u.id AND us.type = 'TEACHES' AND s.category_id = $${values.length})`,
    );
  }
  if (params.location) {
    values.push(`%${escapeLike(params.location)}%`);
    conditions.push(`p.location ILIKE $${values.length}`);
  }
  if (params.format && ['ONLINE', 'IN_PERSON', 'EITHER'].includes(params.format)) {
    values.push(params.format);
    conditions.push(
      params.format === 'EITHER'
        ? `p.learning_format = $${values.length}`
        : `(p.learning_format = $${values.length} OR p.learning_format = 'EITHER')`,
    );
  }
  if (params.minRating) {
    values.push(Number(params.minRating));
    conditions.push(
      `(SELECT AVG(r.rating) FROM reviews r WHERE r.reviewed_user_id = u.id AND r.status = 'VISIBLE') >= $${values.length}`,
    );
  }
  if (params.compatibility === 'teaches_what_i_want') conditions.push('sc.they_teach_i_want > 0');
  if (params.compatibility === 'wants_what_i_teach') conditions.push('sc.they_want_i_teach > 0');
  if (params.compatibility === 'mutual') conditions.push('sc.they_teach_i_want > 0 AND sc.they_want_i_teach > 0');
  if (requireMatch) conditions.push(`(${SCORE_SQL}) > 0`);

  const orderBy = SORTS[params.sort] || SORTS.match;
  const where = conditions.join(' AND ');

  const fromClause = `
    FROM users u
    JOIN profiles p ON p.user_id = u.id
    JOIN sc ON sc.id = u.id
    WHERE ${where}`;

  const [rowsResult, countResult, viewerProfileResult] = await Promise.all([
    query(
      `${SCORING_CTE}
       SELECT ${USER_CARD_SELECT}, (${SCORE_SQL})::int AS score, sc.they_teach_i_want, sc.they_want_i_teach
       ${fromClause}
       ORDER BY ${orderBy}
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset],
    ),
    query(`${SCORING_CTE} SELECT COUNT(*)::int AS total ${fromClause}`, values),
    query('SELECT learning_format, location FROM profiles WHERE user_id = $1', [viewerId]),
  ]);

  const ids = rowsResult.rows.map((row) => row.id);
  const skillsMap = await skillsForUsers([viewerId, ...ids]);
  const viewerSkills = skillsMap.get(viewerId);
  const viewerProfile = viewerProfileResult.rows[0] ?? null;

  const items = rowsResult.rows.map((row) => {
    const card = mapUserCard(row, skillsMap.get(row.id));
    return {
      ...card,
      match: {
        score: row.score,
        label: compatibilityLabel(row.score),
        reasons: buildReasons(viewerSkills, card.skills, card, viewerProfile),
      },
    };
  });
  return paginatedResult(items, countResult.rows[0].total, pagination);
}

/** Compute the match between the viewer and one specific user. */
export async function matchWithUser(viewerId, otherId) {
  const skillsMap = await skillsForUsers([viewerId, otherId]);
  const mine = skillsMap.get(viewerId);
  const theirs = skillsMap.get(otherId);
  const profiles = await query(
    'SELECT user_id, learning_format, location FROM profiles WHERE user_id = ANY($1::int[])',
    [[viewerId, otherId]],
  );
  const viewerProfile = profiles.rows.find((row) => row.user_id === viewerId) ?? null;
  const otherProfile = profiles.rows.find((row) => row.user_id === otherId) ?? null;

  const iWant = new Set(mine.wantsToLearn.map((s) => s.id));
  const iTeach = new Set(mine.teaches.map((s) => s.id));
  const theyTeachIWant = theirs.teaches.filter((s) => iWant.has(s.id)).length;
  const theyWantITeach = theirs.wantsToLearn.filter((s) => iTeach.has(s.id)).length;

  let score = 0;
  if (theyTeachIWant > 0 || theyWantITeach > 0) {
    if (theyTeachIWant > 0) score += 35 + Math.min(2, theyTeachIWant - 1) * 5;
    if (theyWantITeach > 0) score += 35 + Math.min(2, theyWantITeach - 1) * 5;
    if (theyTeachIWant > 0 && theyWantITeach > 0) score += 10;
    const a = viewerProfile?.learning_format;
    const b = otherProfile?.learning_format;
    if (!a || !b || a === 'EITHER' || b === 'EITHER' || a === b) score += 5;
    if (viewerProfile?.location && otherProfile?.location && viewerProfile.location.toLowerCase() === otherProfile.location.toLowerCase()) {
      score += 5;
    }
    score = Math.min(100, score);
  }
  const candidate = { learningFormat: otherProfile?.learning_format, location: otherProfile?.location };
  return { score, label: compatibilityLabel(score), reasons: buildReasons(mine, theirs, candidate, viewerProfile) };
}

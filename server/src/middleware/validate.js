import { ZodError } from 'zod';
import { ApiError } from '../utils/errors.js';

/**
 * Validate `req[source]` with a zod schema and replace it with the parsed value.
 * Field errors are returned as `{ field: message }` so the client can show them inline.
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    try {
      req[source] = schema.parse(req[source] ?? {});
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const fields = {};
        for (const issue of err.issues) {
          const key = issue.path.join('.') || '_';
          if (!fields[key]) fields[key] = issue.message;
        }
        const first = Object.values(fields)[0] || 'Invalid input.';
        next(ApiError.badRequest(first, { fields }));
        return;
      }
      next(err);
    }
  };
}

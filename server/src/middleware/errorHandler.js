import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'The requested resource was not found.' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    const body = { error: err.message };
    if (err.details) body.details = err.details;
    res.status(err.status).json(body);
    return;
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `The file is too large. Maximum size is ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB.`
        : 'The uploaded file could not be processed.';
    res.status(400).json({ error: message });
    return;
  }

  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'The request body is not valid JSON.' });
    return;
  }

  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'The request body is too large.' });
    return;
  }

  // Unique-constraint violations from PostgreSQL that were not caught upstream.
  if (err?.code === '23505') {
    res.status(409).json({ error: 'That record already exists.' });
    return;
  }
  if (err?.code === '23503') {
    res.status(409).json({ error: 'That action is not allowed because related records exist.' });
    return;
  }
  if (err?.code === '23514') {
    res.status(400).json({ error: 'The request violates a data rule.' });
    return;
  }

  if (!env.isTest) {
    console.error(err);
  }
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

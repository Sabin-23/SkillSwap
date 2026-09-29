/**
 * Error type carrying an HTTP status and a safe, user-facing message.
 * Anything that is not an ApiError is treated as an unexpected server error
 * and its details are never sent to the client.
 */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
    this.expose = true;
  }

  static badRequest(message = 'Invalid request.', details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'You need to sign in to continue.') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to do that.') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found.') {
    return new ApiError(404, message);
  }

  static conflict(message = 'That action conflicts with the current state.') {
    return new ApiError(409, message);
  }

  static tooMany(message = 'Too many requests. Please try again later.') {
    return new ApiError(429, message);
  }
}

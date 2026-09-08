export class PublicError extends Error {
  constructor(message, code = null, retryAt = null) {
    super(message);
    this.name = 'PublicError';
    this.code = code;
    this.retryAt = retryAt;
  }
}
export function safeError(error) {
  return error instanceof PublicError ? error.message : 'The operation could not complete. Check your connection and try again.';
}

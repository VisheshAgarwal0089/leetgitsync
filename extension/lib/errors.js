export class PublicError extends Error {}
export function safeError(error) {
  return error instanceof PublicError ? error.message : 'The operation could not complete. Check your connection and try again.';
}

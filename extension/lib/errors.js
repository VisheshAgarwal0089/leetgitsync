export class PublicError extends Error {
  constructor(message, code = null, retryAt = null) {
    super(message);
    this.name = 'PublicError';
    this.code = code;
    this.retryAt = retryAt;
  }
}
const publicMessages = [
  /^LeetCode (?:tag|language|problem slug|problem title) is (?:missing|invalid)\.$/,
  /^LeetCode (?:submission ID|problem slug|problem number|submission timestamp) is invalid\.$/,
  /^Submitted source code is missing or too large\.$/, /^Captured LeetCode record is invalid\.$/,
  /^Enter a valid (?:GitHub owner|repository name|target branch)\.$/,
  /^Use a relative solutions directory /, /^Network connection unavailable\.$/,
  /^GitHub (?:rate limited authorization|authorization is unavailable|returned an invalid authorization response|authentication expired|rate limit reached|denied access|request failed|returned an invalid response|returned an invalid account response)/,
  /^(?:Repository|GitHub resource|Target branch) (?:not found|was not found)/, /^Choose an active repository /,
  /^Stored data migration failed\./, /^Connect GitHub (?:first|before validating)/,
  /^Pending submissions will keep /, /^Synchronization queue is full\./,
  /^Failed synchronization job was not found\.$/, /^Unsupported extension request\.$/,
  /^GitHub authorization is temporarily unavailable\./, /^GitHub authentication expired\./,
];
export function safeError(error) {
  if (error instanceof PublicError && typeof error.message === 'string' && error.message.length <= 300 && publicMessages.some((pattern) => pattern.test(error.message))) return error.message;
  return 'The operation could not complete. Check your connection and try again.';
}

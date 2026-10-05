/** Every error the API intentionally returns. Carries a stable machine-readable `code`. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export interface ErrorDetail {
  in?: string;
  path: string;
  message: string;
}

export const Errors = {
  unauthorized: () => new AppError(401, 'UNAUTHORIZED', 'Authentication is required.'),
  /** Website JWT problems. */
  invalidToken: () => new AppError(401, 'INVALID_TOKEN', 'The provided token is invalid.'),
  tokenExpired: () => new AppError(401, 'TOKEN_EXPIRED', 'The provided token has expired.'),
  /** CLI token problems (unknown, malformed or revoked). */
  invalidCliToken: () => new AppError(401, 'INVALID_TOKEN', 'The provided CLI token is invalid or has been revoked.'),
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.'),
  usernameTaken: () => new AppError(409, 'USERNAME_TAKEN', 'This username is already taken.'),
  tokenAlreadyExists: () =>
    new AppError(
      409,
      'TOKEN_ALREADY_EXISTS',
      'A CLI token already exists for this account. Its value cannot be shown again; call GET /api/v1/token/update to rotate it and receive a new one.',
    ),
} as const;

import { apiRequest } from './client';
import { signinResponseSchema, type SigninResponse } from './schemas';

export interface SigninInput {
  email: string;
  password: string;
  /** Only used by the backend when the call creates the account. */
  username?: string | undefined;
  name?: string | undefined;
}

/**
 * POST /signin: one endpoint for both login and account creation.
 * `created` is true when the backend answered 201 (a new account), false for 200 (existing account).
 */
export async function signin(input: SigninInput, signal?: AbortSignal): Promise<{ created: boolean; response: SigninResponse }> {
  const result = await apiRequest({
    method: 'POST',
    path: '/signin',
    schema: signinResponseSchema,
    body: input,
    ...(signal ? { signal } : {}),
  });
  return { created: result.status === 201, response: result.data };
}

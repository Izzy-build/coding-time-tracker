import { apiRequest } from './client';
import { cliTokenResponseSchema } from './schemas';

/** GET /token/get (website JWT): generates the CLI token. 409 TOKEN_ALREADY_EXISTS if one is active. */
export async function getCliToken(jwt: string, signal?: AbortSignal): Promise<string> {
  const { data } = await apiRequest({ path: '/token/get', schema: cliTokenResponseSchema, jwt, ...(signal ? { signal } : {}) });
  return data.token;
}

/** GET /token/update (website JWT): revokes the current token immediately and returns a new one. */
export async function updateCliToken(jwt: string, signal?: AbortSignal): Promise<string> {
  const { data } = await apiRequest({ path: '/token/update', schema: cliTokenResponseSchema, jwt, ...(signal ? { signal } : {}) });
  return data.token;
}

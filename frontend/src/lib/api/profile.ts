import { apiRequest } from './client';
import { cliProfileSchema, type CliProfile } from './schemas';

/**
 * GET /profile/:token. The CLI token has to be in the URL (that is the backend contract), so this is only called
 * when the page truly needs the profile, and the client never logs URLs. 401 means the token was revoked/rotated.
 */
export async function getProfile(cliToken: string, signal?: AbortSignal): Promise<CliProfile> {
  const { data } = await apiRequest({
    path: `/profile/${encodeURIComponent(cliToken)}`,
    schema: cliProfileSchema,
    ...(signal ? { signal } : {}),
  });
  return data;
}

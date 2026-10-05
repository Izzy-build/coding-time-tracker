import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** The backend, called DIRECTLY (this is how the CLI talks to it). */
export const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:3000';
export const PASSWORD = 'correct-horse-battery';
export const TOKEN_RE = /^ctt_[A-Za-z0-9]{21}$/;

let counter = 0;
export function uniqueUser(prefix = 'e2e') {
  counter += 1;
  const id = `${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 5)}`;
  return { email: `${prefix}.${id}@example.com`, username: `${prefix}_${id}`.slice(0, 32), name: 'E2E Tester', password: PASSWORD };
}
export type TestUser = ReturnType<typeof uniqueUser>;

/** Creates a user straight through the API and returns its website JWT. */
export async function apiSignup(request: APIRequestContext, user: TestUser): Promise<string> {
  const res = await request.post(`${API}/api/v1/signin`, { data: user });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { token: string }).token;
}

export async function apiGetToken(request: APIRequestContext, jwt: string): Promise<string> {
  const res = await request.get(`${API}/api/v1/token/get`, { headers: { authorization: `Bearer ${jwt}` } });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

/** What the CLI does every ~5 minutes. */
export async function apiReport(request: APIRequestContext, token: string, seconds: number) {
  const res = await request.post(`${API}/api/v1/report`, { data: { token, seconds } });
  expect(res.status()).toBe(200);
  return (await res.json()) as { totalSeconds: number };
}

export async function apiValidate(request: APIRequestContext, token: string) {
  const res = await request.get(`${API}/api/v1/validate/${token}`);
  return { status: res.status(), body: (await res.json()) as { message: string } };
}

export async function signUpViaUi(page: Page, user: TestUser) {
  await page.goto('/auth?mode=signup');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel(/^Name/).fill(user.name);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

export async function signInViaUi(page: Page, email: string, password: string) {
  await page.goto('/auth?mode=login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Records everything that could leak a secret: console output, requests, and non-app origins. */
export function watchPage(page: Page, baseURL: string) {
  const consoleLines: string[] = [];
  const problems: string[] = [];
  const requests: { url: string; method: string; body: string | null }[] = [];
  const foreignOrigins = new Set<string>();
  const origin = new URL(baseURL).origin;

  page.on('console', (msg) => {
    consoleLines.push(msg.text());
    if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('request', (req) => {
    const url = new URL(req.url());
    requests.push({ url: req.url(), method: req.method(), body: req.postData() });
    if (/^https?:$/.test(url.protocol) && url.origin !== origin) foreignOrigins.add(url.origin);
  });
  return { consoleLines, problems, requests, foreignOrigins };
}

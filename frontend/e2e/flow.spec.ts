import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  apiReport,
  apiValidate,
  PASSWORD,
  signInViaUi,
  TOKEN_RE,
  uniqueUser,
  watchPage,
} from './helpers';

/**
 * The complete user journey against the REAL backend: landing -> sign up -> dashboard -> generate token ->
 * (CLI reports time) -> total/profile/leaderboard -> rotate token -> returning user -> sign out -> sign in.
 * Tests share one browser context on purpose: each step builds on the previous one.
 */
test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;
let watch: ReturnType<typeof watchPage>;
const user = uniqueUser('flow');
let firstToken = '';
let secondToken = '';

const MASK = `ctt_${'•'.repeat(21)}`;
const tokenBox = () => page.getByTestId('cli-token');
const toasts = () => page.getByRole('region', { name: 'Notifications' });

test.beforeAll(async ({ browser, baseURL }) => {
  context = await browser.newContext({ baseURL: baseURL ?? '', permissions: ['clipboard-read', 'clipboard-write'] });
  page = await context.newPage();
  watch = watchPage(page, baseURL ?? 'http://127.0.0.1:3001');
});
test.afterAll(async () => {
  await context.close();
});

test('landing page explains the product and its CTAs lead to the auth page', async () => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Coding Time Tracker/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('actually code');
  const steps = page.getByRole('list').filter({ has: page.getByRole('heading', { level: 3, name: 'Compete on the leaderboard' }) });
  await expect(steps.getByRole('listitem')).toHaveCount(5);
  for (const title of ['Create an account', 'Get your CLI token', 'Code', 'Your coding time is reported', 'Compete on the leaderboard']) {
    await expect(steps.getByRole('heading', { level: 3, name: title })).toBeVisible();
  }
  await page.getByRole('main').getByRole('link', { name: /Create an account/ }).first().click();
  await expect(page).toHaveURL(/\/auth\?mode=signup$/);
  await page.goto('/');
  await page.getByRole('main').getByRole('link', { name: 'Sign in' }).first().click();
  await expect(page).toHaveURL(/\/auth\?mode=login$/);
});

test('sign-up form validates on the client and sends nothing to the server when invalid', async () => {
  await page.goto('/auth?mode=signup');
  const before = watch.requests.filter((r) => r.url.includes('/api/v1/signin')).length;

  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter your email address.')).toBeVisible();
  await expect(page.getByText('Use at least 3 characters.')).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');

  await page.getByLabel('Email').fill('not-an-email');
  await page.getByLabel('Username').fill('bad name!');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await expect(page.getByText('Only letters, numbers, "_" and "-" are allowed.')).toBeVisible();
  await expect(page.getByText('Use at least 10 characters.')).toBeVisible();

  expect(watch.requests.filter((r) => r.url.includes('/api/v1/signin')).length).toBe(before);
});

test('creating an account lands on the dashboard with a welcome and an empty state', async () => {
  await page.goto('/auth?mode=signup');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel(/^Name/).fill(user.name);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('welcome-username')).toHaveText(user.username);
  await expect(page.getByText(user.name, { exact: true })).toBeVisible();
  await expect(toasts()).toContainText('Account created');
  await expect(page.getByTestId('total-formatted')).toHaveText('0s');
  await expect(page.getByText('No coding time recorded yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate CLI token' })).toBeVisible();
  // quick links from the dashboard design
  await expect(page.getByRole('main').getByRole('link', { name: /Leaderboard/ })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /Profile/ })).toBeVisible();
  // signed in: the footer offers the dashboard, not "Sign in"
  const footer = page.getByRole('navigation', { name: 'Footer' });
  await expect(footer.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
});

test('generating the CLI token shows a 25-character token once, with reveal/hide and copy', async () => {
  await page.getByRole('button', { name: 'Generate CLI token' }).click();
  await expect(page.getByText('Copy your token now')).toBeVisible();

  firstToken = ((await tokenBox().textContent()) ?? '').trim();
  expect(firstToken).toHaveLength(25);
  expect(firstToken).toMatch(TOKEN_RE);

  // Copy puts exactly the token on the clipboard.
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(toasts()).toContainText('Token copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(firstToken);

  // Hidden: bullets only, and the real value is not anywhere in the DOM.
  await page.getByRole('button', { name: 'Hide' }).click();
  await expect(tokenBox()).toHaveText(MASK);
  expect(await page.content()).not.toContain(firstToken);

  await page.getByRole('button', { name: 'Reveal' }).click();
  await expect(tokenBox()).toHaveText(firstToken);
});

test('the CLI side works with that token and the dashboard reflects reported time', async ({ request }) => {
  expect(await apiValidate(request, firstToken)).toEqual({ status: 200, body: { message: 'User exists' } });

  expect((await apiReport(request, firstToken, 300)).totalSeconds).toBe(300);
  await page.getByRole('button', { name: 'Refresh total coding time' }).click();
  await expect(page.getByTestId('total-formatted')).toHaveText('5m');
  await expect(page.getByTestId('total-detail')).toContainText('300 seconds · 0.08 hours');

  expect((await apiReport(request, firstToken, 2100)).totalSeconds).toBe(2400);
  await page.getByRole('button', { name: 'Refresh total coding time' }).click();
  await expect(page.getByTestId('total-formatted')).toHaveText('40m');
  await expect(page.getByTestId('total-detail')).toContainText('2,400 seconds · 0.67 hours');
});

test('the profile page shows the safe profile data and nothing sensitive', async () => {
  await page.getByRole('main').getByRole('link', { name: /Profile/ }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByTestId('profile-username')).toHaveText(user.username);
  await expect(page.getByTestId('profile-name')).toHaveText(user.name);
  await expect(page.getByTestId('profile-email')).toHaveText(user.email);
  await expect(page.getByTestId('profile-created')).toHaveText(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
  await expect(page.getByTestId('profile-total')).toContainText('40m');
  await expect(page.getByTestId('profile-total')).toContainText('2,400 seconds');

  const html = (await page.content()).toLowerCase();
  for (const forbidden of ['password_hash', 'passwordhash', 'argon2', 'token_hash', 'jwt_access_secret']) {
    expect(html).not.toContain(forbidden);
  }
  expect(await page.content()).not.toContain(firstToken);
  // This tab holds the CLI token, so the profile came from GET /profile/:token.
  expect(watch.requests.some((r) => r.url.includes('/api/v1/profile/'))).toBe(true);
});

test('the leaderboard lists the user with a rank, their time and a "You" marker', async () => {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Leaderboard' }).click();
  await expect(page).toHaveURL(/\/leaderboard$/);
  const row = page.getByTestId('leaderboard-row').filter({ hasText: user.username });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('You');
  await expect(row).toContainText('40m');
  await expect(row).toContainText('2,400');
  await expect(row.getByRole('cell').first()).toHaveText(/^\d+$/);
  await expect(page.getByRole('columnheader', { name: 'Rank' })).toBeVisible();
});

test('updating the token asks for confirmation, then replaces the old token everywhere', async ({ request }) => {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Dashboard' }).click();
  await expect(tokenBox()).toHaveText(MASK); // masked again after navigating back

  const dialog = page.getByRole('dialog', { name: 'Update your CLI token?' });
  await page.getByRole('button', { name: 'Update token' }).click();
  await expect(dialog).toContainText('Updating your token will immediately invalidate your current CLI token. Continue?');

  // Cancel changes nothing.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect((await apiValidate(request, firstToken)).status).toBe(200);

  // Escape also cancels.
  await page.getByRole('button', { name: 'Update token' }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect((await apiValidate(request, firstToken)).status).toBe(200);

  // Confirm rotates.
  await page.getByRole('button', { name: 'Update token' }).click();
  await dialog.getByRole('button', { name: 'Update token' }).click();
  await expect(dialog).toBeHidden();
  await expect(toasts()).toContainText('previous token no longer works');

  secondToken = ((await tokenBox().textContent()) ?? '').trim();
  expect(secondToken).toMatch(TOKEN_RE);
  expect(secondToken).not.toBe(firstToken);
  expect(await page.content()).not.toContain(firstToken); // the old token is gone from the UI

  expect(await apiValidate(request, firstToken)).toEqual({ status: 401, body: { message: 'User does not exist' } });
  expect(await apiValidate(request, secondToken)).toEqual({ status: 200, body: { message: 'User exists' } });
});

test('a reload keeps the masked token and the total (profile path) in the same tab', async () => {
  await page.reload();
  await expect(tokenBox()).toHaveText(MASK);
  await expect(page.getByTestId('total-formatted')).toHaveText('40m');
});

test('a returning user in a new tab (JWT only) still sees their total and learns a token exists', async ({ browser, baseURL }) => {
  const returning = await browser.newContext({ storageState: await context.storageState(), baseURL: baseURL ?? '' });
  const p = await returning.newPage();
  const seen: string[] = [];
  p.on('request', (r) => seen.push(r.url()));

  await p.goto('/dashboard');
  await expect(p.getByTestId('welcome-username')).toHaveText(user.username);
  // No CLI token in this tab: the total comes from the public leaderboard, with a rank chip.
  await expect(p.getByTestId('total-formatted')).toHaveText('40m');
  await expect(p.getByTestId('total-detail')).toContainText(/Rank #\d+/);
  expect(seen.some((u) => u.includes('/api/v1/profile/'))).toBe(false);
  expect(seen.some((u) => u.includes('/api/v1/leaderboard'))).toBe(true);

  await p.getByRole('button', { name: 'Generate CLI token' }).click();
  await expect(p.getByText('You already have a CLI token')).toBeVisible();
  await expect(p.getByTestId('cli-token')).toHaveCount(0);

  // The profile page degrades gracefully too.
  await p.goto('/profile');
  await expect(p.getByText('Showing the details from your sign-in')).toBeVisible();
  await expect(p.getByTestId('profile-total')).toContainText('40m');
  await returning.close();
});

test('signing out returns home, clears the session, and protected pages bounce to sign-in without looping', async () => {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => localStorage.getItem('ctt.session.v1'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('ctt.cli-token.v1'))).toBeNull();

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/auth\?mode=login$/);
  await page.waitForTimeout(1500); // a redirect loop would have moved us by now
  await expect(page).toHaveURL(/\/auth\?mode=login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('signing in again: wrong password is explained, the right one works and creates no new account', async () => {
  await signInViaUi(page, user.email, 'definitely-the-wrong-password');
  // (Next.js's route announcer also has role=alert, so match on the message text.)
  await expect(page.getByRole('alert').filter({ hasText: 'Incorrect email or password.' })).toBeVisible();
  await expect(page).toHaveURL(/\/auth\?mode=login$/);

  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('welcome-username')).toHaveText(user.username); // same account
  await expect(toasts()).not.toContainText('new account');
  await expect(page.getByTestId('total-formatted')).toHaveText('40m');
});

test('nothing sensitive leaked: console, other origins, passwords and tokens in requests', async () => {
  const jwt = await page.evaluate(() => {
    const raw = localStorage.getItem('ctt.session.v1');
    return raw ? (JSON.parse(raw) as { token: string }).token : '';
  });
  expect(jwt.split('.')).toHaveLength(3);

  const everything = JSON.stringify(watch.consoleLines);
  for (const secret of [firstToken, secondToken, jwt, PASSWORD]) expect(everything).not.toContain(secret);

  // The app only ever talks to its own origin (the proxy), never to a third party.
  expect([...watch.foreignOrigins]).toEqual([]);

  // The password is sent to /signin and nowhere else; the JWT never appears in a URL.
  for (const r of watch.requests) {
    if (r.body?.includes(PASSWORD)) expect(new URL(r.url).pathname).toBe('/api/v1/signin');
    expect(r.url).not.toContain(jwt);
    expect(r.url).not.toContain(PASSWORD);
  }
  // CLI tokens appear only in the two URL shapes the backend contract requires.
  for (const r of watch.requests) {
    if (r.url.includes('ctt_')) expect(new URL(r.url).pathname).toMatch(/^\/api\/v1\/(profile|validate)\/ctt_/);
  }

  // No script errors, failed hydration or CSP violations during the whole journey. The only console noise allowed is
  // Chromium's own line for the ONE deliberate wrong-password sign-in (a correct 401) in the previous test.
  const expected401 = /Failed to load resource: the server responded with a status of 401/;
  expect(watch.problems.filter((p) => !expected401.test(p))).toEqual([]);
  expect(watch.problems.filter((p) => expected401.test(p)).length).toBe(1);
});

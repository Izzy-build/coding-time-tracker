import { expect, test, type Page } from '@playwright/test';
import { API, apiGetToken, apiReport, apiSignup, PASSWORD, signUpViaUi, uniqueUser } from './helpers';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
  status,
  contentType: 'application/json',
  headers,
  body: JSON.stringify(body),
});
const envelope = (code: string, message: string) => ({ error: { code, message } });

async function fillLogin(page: Page, email: string, password: string) {
  await page.goto('/auth?mode=login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('session handling', () => {
  test('a stored session that already expired sends the user to sign-in once, with an explanation', async ({ page, request }) => {
    const u = uniqueUser('exp');
    const res = await request.post(`${API}/api/v1/signin`, { data: u });
    const body = (await res.json()) as { token: string; user: unknown };

    // Seed the stored session BEFORE any app script runs (a user whose session expired while the browser was closed).
    // Writing it from a page that is already open races with that page's own cleanup of expired sessions.
    await page.addInitScript(
      (session) => localStorage.setItem('ctt.session.v1', JSON.stringify(session)),
      { token: body.token, expiresAt: Date.now() - 60_000, user: body.user },
    );
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\?mode=login&reason=expired$/);
    await expect(page.getByText('Your session expired. Please sign in again.')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/auth\?mode=login&reason=expired$/); // no loop
    expect(await page.evaluate(() => localStorage.getItem('ctt.session.v1'))).toBeNull();
  });

  for (const [code, message, reason, text] of [
    ['TOKEN_EXPIRED', 'The provided token has expired.', 'expired', 'Your session expired. Please sign in again.'],
    ['INVALID_TOKEN', 'The provided token is invalid.', 'invalid', 'You were signed out because your session is no longer valid.'],
  ] as const) {
    test(`when the backend rejects the JWT (${code}) the user is signed out and sent to sign-in`, async ({ page }) => {
      await signUpViaUi(page, uniqueUser('jwt'));
      await page.route('**/api/v1/token/get', (route) => route.fulfill(json(401, envelope(code, message))));

      await page.getByRole('button', { name: 'Generate CLI token' }).click();
      await expect(page).toHaveURL(new RegExp(`/auth\\?mode=login&reason=${reason}$`));
      await expect(page.getByText(text)).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem('ctt.session.v1'))).toBeNull();

      await page.waitForTimeout(1500);
      await expect(page).toHaveURL(new RegExp(`/auth\\?mode=login&reason=${reason}$`)); // still there: no loop
    });
  }

  test('an expired session is also noticed while the tab stays open', async ({ page }) => {
    await signUpViaUi(page, uniqueUser('timer'));
    // Move the stored expiry a few seconds ahead: the in-page timer must sign the user out on its own.
    await page.evaluate(() => {
      const key = 'ctt.session.v1';
      const s = JSON.parse(localStorage.getItem(key) ?? '{}') as { expiresAt: number };
      s.expiresAt = Date.now() + 12_000; // 10s safety skew + ~2s
      localStorage.setItem(key, JSON.stringify(s));
    });
    await page.reload();
    await expect(page.getByTestId('welcome-username')).toBeVisible();
    await expect(page).toHaveURL(/\/auth\?mode=login&reason=expired$/, { timeout: 15_000 });
  });
});

test.describe('create-or-login behaviour of /signin is explained to the user', () => {
  test('"Sign in" with an unknown email creates an account and says so (sticky warning)', async ({ page }) => {
    const u = uniqueUser('typo');
    await fillLogin(page, u.email, PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);
    const note = page.getByRole('region', { name: 'Notifications' });
    await expect(note).toContainText('We created a new account');
    await expect(note).toContainText(u.email);
    await page.waitForTimeout(6000); // sticky: still there after the normal auto-dismiss time
    await expect(note).toContainText('We created a new account');
  });

  test('"Create account" for an email that already exists with the right password signs in and says so', async ({ page, request }) => {
    const u = uniqueUser('dupok');
    await apiSignup(request, u);
    await page.goto('/auth?mode=signup');
    await page.getByLabel('Email').fill(u.email);
    await page.getByLabel('Username').fill('someone_else_1');
    await page.getByLabel('Password', { exact: true }).fill(u.password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('region', { name: 'Notifications' })).toContainText('You already had an account');
    await expect(page.getByTestId('welcome-username')).toHaveText(u.username); // their real username, not the typed one
  });

  test('"Create account" for an existing email with a different password explains what probably happened', async ({ page, request }) => {
    const u = uniqueUser('dupbad');
    await apiSignup(request, u);
    await page.goto('/auth?mode=signup');
    await page.getByLabel('Email').fill(u.email);
    await page.getByLabel('Username').fill('another_name_2');
    await page.getByLabel('Password', { exact: true }).fill('a-completely-different-password');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'may already exist' })).toBeVisible();
    await expect(page).toHaveURL(/\/auth\?mode=signup$/);
  });

  test('a taken username is reported on the username field', async ({ page, request }) => {
    const owner = uniqueUser('owner');
    await apiSignup(request, owner);
    const u = uniqueUser('newbie');
    await page.goto('/auth?mode=signup');
    await page.getByLabel('Email').fill(u.email);
    await page.getByLabel('Username').fill(owner.username.toUpperCase()); // case-insensitive uniqueness
    await page.getByLabel('Password', { exact: true }).fill(u.password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('That username is already taken. Try a different one.')).toBeVisible();
    await expect(page.getByLabel('Username')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Username')).toBeFocused();
  });
});

test.describe('failure modes on the sign-in form show human-readable messages', () => {
  const submit = async (page: Page) => {
    await page.goto('/auth?mode=login');
    await page.getByLabel('Email').fill('someone@example.com');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
  };
  const alertWith = (page: Page, text: string) => page.getByRole('alert').filter({ hasText: text });

  test('network error', async ({ page }) => {
    await page.route('**/api/v1/signin', (route) => route.abort('connectionrefused'));
    await submit(page);
    await expect(alertWith(page, "Can't reach the server")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled(); // can retry
  });

  test('server error: generic message, no internals', async ({ page }) => {
    await page.route('**/api/v1/signin', (route) =>
      route.fulfill({ status: 500, contentType: 'text/html', body: '<pre>Error: ECONNREFUSED at /srv/app/db.js:42\n SELECT * FROM users</pre>' }),
    );
    await submit(page);
    await expect(alertWith(page, 'Something went wrong on our side')).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain('ECONNREFUSED');
    expect(html).not.toContain('SELECT');
  });

  test('backend 500 envelope', async ({ page }) => {
    await page.route('**/api/v1/signin', (route) => route.fulfill(json(500, envelope('INTERNAL_ERROR', 'An unexpected error occurred.'))));
    await submit(page);
    await expect(alertWith(page, 'Something went wrong on our side')).toBeVisible();
  });

  test('rate limit (429) mentions how long to wait', async ({ page }) => {
    await page.route('**/api/v1/signin', (route) =>
      route.fulfill(json(429, envelope('RATE_LIMITED', 'Too many requests. Please slow down.'), { 'retry-after': '30' })),
    );
    await submit(page);
    await expect(alertWith(page, 'wait about 30 seconds')).toBeVisible();
  });

  test('unexpected response shape is reported, not crashed on', async ({ page }) => {
    await page.route('**/api/v1/signin', (route) => route.fulfill(json(200, { hello: 'world' })));
    await submit(page);
    await expect(alertWith(page, 'unexpected response')).toBeVisible();
  });

  test('server-side validation errors mark the fields', async ({ page }) => {
    await page.route('**/api/v1/signin', (route) =>
      route.fulfill(
        json(400, { error: { code: 'VALIDATION_ERROR', message: 'The request is invalid.', details: [{ in: 'body', path: 'email', message: 'Invalid email address' }] } }),
      ),
    );
    await submit(page);
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Please check this field.')).toBeVisible();
    expect(await page.content()).not.toContain('Invalid email address'); // raw validator wording is not shown
  });

  test('the submit button is disabled and shows progress while the request is running', async ({ page }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/v1/signin', async (route) => {
      await gate;
      await route.fulfill(json(401, envelope('INVALID_CREDENTIALS', 'Incorrect email or password.')));
    });
    await submit(page);
    const button = page.getByRole('button', { name: 'Signing in…' });
    await expect(button).toBeDisabled();
    await expect(page.getByLabel('Email')).toBeDisabled();
    release();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });
});

test.describe('dashboard token states', () => {
  test('a failed token request shows an error and can be retried', async ({ page }) => {
    await signUpViaUi(page, uniqueUser('tokerr'));
    let calls = 0;
    await page.route('**/api/v1/token/get', (route) => {
      calls += 1;
      return calls === 1
        ? route.fulfill(json(500, envelope('INTERNAL_ERROR', 'An unexpected error occurred.')))
        : route.continue();
    });
    await page.getByRole('button', { name: 'Generate CLI token' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Something went wrong on our side' })).toBeVisible();
    await page.getByRole('button', { name: 'Generate CLI token' }).click();
    await expect(page.getByTestId('cli-token')).toHaveText(/^ctt_[A-Za-z0-9]{21}$/);
  });

  test('a failed rotation keeps the dialog open with the error and keeps the old token', async ({ page, request }) => {
    await signUpViaUi(page, uniqueUser('rotfail'));
    await page.getByRole('button', { name: 'Generate CLI token' }).click();
    const token = ((await page.getByTestId('cli-token').textContent()) ?? '').trim();
    await page.route('**/api/v1/token/update', (route) => route.fulfill(json(500, envelope('INTERNAL_ERROR', 'x'))));

    await page.getByRole('button', { name: 'Update token' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Update token' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Something went wrong on our side');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('cli-token')).toHaveText(token); // unchanged
    expect((await request.get(`${API}/api/v1/validate/${token}`)).status()).toBe(200);
  });

  test('if the stored token was rotated elsewhere, the dashboard says so and falls back to the leaderboard', async ({ page, request }) => {
    const u = uniqueUser('stale');
    await signUpViaUi(page, u);
    await page.getByRole('button', { name: 'Generate CLI token' }).click();
    const token = ((await page.getByTestId('cli-token').textContent()) ?? '').trim();
    await apiReport(request, token, 600);

    // Rotate through the API (as if from another device); this tab still holds the now-dead token.
    const jwt = await page.evaluate(() => (JSON.parse(localStorage.getItem('ctt.session.v1') ?? '{}') as { token: string }).token);
    const rotated = await request.get(`${API}/api/v1/token/update`, { headers: { authorization: `Bearer ${jwt}` } });
    expect(rotated.status()).toBe(200);

    await page.reload();
    await expect(page.getByText('Your CLI token is no longer active')).toBeVisible();
    await expect(page.getByTestId('total-formatted')).toHaveText('10m'); // still correct via the leaderboard
    await expect(page.getByTestId('cli-token')).toHaveCount(0);
    await expect(page.getByText('You already have a CLI token').or(page.getByRole('button', { name: 'Generate CLI token' }))).toBeVisible();
  });
});

test.describe('leaderboard states', () => {
  test('empty state', async ({ page }) => {
    await page.route('**/api/v1/leaderboard*', (route) =>
      route.fulfill(json(200, { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } })),
    );
    await page.goto('/leaderboard');
    await expect(page.getByText('Nobody is on the board yet')).toBeVisible();
    await expect(page.getByTestId('leaderboard-row')).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('link', { name: 'Create an account' })).toBeVisible();
  });

  test('error state recovers with "Try again"', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/v1/leaderboard*', (route) => {
      calls += 1;
      return calls === 1 ? route.abort('connectionrefused') : route.continue();
    });
    await page.goto('/leaderboard');
    const alert = page.getByRole('alert').filter({ hasText: 'Couldn’t load the leaderboard' });
    await expect(alert).toContainText("Can't reach the server");
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(alert).toBeHidden();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('pagination follows the backend pages (seeded with real users)', async ({ page, request }) => {
    const total = ((await (await request.get(`${API}/api/v1/leaderboard?pageSize=1`)).json()) as { pagination: { total: number } }).pagination.total;
    for (let i = total; i < 22; i++) {
      const u = uniqueUser('seed');
      const jwt = await apiSignup(request, u);
      await apiReport(request, await apiGetToken(request, jwt), 60 + i);
    }

    await page.goto('/leaderboard');
    await expect(page.getByTestId('leaderboard-row')).toHaveCount(20);
    await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
    // ordered by time, descending, ranks non-decreasing
    const seconds = await page.getByTestId('leaderboard-row').evaluateAll((rows) =>
      rows.map((r) => Number((r.querySelectorAll('td')[3]?.textContent ?? '0').replace(/,/g, ''))),
    );
    expect([...seconds].sort((a, b) => b - a)).toEqual(seconds);

    await page.getByRole('link', { name: 'Next' }).click();
    await expect(page).toHaveURL(/\/leaderboard\?page=2$/);
    await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
    expect(await page.getByTestId('leaderboard-row').count()).toBeGreaterThan(0);
    await page.getByRole('link', { name: 'Previous' }).click();
    await expect(page).toHaveURL(/\/leaderboard$/);

    await page.goto('/leaderboard?page=99999');
    await expect(page.getByText('That page doesn’t exist')).toBeVisible();
    await page.goto('/leaderboard?page=abc'); // junk falls back to page 1
    await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
  });
});

test('every page has one h1, a main landmark and a skip link', async ({ page }) => {
  for (const path of ['/', '/auth?mode=login', '/auth?mode=signup', '/leaderboard']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  }
});

import { expect, test, type Page } from '@playwright/test';
import { apiReport, signUpViaUi, uniqueUser } from './helpers';

const SIZES = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1920, height: 1080 },
] as const;

const SHOTS = process.env.E2E_SHOTS_DIR ?? 'test-results/screens';

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${label}: page is ${scrollWidth}px wide in a ${innerWidth}px viewport`).toBeLessThanOrEqual(innerWidth + 1);
}

async function snap(page: Page, size: string, name: string) {
  await page.screenshot({ path: `${SHOTS}/${size}-${name}.png`, fullPage: true });
}

test('public pages fit every viewport without horizontal scrolling', async ({ page }) => {
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const [name, path] of [
      ['landing', '/'],
      ['auth-login', '/auth?mode=login'],
      ['auth-signup', '/auth?mode=signup'],
      ['leaderboard', '/leaderboard'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page, `${name} @ ${size.name}`);
      await snap(page, size.name, name);
    }
  }
});

test('signed-in pages and the confirm dialog fit every viewport', async ({ page, request }) => {
  const user = uniqueUser('resp');
  await signUpViaUi(page, user);
  await page.getByRole('button', { name: 'Generate CLI token' }).click();
  const token = ((await page.getByTestId('cli-token').textContent()) ?? '').trim();
  await apiReport(request, token, 3600); // the backend caps one report at 3600 s
  await apiReport(request, token, 1100); // total 4700 s = 1h 18m

  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });

    await page.goto('/dashboard');
    await expect(page.getByTestId('welcome-username')).toBeVisible();
    await expect(page.getByTestId('total-formatted')).toHaveText('1h 18m'); // from the leaderboard (token is per-tab)
    await expectNoHorizontalOverflow(page, `dashboard @ ${size.name}`);
    await snap(page, size.name, 'dashboard');

    await page.goto('/profile');
    await expect(page.getByTestId('profile-username')).toHaveText(user.username);
    await expectNoHorizontalOverflow(page, `profile @ ${size.name}`);
    await snap(page, size.name, 'profile');

    await page.goto('/leaderboard');
    await expect(page.getByTestId('leaderboard-row').filter({ hasText: user.username })).toContainText('You');
    await expectNoHorizontalOverflow(page, `leaderboard (signed in) @ ${size.name}`);
    await snap(page, size.name, 'leaderboard-signed-in');
  }

  // The confirm dialog on the smallest screen.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Update token' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 375).toBe(true);
  await snap(page, 'phone', 'confirm-dialog');
});

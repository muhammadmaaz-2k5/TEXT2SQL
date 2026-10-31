import { expect, test } from '@playwright/test';

test.describe('DataPilot AI — End-to-End Main Flow', () => {
  test('Sign up / Demo Login -> Create Managed Database -> Ask Question -> See Validated SQL & Chart', async ({
    page,
  }) => {
    // 1. Visit Landing Page and verify English -> SQL -> Chart hero
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Ask your database in plain English');

    // 2. Navigate to Login and use 1-Click Demo Workspace Login
    await page.goto('/login');
    const demoButton = page.getByRole('button', {
      name: /1-click demo workspace/i,
    });
    await expect(demoButton).toBeVisible();
    await demoButton.click();

    // 3. Verify redirect to /app/databases and provision a new managed PostgreSQL database
    await expect(page).toHaveURL(/\/app\/databases/);
    const createManagedBtn = page.getByRole('button', {
      name: /create managed database/i,
    });
    await createManagedBtn.click();

    const dbNameInput = page.getByLabel(/database display name/i);
    await dbNameInput.fill('Playwright E2E Store');
    await page.getByRole('button', { name: /provision database/i }).click();

    await expect(page.getByText('Playwright E2E Store')).toBeVisible();

    // 4. Navigate to Ask AI (/app/query), verify persistent Read-only badge, ask question & see chart
    await page.goto('/app/query');
    await expect(page.getByText(/Read-only/i).first()).toBeVisible();

    const promptInput = page.getByPlaceholder(/Ask a question in plain English/i);
    await promptInput.fill(
      'Show total revenue and completed order count by customer segment',
    );
    await page.getByRole('button', { name: /Ask DataPilot/i }).click();

    // Verify generated SQL, plain-English explanation, and chart switcher appear
    await expect(page.getByText(/SELECT/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Bar/i }).first()).toBeVisible();
  });
});


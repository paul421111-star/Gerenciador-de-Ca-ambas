import { test, expect, type Page } from '@playwright/test';
async function login(page: Page) { await page.goto('/login'); await page.getByLabel('E-mail', { exact: true }).fill('e2e@example.test'); await page.getByLabel('Senha', { exact: true }).fill(process.env.JR_E2E_PASSWORD!); await page.getByRole('button', { name: 'Entrar no sistema' }).click(); await expect(page).toHaveURL(/\/painel$/); await expect(page.getByRole('heading', { name: /Olá/ })).toBeVisible(); }
test('anonymous users are redirected to login', async ({ page }) => { await page.goto('/painel'); await expect(page).toHaveURL(/\/login$/); await expect(page.getByRole('button', { name: 'Entrar no sistema' })).toBeVisible(); });
test('operational inventory starts with exactly 70 unverified containers and 2 trucks', async ({ page }) => { await login(page); const response = await page.request.get('/api/snapshot'); expect(response.ok()).toBeTruthy(); const state = await response.json(); expect(state.containers).toHaveLength(70); expect(state.trucks).toHaveLength(2); expect(state.containers.every((c: {
    status: string;
}) => c.status === 'INVENTORY')).toBeTruthy(); expect(state.rentals).toHaveLength(0); await expect(page.getByText('Finalize a implantação.', { exact: true })).toBeVisible(); });
test('customer form persists data and survives a reload', async ({ page }) => { await login(page); await page.goto('/clientes'); await page.getByRole('button', { name: 'Novo cliente' }).click(); const dialog = page.getByRole('dialog'); await dialog.getByLabel('Nome / razão social').fill('Cliente teste interface'); await dialog.getByLabel('Responsável pela contratação').fill('Contato teste'); await dialog.getByLabel('Telefone com DDD').fill('11900000000'); await dialog.getByRole('button', { name: 'Salvar registro' }).click(); await expect(dialog).not.toBeVisible(); await page.reload(); await expect(page.getByRole('cell', { name: /Cliente teste interface/ })).toBeVisible(); });
test('mobile navigation opens and has no page-wide overflow', async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); await login(page); await page.getByRole('button', { name: 'Abrir menu' }).click(); await page.getByRole('link', { name: /Controle de caçambas/ }).click(); await expect(page.getByRole('heading', { level: 1 })).toContainText(/caçambas/i); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy(); });
test('logout invalidates the server session', async ({ page }) => { await login(page); await page.getByRole('button', { name: 'Sair do sistema' }).click(); await expect(page).toHaveURL(/\/login$/); expect((await page.request.get('/api/snapshot')).status()).toBe(401); });
test('health and ready stay up on the isolated test database', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBeTruthy();
    expect((await health.json()).status).toBe('ok');
    const ready = await request.get('/api/ready');
    expect(ready.ok()).toBeTruthy();
    expect((await ready.json()).status).toBe('ready');
});
test('unauthenticated errors keep a compatible contract and snapshot stays lean', async ({ page }) => {
    const denied = await page.request.get('/api/snapshot');
    expect(denied.status()).toBe(401);
    const body = await denied.json();
    expect(typeof body.error).toBe('string');
    expect(body.code).toBe('UNAUTHENTICATED');
    expect(body).toHaveProperty('fieldErrors');
    await login(page);
    const snapshot = await page.request.get('/api/snapshot');
    expect(snapshot.ok()).toBeTruthy();
    const state = await snapshot.json();
    expect(JSON.stringify(state)).not.toContain('data:image');
    expect(state.rentals).toHaveLength(0);
    await page.goto('/locacoes');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

import { expect, test, type Browser, type Page } from "@playwright/test";

const loginButton = /立即登录|Log in/i;
const conversationsTitle = /会话|Conversations/i;

async function loginAs(browser: Browser, userId: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/#/login");
  await page.getByPlaceholder(/请输入用户 ID|Enter user ID/i).fill(userId);
  await page.getByRole("button", { name: loginButton }).click();
  await expect(page).toHaveURL(/#\/conversations/, { timeout: 60_000 });
  await expect(page.getByText(conversationsTitle).first()).toBeVisible();
  return page;
}

async function openPeerConversation(page: Page, peerUserId: string): Promise<void> {
  await page.getByLabel("新建会话").click();
  const dialog = page.getByRole("dialog").last();
  await dialog.getByRole("textbox").fill(peerUserId);
  await dialog.getByRole("button", { name: /^打开$/ }).click();
  await expect(page).toHaveURL(/#\/chat/, { timeout: 30_000 });
  await expect(page.locator(".composer-input textarea")).toBeVisible();
}

async function sendText(page: Page, text: string): Promise<void> {
  await page.locator(".composer-input textarea").fill(text);
  await page.getByRole("button", { name: /^发送$|^Send$/i }).click();
  await expect(page.locator(".message-row").filter({ hasText: text }).last()).toBeVisible({ timeout: 30_000 });
}

test.describe("Flare Core web startup", () => {
  test("cold start on a fresh device pulls existing conversations and first-page messages", async ({ browser }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const alice = `pw-cold-a-${suffix}`;
    const bob = `pw-cold-b-${suffix}`;
    const seeded = Array.from({ length: 3 }, (_, i) => `cold-seed-${i} ${suffix}`);

    // 设备 1：建会话 + 发消息（写入服务端）
    const firstPage = await loginAs(browser, alice);
    await openPeerConversation(firstPage, bob);
    for (const text of seeded) {
      await sendText(firstPage, text);
    }
    await firstPage.context().close();

    // 设备 2（全新 context = 空本地库）：登录 → 冷启 bundle 应当带回会话与首页消息
    const coldStartedAt = Date.now();
    const secondPage = await loginAs(browser, alice);
    await expect(
      secondPage.locator(".im-conv-item").filter({ hasText: bob }).first(),
    ).toBeVisible({ timeout: 30_000 });
    console.info(`[cold-start] login->list ${Date.now() - coldStartedAt}ms`);
    await secondPage.locator(".im-conv-item").filter({ hasText: bob }).first().click();
    await expect(secondPage).toHaveURL(/#\/chat/, { timeout: 15_000 });
    for (const text of seeded) {
      await expect(secondPage.getByText(text).first()).toBeVisible({ timeout: 30_000 });
    }
    await secondPage.context().close();
  });

  test("hot start resumes saved session from local data and messaging keeps working", async ({ browser }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const alice = `pw-hot-a-${suffix}`;
    const bob = `pw-hot-b-${suffix}`;
    const seedText = `seed ${suffix}`;
    const afterResumeText = `after-resume ${suffix}`;

    const alicePage = await loginAs(browser, alice);
    const bobPage = await loginAs(browser, bob);
    await openPeerConversation(alicePage, bob);
    await sendText(alicePage, seedText);
    await expect(bobPage.getByText(seedText).first()).toBeVisible({ timeout: 45_000 });

    // 热启动：reload 后不出现登录页，本地数据直出会话列表
    const reloadStartedAt = Date.now();
    await alicePage.reload();
    await expect(alicePage).toHaveURL(/#\/(conversations|chat)/, { timeout: 20_000 });
    await expect(alicePage.getByRole("button", { name: loginButton })).toHaveCount(0);
    await expect(alicePage.locator(".im-conv-item").filter({ hasText: bob }).first()).toBeVisible({
      timeout: 15_000,
    });
    const hotStartMs = Date.now() - reloadStartedAt;
    console.info(`[hot-start] conversations visible ${hotStartMs}ms after reload`);
    // 会话列表本地直出应远快于全量登录同步；给 wasm 冷加载留裕量
    expect(hotStartMs).toBeLessThan(10_000);

    // 列表预览来自本地库（未等服务端同步）
    await expect(
      alicePage.locator(".im-conv-item").filter({ hasText: bob }).first(),
    ).toContainText(seedText, { timeout: 15_000 });

    // 后台 connect 完成后消息收发照常：双向互发
    await alicePage.locator(".im-conv-item").filter({ hasText: bob }).first().click();
    await expect(alicePage).toHaveURL(/#\/chat/, { timeout: 15_000 });
    await sendText(alicePage, afterResumeText);
    await expect(bobPage.getByText(afterResumeText).first()).toBeVisible({ timeout: 45_000 });

    const bobReply = `bob-reply ${suffix}`;
    await bobPage.getByText(afterResumeText).first().click();
    await expect(bobPage).toHaveURL(/#\/chat/, { timeout: 15_000 });
    await sendText(bobPage, bobReply);
    await expect(alicePage.getByText(bobReply).first()).toBeVisible({ timeout: 45_000 });

    // 登出清除会话档案：再次 reload 应回到登录页
    await alicePage.getByLabel("更多会话操作").click();
    await alicePage.getByText(/退出登录/).first().click();
    await expect(alicePage).toHaveURL(/#\/login/, { timeout: 20_000 });
    await alicePage.reload();
    await expect(alicePage.getByRole("button", { name: loginButton })).toBeVisible({ timeout: 20_000 });
  });
});

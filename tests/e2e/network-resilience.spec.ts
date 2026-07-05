import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const loginButton = /立即登录|Log in/i;

async function loginAs(browser: Browser, userId: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/#/login");
  await page.getByPlaceholder(/请输入用户 ID|Enter user ID/i).fill(userId);
  await page.getByRole("button", { name: loginButton }).click();
  await expect(page).toHaveURL(/#\/conversations/, { timeout: 60_000 });
  return { context, page };
}

async function openPeerConversation(page: Page, peerUserId: string): Promise<void> {
  await page.getByLabel("新建会话").click();
  const dialog = page.getByRole("dialog").last();
  await dialog.getByRole("textbox").fill(peerUserId);
  await dialog.getByRole("button", { name: /^打开$/ }).click();
  await expect(page).toHaveURL(/#\/chat/, { timeout: 30_000 });
  await expect(page.locator(".composer-input textarea")).toBeVisible();
}

async function typeAndSend(page: Page, text: string): Promise<void> {
  await page.locator(".composer-input textarea").fill(text);
  await page.getByRole("button", { name: /^发送$|^Send$/i }).click();
}

function messageRow(page: Page, text: string) {
  return page.locator(".message-row").filter({ hasText: text }).last();
}

test.describe("Flare Core web network resilience", () => {
  test("offline send recovers after reconnect and messages flow both ways with zero loss", async ({ browser }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const alice = `pw-net-a-${suffix}`;
    const bob = `pw-net-b-${suffix}`;
    const seedText = `seed ${suffix}`;
    const offlineText = `offline-send ${suffix}`;
    const bobWhileOffline = `bob-during-outage ${suffix}`;
    const afterRecoveryText = `after-recovery ${suffix}`;

    const a = await loginAs(browser, alice);
    const b = await loginAs(browser, bob);
    await openPeerConversation(a.page, bob);
    await typeAndSend(a.page, seedText);
    await expect(b.page.getByText(seedText).first()).toBeVisible({ timeout: 45_000 });
    await b.page.getByText(seedText).first().click();
    await expect(b.page).toHaveURL(/#\/chat/, { timeout: 15_000 });

    // —— 断网：alice 掉线 ——
    await a.context.setOffline(true);
    // 断网期间 alice 发消息：本地立即出现（乐观 UI），最终进入失败/待发态
    await typeAndSend(a.page, offlineText);
    await expect(messageRow(a.page, offlineText)).toBeVisible({ timeout: 10_000 });
    // 断网期间 bob 正常发消息
    await typeAndSend(b.page, bobWhileOffline);
    await expect(messageRow(b.page, bobWhileOffline)).toBeVisible({ timeout: 30_000 });

    // 给足时间让 ws 真正断开、消息进入失败态
    await a.page.waitForTimeout(4_000);

    // —— 恢复网络：online 事件 → notifyNetworkChange → core 主动重连 ——
    await a.context.setOffline(false);

    // 重连后 catch-up：bob 断网期间发的消息必须到达 alice（0 丢失·下行）
    await expect(a.page.getByText(bobWhileOffline).first()).toBeVisible({ timeout: 60_000 });

    // 上行 0 丢失：离线消息由 pending 队列在重连后自动补投（实测行为）；
    // 若核心将其判为失败，则走"重新发送"菜单兜底
    await expect(async () => {
      const delivered = await b.page.getByText(offlineText).first().isVisible();
      if (delivered) return;
      const row = messageRow(a.page, offlineText);
      await row.hover();
      const menuButton = row.getByLabel(/消息操作|Message actions|更多|More/i).last();
      if (await menuButton.isVisible().catch(() => false)) {
        await menuButton.click();
        const resend = a.page.locator(".n-dropdown-option").filter({ hasText: /重新发送|Resend/i }).last();
        if (await resend.isVisible().catch(() => false)) {
          await resend.click();
        } else {
          await a.page.keyboard.press("Escape");
        }
      }
      expect(delivered).toBe(true);
    }).toPass({ timeout: 60_000, intervals: [3_000] });

    // 重连后的正常收发仍然顺畅
    await typeAndSend(a.page, afterRecoveryText);
    await expect(b.page.getByText(afterRecoveryText).first()).toBeVisible({ timeout: 45_000 });
  });
});

import { expect, test, type Browser, type Page } from "@playwright/test";

const loginButton = /立即登录|Log in/i;
const conversationsTitle = /会话|Conversations/i;
const readyState = /ready|connected/i;

async function loginAs(browser: Browser, userId: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/#/login");
  await page.getByPlaceholder(/请输入用户 ID|Enter user ID/i).fill(userId);
  await page.getByRole("button", { name: loginButton }).click();
  await expect(page).toHaveURL(/#\/conversations/, { timeout: 60_000 });
  await expect(page.getByText(conversationsTitle).first()).toBeVisible();
  await expect(page.getByText(readyState).first()).toBeVisible({ timeout: 30_000 });
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
  await expect(messageRow(page, text)).toBeVisible({ timeout: 30_000 });
  await expectMessageListAtBottom(page);
}

function messageRow(page: Page, text: string) {
  return page.locator(".message-row").filter({ hasText: text }).last();
}

function conversationRow(page: Page, title: string) {
  return page.locator(".im-conv-item").filter({ hasText: title }).first();
}

function firstMessageRow(page: Page, text: string) {
  return page.locator(".message-row--self").filter({ hasText: text }).first();
}

async function expectMessageListAtBottom(page: Page): Promise<void> {
  const list = page.locator(".message-list").last();
  await expect(list).toBeVisible();
  await expect.poll(
    async () =>
      list.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight <= 8),
    { timeout: 10_000 },
  ).toBe(true);
}

async function openMessageMenu(page: Page, text: string): Promise<void> {
  const row = messageRow(page, text);
  await expect(row).toBeVisible();
  await row.hover();
  const menuButton = row.getByLabel(/消息操作|Message actions|更多|More/i).last();
  await expect(menuButton).toBeVisible();
  await menuButton.click();
}

async function openFirstMessageMenu(page: Page, text: string): Promise<void> {
  const row = firstMessageRow(page, text);
  await expect(row).toBeVisible();
  await row.hover();
  const menuButton = row.getByLabel(/消息操作|Message actions|更多|More/i).last();
  await expect(menuButton).toBeVisible();
  await menuButton.click();
}

async function chooseMessageAction(page: Page, action: RegExp): Promise<void> {
  await page.locator(".n-dropdown-option").filter({ hasText: action }).last().click();
}

test.describe("Flare Core web messaging business flows", () => {
  test("covers dual-user send, unread/read, reaction, reply, copy, edit, delete, recall, pin, and refresh", async ({ browser }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const alice = `pw-alice-${suffix}`;
    const bob = `pw-bob-${suffix}`;
    const firstText = `hello bob ${suffix}`;
    const secondText = `second line ${suffix}`;
    const replyText = `reply ${suffix}`;
    const editedText = `edited ${suffix}`;

    const alicePage = await loginAs(browser, alice);
    const bobPage = await loginAs(browser, bob);

    await openPeerConversation(alicePage, bob);
    await sendText(alicePage, firstText);
    await sendText(alicePage, secondText);
    await expect(conversationRow(alicePage, bob)).toContainText(secondText, { timeout: 30_000 });

    await expect(bobPage.getByText(secondText).first()).toBeVisible({ timeout: 45_000 });
    await expect(conversationRow(bobPage, alice)).toContainText(secondText, { timeout: 45_000 });
    await expect(bobPage.getByText(/1 未读|2 未读|unread/i).first()).toBeVisible();

    await bobPage.getByText(secondText).first().click();
    await expect(bobPage).toHaveURL(/#\/chat/);
    await expect(messageRow(bobPage, firstText)).toBeVisible();
    await expect(messageRow(bobPage, secondText)).toBeVisible();
    await expectMessageListAtBottom(bobPage);

    const bobFirstMessage = messageRow(bobPage, firstText);
    await bobFirstMessage.hover();
    await bobFirstMessage.getByLabel(/表情回应|React/i).click();
    await bobPage.locator(".n-dropdown-option").filter({ hasText: /👍|赞|Like/i }).first().click();
    await expect(bobFirstMessage.locator(".message-reactions")).toBeVisible({ timeout: 20_000 });
    await bobPage.waitForTimeout(1_000);

    await bobFirstMessage.hover();
    await bobFirstMessage.getByLabel(/^回复$|^Reply$/i).click();
    await expect(bobPage.locator(".composer-reply-strip")).toContainText(firstText);
    await sendText(bobPage, replyText);
    await expect(alicePage.getByText(replyText).first()).toBeVisible({ timeout: 45_000 });

    await openMessageMenu(alicePage, secondText);
    await chooseMessageAction(alicePage, /复制|Copy/i);

    await openMessageMenu(alicePage, secondText);
    await chooseMessageAction(alicePage, /编辑|Edit/i);
    await expect(alicePage.getByText(/编辑消息|Editing message/i).first()).toBeVisible();
    await alicePage.locator(".composer-input textarea").fill(editedText);
    await alicePage.getByRole("button", { name: /保存编辑|Save edit/i }).click();
    await expect(messageRow(alicePage, editedText)).toBeVisible({ timeout: 30_000 });
    await expect(alicePage.getByText(/已编辑|Edited/i).first()).toBeVisible();
    await expect(bobPage.getByText(editedText).first()).toBeVisible({ timeout: 45_000 });

    await openMessageMenu(alicePage, editedText);
    await chooseMessageAction(alicePage, /置顶消息|Pin message/i);
    await alicePage.locator(".chat-content-tab").filter({ hasText: /Pin/i }).click();
    await expect(alicePage.locator(".pinned-panel")).toContainText(editedText, { timeout: 30_000 });
    await alicePage.locator(".chat-content-tab").filter({ hasText: /消息|Messages/i }).click();

    await openMessageMenu(alicePage, editedText);
    await chooseMessageAction(alicePage, /删除|Delete/i);
    await expect(messageRow(alicePage, editedText)).toHaveCount(0, { timeout: 30_000 });

    await openFirstMessageMenu(alicePage, firstText);
    await chooseMessageAction(alicePage, /撤回|Recall/i);
    await expect(alicePage.getByText(/撤回了一条消息|Message recalled|recalled/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(bobPage.getByText(/撤回了一条消息|Message recalled|recalled/i).first()).toBeVisible({ timeout: 45_000 });

    await alicePage.reload();
    if (await alicePage.getByRole("button", { name: loginButton }).isVisible({ timeout: 5_000 }).catch(() => false)) {
      await alicePage.getByPlaceholder(/请输入用户 ID|Enter user ID/i).fill(alice);
      await alicePage.getByRole("button", { name: loginButton }).click();
      await expect(alicePage).toHaveURL(/#\/conversations/, { timeout: 60_000 });
      await openPeerConversation(alicePage, bob);
    }
    await expect(alicePage.getByText(replyText).or(alicePage.getByText(/撤回了一条消息|recalled/i)).first()).toBeVisible({
      timeout: 45_000,
    });
  });
});

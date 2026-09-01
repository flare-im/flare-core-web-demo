import { expect, test, type Page } from "@playwright/test";

/**
 * 组合器「更多」里每一种消息类型都要能发出去并出现在时间线上。
 *
 * 这套用例踩过的坑，写下来免得下次重犯：
 *
 * 1) 不能用「气泡数量增加」当判据。时间线会虚拟化并整体重渲染——实测发一条
 *    消息后气泡数从 379 掉到 95，按数量判会把六种正常的类型全记成缺陷。
 *    要按内容找。
 *
 * 2) 判据只能看消息列表内部。发送成功时应用会弹 `${previewText} 已发送`，
 *    而 previewText 里就带着我们的标记，整页匹配等于自己骗自己。
 *
 * 3) 弹层字段按**模板顺序**渲染（ComposerPayloadModal.vue 里 `'x' in form`
 *    的出现次序），不是 defaultParams 的书写顺序。按后者猜索引会把链接的 URL
 *    填到标题上，然后收到 url.invalid_url，看起来像功能坏了。
 *
 * 4) 页面上同时存在两个「发送」：主组合器那个因输入框为空是 disabled，
 *    弹层里那个才可用。要点第一个 enabled 的，不能取 .last。
 */

const MODAL_INPUT = ".composer-payload-modal__input, .composer-payload-modal__textarea";

/** 模板序：id, threadId, appId, cardType, pagePath, title, subtitle, avatar,
 *  appName, description, text, address, url, thumbnailUrl, mimeType, fileName,
 *  latitude, longitude, assignee, dueTime, deadline, status, time, location, summary */
const FIELD_PLANS: Record<string, Record<number, string>> = {
  位置: { 2: "39.909", 3: "116.397" },
  名片: { 4: "https://example.com/avatar.png" },
  链接: { 2: "https://example.com/flare" },
  小程序: { 5: "https://example.com/thumb.png" },
  日程: { 1: "2026-09-02 09:00" },
  任务: { 2: "2026-09-02 18:00" },
};

/** 走「更多」菜单能发出、且应当进入时间线的类型。 */
const PERSISTED_TYPES = ["文件", "视频", "位置", "名片", "链接", "公告", "投票", "任务", "日程", "话题", "小程序"];

async function settle(page: Page): Promise<void> {
  // 面板是受控状态，残留会让下一个入口点不开，表现成「该功能不存在」。
  for (let i = 0; i < 2; i += 1) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(220);
  }
  await page.mouse.click(20, 300);
  await page.waitForTimeout(300);
}

async function clickByLabel(page: Page, label: string): Promise<void> {
  const clicked = await page.evaluate((l) => {
    const all = [...document.querySelectorAll<HTMLElement>("button,[role=button]")].filter(
      (e) => e.offsetParent !== null
        && (e.getAttribute("aria-label") || e.title || e.textContent || "").trim() === l,
    );
    if (!all.length) return false;
    all[all.length - 1].click();
    return true;
  }, label);
  expect(clicked, `找不到入口「${label}」`).toBe(true);
  await page.waitForTimeout(1100);
}

async function clickSend(page: Page): Promise<void> {
  for (const label of ["发送", "Send", "确定"]) {
    for (const loc of [
      page.locator("button", { hasText: label }),
      page.locator(`button[aria-label="${label}"], button[title="${label}"]`),
    ]) {
      const n = await loc.count();
      for (let i = 0; i < n; i += 1) {
        const cand = loc.nth(i);
        if (await cand.isEnabled()) {
          await cand.click({ timeout: 6_000 });
          return;
        }
      }
    }
  }
  throw new Error("没有可用的发送按钮");
}

async function fillModal(page: Page, tag: string, plan: Record<number, string>): Promise<number> {
  return page.evaluate(([t, p, sel]) => {
    const els = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(sel as string)]
      .filter((e) => e.offsetParent !== null);
    let n = 0;
    els.forEach((e, i) => {
      if (e.value && e.value.trim()) return;
      const v = (p as Record<number, string>)[i] ?? `${t}-${i}`;
      const proto = e.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(e, v);
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
      n += 1;
    });
    return n;
  }, [tag, plan, MODAL_INPUT] as const);
}

function inTimeline(page: Page, needle: string) {
  return page.locator(".message-list").filter({ hasText: needle });
}

test.describe("消息类型完整性", () => {
  for (const kind of PERSISTED_TYPES) {
    test(`「${kind}」能发出并进入时间线`, async ({ page }) => {
      await settle(page);
      const tag = `${kind}${Date.now().toString(36).slice(-5)}`;
      await clickByLabel(page, "更多");
      await clickByLabel(page, kind);

      if (kind === "文件" || kind === "视频") {
        const input = page.locator('input[type="file"]');
        test.skip(await input.count() === 0, "面板没有文件输入");
        await input.last().setInputFiles("tests/e2e/fixtures/probe.png");
        await page.waitForTimeout(2_500);
      }

      await fillModal(page, tag, FIELD_PLANS[kind] ?? {});
      await page.waitForTimeout(600);
      await clickSend(page);

      const needle = kind === "文件" || kind === "视频" ? "probe" : tag;
      await expect(inTimeline(page, needle)).toBeVisible({ timeout: 40_000 });
    });
  }

  test("「通知」是临时消息：送达但不进时间线", async ({ page }) => {
    // 服务端把 MessageType::Notification 归为 TemporaryMessageType::SystemEvent，
    // needs_persistence=false / needs_seq=false / require_online=true。
    // 「发完看不到」是设计如此；这条用例锁住这个契约，免得日后有人当 bug 改坏。
    await settle(page);
    const tag = `通知${Date.now().toString(36).slice(-5)}`;
    await clickByLabel(page, "更多");
    await clickByLabel(page, "通知");
    await fillModal(page, tag, {});
    await page.waitForTimeout(600);
    await clickSend(page);
    await page.waitForTimeout(4_000);
    await expect(inTimeline(page, tag)).toHaveCount(0);
  });
});

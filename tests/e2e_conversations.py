from playwright.sync_api import expect, sync_playwright


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 430, "height": 820})
    page.goto("http://127.0.0.1:5173")
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_load_state("networkidle")

    page.locator(".drawer-toggle").click()
    expect(page.locator(".new-conversation-button")).to_be_visible()
    expect(page.locator(".conversation-drawer")).to_contain_text("aep")

    page.locator(".new-conversation-button").click()
    expect(page.locator(".new-conversation-dialog")).to_be_visible()
    expect(page.locator(".markdown-options button").first).to_be_visible()
    page.locator(".markdown-options button").nth(1).click()
    expect(page.locator(".markdown-chip")).to_contain_text("preview.md")
    page.locator(".new-conversation-dialog .primary").click()
    expect(page.locator(".conversation-drawer .conversation-item.active")).to_be_visible()
    expect(page.locator(".markdown-chip")).to_contain_text("preview.md")

    page.locator(".codex-composer textarea").fill("绘制圆形动画")
    send = page.locator(".codex-composer .send")
    expect(send).to_be_enabled()
    send.click()
    expect(page.locator(".conversation-item.active")).to_contain_text("绘制圆形动画")

    page.locator(".new-conversation-button").click()
    page.locator(".markdown-options button").first.click()
    page.locator(".new-conversation-dialog .primary").click()
    page.locator(".codex-composer textarea").fill("第二个话题")
    send = page.locator(".codex-composer .send")
    expect(send).to_be_enabled()
    send.click()
    expect(page.locator(".conversation-item.active")).to_contain_text("第二个话题")
    expect(page.locator(".markdown-chip")).to_have_count(0)

    page.locator(".conversation-search input").fill("圆形")
    expect(page.locator(".conversation-item")).to_have_count(1)
    expect(page.locator(".conversation-item")).to_contain_text("绘制圆形动画")
    page.locator(".conversation-search input").fill("")

    first = page.locator(".conversation-item", has_text="绘制圆形动画")
    first.locator(".conversation-item-main").click()
    expect(page.locator(".markdown-chip")).to_contain_text("preview.md")
    page.locator(".conversation-item.active .conversation-rename-button").click()
    page.locator(".drawer-rename input").fill("圆形动画草稿")
    page.locator(".drawer-rename .primary").click()
    expect(page.locator(".conversation-item.active")).to_contain_text("圆形动画草稿")

    page.locator(".drawer-toggle").click()
    expect(page.locator(".conversation-drawer.collapsed")).to_be_visible()

    browser.close()

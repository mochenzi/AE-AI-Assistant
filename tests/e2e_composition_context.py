from playwright.sync_api import expect, sync_playwright


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 430, "height": 820})
    page.goto("http://127.0.0.1:5173")
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_load_state("networkidle")

    page.get_by_role("button", name="更多对话选项", exact=True).click()
    page.get_by_role("button", name="当前合成内容", exact=True).click()
    expect(page.locator(".composition-context-chip")).to_contain_text("Main")
    expect(page.locator(".composition-context-chip")).to_contain_text("2 层")
    expect(page.locator(".composition-context-chip")).to_contain_text("发送时刷新")

    page.locator(".codex-composer textarea").fill("分析当前合成")
    page.get_by_role("button", name="发送消息", exact=True).click()
    expect(page.locator(".composition-context-chip")).to_be_visible()

    browser.close()

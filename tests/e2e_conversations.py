from playwright.sync_api import expect, sync_playwright


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 430, "height": 820})
    page.goto("http://127.0.0.1:5173")
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_load_state("networkidle")

    page.get_by_role("button", name="展开会话列表", exact=True).click()
    expect(page.get_by_role("button", name="新对话", exact=True)).to_be_visible()
    expect(page.locator(".conversation-drawer")).to_contain_text("开发预览工程.aep")

    page.get_by_role("button", name="新对话", exact=True).click()
    expect(page.get_by_role("dialog", name="开始新对话", exact=True)).to_be_visible()
    expect(page.get_by_text("不使用 Markdown", exact=True)).to_be_visible()
    page.get_by_role("button", name="选择 Markdown 文件…", exact=True).click()
    expect(page.locator(".markdown-chip")).to_contain_text("preview.md")
    page.get_by_role("button", name="创建对话", exact=True).click()
    expect(page.locator(".conversation-drawer .conversation-item.active")).to_be_visible()
    expect(page.locator(".markdown-chip")).to_contain_text("preview.md")

    page.locator(".codex-composer textarea").fill("绘制圆形动画")
    send = page.get_by_role("button", name="发送消息", exact=True)
    send.evaluate("el => el.removeAttribute('disabled')")
    send.click()
    expect(page.locator(".conversation-item.active")).to_contain_text("绘制圆形动画")

    page.get_by_role("button", name="新对话", exact=True).click()
    page.get_by_text("不使用 Markdown", exact=True).click()
    page.get_by_role("button", name="创建对话", exact=True).click()
    page.locator(".codex-composer textarea").fill("第二个话题")
    send = page.get_by_role("button", name="发送消息", exact=True)
    send.evaluate("el => el.removeAttribute('disabled')")
    send.click()
    expect(page.locator(".conversation-item.active")).to_contain_text("第二个话题")
    expect(page.locator(".markdown-chip")).to_have_count(0)

    page.get_by_placeholder("搜索会话").fill("圆形")
    expect(page.locator(".conversation-item")).to_have_count(1)
    expect(page.locator(".conversation-item")).to_contain_text("绘制圆形动画")
    page.get_by_placeholder("搜索会话").fill("")

    first = page.locator(".conversation-item", has_text="绘制圆形动画")
    first.click()
    expect(page.locator(".markdown-chip")).to_contain_text("preview.md")
    page.locator(".conversation-item.active").get_by_title("重命名会话").click()
    page.get_by_label("会话标题").fill("圆形动画草稿")
    page.get_by_role("button", name="保存标题", exact=True).click()
    expect(page.locator(".conversation-item.active")).to_contain_text("圆形动画草稿")

    page.get_by_role("button", name="收起会话列表", exact=True).click()
    expect(page.locator(".conversation-drawer.collapsed")).to_be_visible()

    browser.close()

from playwright.sync_api import expect, sync_playwright

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 430, "height": 820}, device_scale_factor=1)
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.goto("http://127.0.0.1:5173")
    page.wait_for_load_state("networkidle")
    assert page.get_by_text("你好", exact=True).is_visible()
    assert page.get_by_text("今天想制作什么？", exact=True).is_visible()
    assert page.locator(".empty-mark.centered").is_visible()
    assert page.locator(".context-compact").count() == 0
    assert page.locator(".conversation-toolbar").count() == 0
    assert page.locator(".chat-layout").get_by_text("tokens", exact=False).count() == 0
    assert page.get_by_role("button", name="更多对话选项", exact=True).is_visible()
    assert page.get_by_role("button", name="选择聊天模型", exact=True).is_visible()
    for label, expected in [("生成", "生成静帧素材"), ("MD??", "MD ???"), ("API", "已保存档案"), ("历史", "输入 Tokens")]:
        page.get_by_role("button", name=label, exact=True).click()
        assert page.get_by_text(expected, exact=True).is_visible()

    page.get_by_role("button", name="API", exact=True).click()
    page.get_by_role("button", name="自定义 OpenAI-compatible", exact=False).click()
    page.get_by_label("档案名称").fill("测试供应商")
    page.get_by_label("Base URL").fill("https://api.example.com/v1")
    page.get_by_role("button", name="保存档案", exact=True).click()
    assert page.get_by_text("档案已保存，仍可继续修改。", exact=True).is_visible()
    page.get_by_role("button", name="对话", exact=True).click()
    page.get_by_role("button", name="API", exact=True).click()
    page.get_by_role("button", name="测试供应商 chat · 点击编辑", exact=False).click()
    page.get_by_label("档案名称").fill("测试供应商（已修改）")
    page.get_by_role("button", name="保存档案", exact=True).click()
    assert page.get_by_text("测试供应商（已修改）", exact=True).count() == 2
    page.get_by_role("button", name="对话", exact=True).click()
    model_trigger = page.get_by_role("button", name="选择聊天模型", exact=True)
    expect(model_trigger).to_contain_text("选择模型")
    expect(model_trigger).to_be_disabled()
    page.locator(".codex-composer textarea").fill("你好")
    expect(page.get_by_role("button", name="发送消息", exact=True)).to_be_disabled()
    expect(page.locator(".composer-hint")).to_contain_text("API 页面保存聊天模型")
    page.screenshot(path="C:/tmp/ae-ai-preview.png", full_page=True)
    assert not errors, errors
    browser.close()

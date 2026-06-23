from playwright.sync_api import sync_playwright

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 430, "height": 820}, device_scale_factor=1)
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.goto("http://127.0.0.1:5173")
    page.wait_for_load_state("networkidle")
    assert page.get_by_text("开始普通对话").is_visible()
    for label, expected in [("生成", "生成静帧素材"), ("模板", "把重复描述变成工具"), ("API", "已保存档案"), ("历史", "输入 Tokens")]:
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
    page.screenshot(path="C:/tmp/ae-ai-preview.png", full_page=True)
    assert not errors, errors
    browser.close()

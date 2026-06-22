from playwright.sync_api import sync_playwright

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 430, "height": 820}, device_scale_factor=1)
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.goto("http://127.0.0.1:5173")
    page.wait_for_load_state("networkidle")
    assert page.get_by_text("准备操作 AE").is_visible()
    for label, expected in [("生成", "生成静帧素材"), ("模板", "把重复描述变成工具"), ("API", "API 档案"), ("历史", "输入 Tokens")]:
        page.get_by_role("button", name=label, exact=True).click()
        assert page.get_by_text(expected, exact=True).is_visible()
    page.get_by_role("button", name="对话", exact=True).click()
    page.screenshot(path="C:/tmp/ae-ai-preview.png", full_page=True)
    assert not errors, errors
    browser.close()

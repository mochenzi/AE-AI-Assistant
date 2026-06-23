from playwright.sync_api import expect, sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 430, "height": 820})
    page.goto("http://127.0.0.1:5173")
    page.wait_for_load_state("networkidle")

    assert page.locator(".conversation-frame").is_visible()
    assert page.locator(".model-switcher").is_visible()
    assert page.locator(".context-compact").is_visible()

    send = page.locator("button.send")
    send.evaluate("el => el.removeAttribute('disabled')")
    box = send.bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.mouse.down()
    transform = send.evaluate("el => getComputedStyle(el).transform")
    page.mouse.up()
    assert transform != "none"

    page.get_by_role("button", name="API", exact=True).click()
    assert page.get_by_text("选择供应商", exact=True).is_visible()
    page.get_by_title("新建自定义档案").click()
    page.get_by_text("高级端点与字段映射", exact=True).click()
    for label in ["聊天端点", "模型 ID Path", "视频提交端点", "余额 Amount Path", "额外 Headers (JSON)"]:
        assert page.get_by_label(label, exact=True).is_visible()
    page.get_by_label("额外 Headers (JSON)", exact=True).fill('{"X-Test":"first"}')
    page.get_by_text("OpenAI", exact=True).click()
    page.get_by_text("高级端点与字段映射", exact=True).click()
    assert page.get_by_label("额外 Headers (JSON)", exact=True).input_value().strip() == "{}"
    page.get_by_role("button", name="获取模型", exact=True).click()
    expect(page.get_by_text("已同步 1 个模型。", exact=True)).to_be_visible()
    chat_model = page.get_by_label("chat 模型", exact=True)
    expect(chat_model).to_have_js_property("tagName", "SELECT")
    chat_model.select_option("preview-model")
    page.get_by_label("声明支持 1M", exact=True).check()
    expect(page.get_by_label("声明支持 1M", exact=True)).to_be_checked()
    assert page.locator("datalist").count() == 0
    page.get_by_role("button", name="保存档案", exact=True).click()
    page.locator(".profile-list button").filter(has_text="OpenAI").click()
    expect(page.get_by_label("声明支持 1M", exact=True)).to_be_checked()
    page.get_by_text("高级端点与字段映射", exact=True).click()
    page.get_by_label("额外 Headers (JSON)", exact=True).fill('{"X-Dirty":"discard-me"}')
    page.get_by_role("button", name="放弃修改", exact=True).click()
    expect(page.get_by_label("额外 Headers (JSON)", exact=True)).to_have_value("{}")

    browser.close()

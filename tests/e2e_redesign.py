from playwright.sync_api import expect, sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 430, "height": 820})
    page.goto("http://127.0.0.1:5173")
    page.wait_for_load_state("networkidle")

    assert page.locator(".conversation-frame").is_visible()
    assert page.locator(".context-compact").count() == 0
    assert page.locator(".conversation-toolbar").count() == 0
    assert page.locator(".chat-layout").get_by_text("tokens", exact=False).count() == 0
    assert page.get_by_role("button", name="更多对话选项", exact=True).is_visible()
    assert page.get_by_role("button", name="选择聊天模型", exact=True).is_visible()
    expect(page.locator(".empty-mark.centered")).to_contain_text("你好")

    expect(page.get_by_text("普通对话", exact=True)).to_be_visible()
    page.get_by_role("button", name="选择对话模式", exact=True).click()
    page.locator(".mode-popover button", has_text="操作 AE").click()
    expect(page.locator(".mode-control.ae")).to_have_text("操作 AE")
    expect(page.locator(".ae-project-status")).to_be_visible()

    page.get_by_role("button", name="生成", exact=True).click()
    page.get_by_role("button", name="对话", exact=True).click()
    expect(page.locator(".mode-control.ae")).to_have_text("操作 AE")

    page.wait_for_timeout(400)
    page.reload()
    page.wait_for_load_state("networkidle")
    expect(page.locator(".mode-control.ae")).to_have_text("操作 AE")

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
    page.get_by_label("声明支持 1M", exact=True).uncheck()
    page.get_by_role("button", name="保存档案", exact=True).click()

    page.get_by_role("button", name="对话", exact=True).click()
    page.get_by_role("button", name="选择聊天模型", exact=True).click()
    expect(page.get_by_text("OpenAI", exact=True)).to_be_visible()
    page.locator(".model-popover button", has_text="preview-model").click()
    expect(page.get_by_role("button", name="选择聊天模型", exact=True)).to_contain_text("preview-model")

    page.get_by_role("button", name="更多对话选项", exact=True).click()
    page.get_by_role("button", name="上下文档案", exact=True).click()
    page.get_by_role("button", name="管理上下文档案", exact=True).click()
    page.locator('.inline-editor input:not([type="file"])').fill("项目背景")
    page.locator(".inline-editor textarea").fill("品牌色为绿色。")
    page.get_by_role("button", name="保存 MD 档案", exact=True).click()
    page.get_by_role("button", name="完成", exact=True).click()

    page.get_by_role("button", name="更多对话选项", exact=True).click()
    expect(page.get_by_text("项目背景", exact=True)).to_be_hidden()
    page.get_by_role("button", name="上下文档案", exact=True).click()
    context_item = page.get_by_text("项目背景", exact=True)
    context_item.click()
    expect(page.locator(".context-count")).to_have_text("上下文 1")

    page.get_by_role("button", name="管理上下文档案", exact=True).click()
    page.get_by_title("删除").click()
    expect(page.locator(".context-count")).to_have_count(0)
    page.get_by_role("button", name="完成", exact=True).click()

    expect(page.locator(".context-warning")).to_have_count(0)
    page.locator(".codex-composer textarea").fill("请继续分析。" * 32000)
    expect(page.locator(".context-warning")).to_be_visible()
    expect(page.get_by_role("button", name="发送消息", exact=True)).to_be_disabled()
    page.locator(".codex-composer textarea").fill("你好")
    page.get_by_role("button", name="发送消息", exact=True).click()
    expect(page.locator(".empty-mark.centered")).to_have_count(0)
    expect(page.locator(".message em")).to_have_count(0)

    browser.close()

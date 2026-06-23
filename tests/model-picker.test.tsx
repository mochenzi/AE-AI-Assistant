// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, test } from "vitest";
import { ModelPicker } from "../src/ui/ModelPicker";

describe("ModelPicker", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.replaceChildren(container);
    root = createRoot(container);
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  test("uses a native select for cached models and reports selection changes", () => {
    const changes: string[] = [];
    act(() =>
      root.render(
        <ModelPicker
          ariaLabel="模型"
          models={[{ id: "m1" }, { id: "m2" }]}
          value="m1"
          onChange={(value) => changes.push(value)}
        />,
      ),
    );

    const select = container.querySelector("select")!;
    expect(select).toBeTruthy();
    expect([...select.options].map(({ value }) => value)).toEqual([
      "m1",
      "m2",
      "__manual_model__",
    ]);

    act(() => {
      select.value = "m2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(changes).toEqual(["m2"]);
  });

  test("switches to manual input and supports returning to the list", () => {
    const changes: string[] = [];
    act(() =>
      root.render(
        <ModelPicker
          ariaLabel="模型"
          models={[{ id: "m1" }]}
          value="m1"
          onChange={(value) => changes.push(value)}
        />,
      ),
    );
    const select = container.querySelector("select")!;

    act(() => {
      select.value = "__manual_model__";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector('input[aria-label="模型"]')).toBeTruthy();

    act(() => (container.querySelector("button") as HTMLButtonElement).click());
    expect(container.querySelector("select")).toBeTruthy();
  });

  test("starts in manual mode for a model not present in the cache", () => {
    act(() =>
      root.render(
        <ModelPicker
          ariaLabel="模型"
          models={[{ id: "m1" }]}
          value="custom-model"
          onChange={() => undefined}
        />,
      ),
    );

    expect((container.querySelector("input") as HTMLInputElement).value).toBe(
      "custom-model",
    );
    expect(container.querySelector("select")).toBeNull();
  });

  test("switches from manual input to select when synchronized models arrive", () => {
    const props = { ariaLabel: "模型", value: "preview-model", onChange: () => undefined };
    act(() => root.render(<ModelPicker {...props} models={[]} />));
    expect(container.querySelector("input")).toBeTruthy();

    act(() => root.render(<ModelPicker {...props} models={[{ id: "preview-model" }]} />));

    expect(container.querySelector("select")).toBeTruthy();
    expect(container.querySelector("input")).toBeNull();
  });
});

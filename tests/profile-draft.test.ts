import { describe, expect, test } from "vitest";
import {
  beginProfileEdit,
  cacheProfileModels,
  discardProfileDraft,
  saveProfileDraft,
} from "../src/shared/profileDraft";
import type { ApiProfile } from "../src/shared/types";

const saved: ApiProfile = {
  id: "profile-stable-id",
  providerId: "custom",
  name: "原始档案",
  baseUrl: "https://api.example.com/v1",
  timeoutMs: 120_000,
  capabilities: ["chat"],
  headers: {},
  cachedModels: [],
  chat: {
    model: "chat-model",
    endpoint: "/chat/completions",
    structuredOutput: "json_object",
  },
};

describe("API profile drafts", () => {
  test("reopens a saved profile as an independent editable draft", () => {
    const draft = beginProfileEdit(saved);

    draft.name = "草稿名称";
    draft.headers.Authorization = "draft-only";

    expect(draft.id).toBe(saved.id);
    expect(saved.name).toBe("原始档案");
    expect(saved.headers).toEqual({});
  });

  test("saves an edited draft by stable id without creating a duplicate", () => {
    const draft = beginProfileEdit(saved);
    const result = saveProfileDraft([saved], { ...draft, name: "修改后" });

    expect(result).toEqual([{ ...saved, name: "修改后" }]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(saved.id);
  });

  test("adds a new draft while retaining its generated id", () => {
    const draft = beginProfileEdit({ ...saved, id: "new-profile" });
    const result = saveProfileDraft([saved], draft);

    expect(result.map(({ id }) => id)).toEqual([saved.id, "new-profile"]);
  });

  test("collapses legacy duplicate ids when the profile is saved again", () => {
    const duplicate = { ...saved, name: "重复档案" };
    const result = saveProfileDraft([saved, duplicate], {
      ...saved,
      name: "修改后",
    });

    expect(result).toEqual([{ ...saved, name: "修改后" }]);
  });

  test("discard restores a fresh copy of the saved profile", () => {
    const draft = beginProfileEdit(saved);
    draft.name = "未保存修改";

    const restored = discardProfileDraft(saved);

    expect(restored).toEqual(saved);
    expect(restored).not.toBe(saved);
  });

  test("stores a normalized model cache and synchronization timestamp on the draft", () => {
    const cached = cacheProfileModels(
      saved,
      [
        { id: " model-b ", contextWindow: 64_000 },
        { id: "model-a" },
        { id: "model-b", contextWindow: 128_000 },
      ],
      "2026-06-23T00:00:00.000Z",
    );

    expect(cached.cachedModels).toEqual([
      { id: "model-b", contextWindow: 64_000 },
      { id: "model-a" },
    ]);
    expect(cached.modelsUpdatedAt).toBe("2026-06-23T00:00:00.000Z");
    expect(saved.cachedModels).toEqual([]);
  });

  test("preserves user context declarations when models are synchronized again", () => {
    const profile = {
      ...saved,
      cachedModels: [
        {
          id: "model-a",
          contextWindow: 128_000,
          declaredContextWindow: 1_000_000,
        },
      ],
    };

    const cached = cacheProfileModels(profile, [
      { id: "model-a", contextWindow: 256_000 },
    ]);

    expect(cached.cachedModels).toEqual([
      {
        id: "model-a",
        contextWindow: 256_000,
        declaredContextWindow: 1_000_000,
      },
    ]);
  });
});

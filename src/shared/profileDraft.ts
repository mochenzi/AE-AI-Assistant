import type { ApiProfile, CachedModel } from './types';

function cloneProfile(profile: ApiProfile): ApiProfile {
  return JSON.parse(JSON.stringify(profile)) as ApiProfile;
}

/** Starts an isolated edit session while retaining the persisted profile id. */
export function beginProfileEdit(profile: ApiProfile): ApiProfile {
  return cloneProfile(profile);
}

/** Replaces the persisted profile with the same id, or appends a genuinely new one. */
export function saveProfileDraft(profiles: ApiProfile[], draft: ApiProfile): ApiProfile[] {
  const saved = cloneProfile(draft);
  if (!profiles.some(({ id }) => id === saved.id)) return [...profiles, saved];

  let replaced = false;
  return profiles.flatMap((profile) => {
    if (profile.id !== saved.id) return [profile];
    if (replaced) return [];
    replaced = true;
    return [saved];
  });
}

/** Drops unsaved edits and returns a fresh draft of the persisted value. */
export function discardProfileDraft(profile: ApiProfile): ApiProfile {
  return beginProfileEdit(profile);
}

/** Normalizes a model-list response before persisting it on the editable profile. */
export function cacheProfileModels(
  profile: ApiProfile,
  models: CachedModel[],
  updatedAt = new Date().toISOString(),
): ApiProfile {
  const seen = new Set<string>();
  const declarations = new Map(
    (profile.cachedModels || [])
      .filter(({ declaredContextWindow }) => Number.isFinite(declaredContextWindow) && (declaredContextWindow ?? 0) > 0)
      .map(({ id, declaredContextWindow }) => [id, declaredContextWindow] as const),
  );
  const cachedModels = models.flatMap(({ id, contextWindow }) => {
    const normalizedId = id.trim();
    if (!normalizedId || seen.has(normalizedId)) return [];
    seen.add(normalizedId);
    return [{
      id: normalizedId,
      ...(Number.isFinite(contextWindow) && (contextWindow ?? 0) > 0 ? { contextWindow } : {}),
      ...(declarations.has(normalizedId) ? { declaredContextWindow: declarations.get(normalizedId) } : {}),
    }];
  });

  return { ...beginProfileEdit(profile), cachedModels, modelsUpdatedAt: updatedAt };
}

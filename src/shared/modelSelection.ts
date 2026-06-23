import type { ActiveModelSelection, AppState } from './appState';
import type { ApiProfile, CachedModel, Capability } from './types';

export const ONE_MILLION_TOKENS = 1_000_000;

export function effectiveContextWindow(model?: CachedModel): number | undefined {
  return model?.declaredContextWindow ?? model?.contextWindow;
}

export function setDeclaredContextWindow(profile: ApiProfile, modelId: string, enabled: boolean): ApiProfile {
  const normalizedId = modelId.trim();
  if (!normalizedId) return { ...profile };
  const cachedModels = [...(profile.cachedModels || [])];
  const index = cachedModels.findIndex(({ id }) => id === normalizedId);
  const current = index >= 0 ? cachedModels[index] : { id: normalizedId };
  const { declaredContextWindow: _discarded, ...withoutDeclaration } = current;
  const next = enabled
    ? { ...withoutDeclaration, declaredContextWindow: ONE_MILLION_TOKENS }
    : withoutDeclaration;
  if (index >= 0) cachedModels[index] = next;
  else cachedModels.push(next);
  return { ...profile, cachedModels };
}

export interface ResolvedSelection {
  profile?: ApiProfile;
  profileId?: string;
  model: string;
}

export function profilesForCapability(profiles: ApiProfile[], capability: Capability): ApiProfile[] {
  return profiles.filter((profile) => profile.capabilities.includes(capability) && Boolean(profile[capability]));
}

export function resolveSelection(state: AppState, capability: Capability): ResolvedSelection {
  const active = state.activeSelections[capability];
  const selectedProfile = active && state.profiles.find((profile) => profile.id === active.profileId && profile.capabilities.includes(capability));
  if (selectedProfile) return { profile: selectedProfile, profileId: selectedProfile.id, model: active.model || selectedProfile[capability]?.model || '' };

  const defaultId = state.defaultProfiles[capability];
  const fallback = profilesForCapability(state.profiles, capability).find(({ id }) => id === defaultId)
    ?? profilesForCapability(state.profiles, capability)[0];
  return { profile: fallback, profileId: fallback?.id, model: fallback?.[capability]?.model ?? '' };
}

export function setActiveSelection(
  selections: AppState['activeSelections'],
  capability: Capability,
  selection: ActiveModelSelection,
): AppState['activeSelections'] {
  return { ...selections, [capability]: { ...selection } };
}

export function withSelectedModel(profile: ApiProfile, capability: Capability, model: string): ApiProfile {
  const settings = profile[capability];
  if (!settings) return { ...profile };
  return { ...profile, [capability]: { ...settings, model } };
}

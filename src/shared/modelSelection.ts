import type { ActiveModelSelection, AppState } from './appState';
import type { ApiProfile, Capability } from './types';

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

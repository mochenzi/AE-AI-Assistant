import { Check, ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { profilesForCapability } from '../shared/modelSelection';
import type { ApiProfile } from '../shared/types';

export interface ChatModelChoice {
  profileId: string;
  profileName: string;
  model: string;
}

export function collectChatModelChoices(profiles: ApiProfile[]): ChatModelChoice[] {
  return profilesForCapability(profiles, 'chat').flatMap((profile) => {
    const ids = new Set<string>();
    const configured = profile.chat?.model.trim();
    if (configured) ids.add(configured);
    for (const item of profile.cachedModels ?? []) {
      const id = item.id.trim();
      if (id) ids.add(id);
    }
    return [...ids].map((model) => ({
      profileId: profile.id,
      profileName: profile.name,
      model,
    }));
  });
}

export function ChatModelMenu({
  profiles,
  selection,
  onChange,
}: {
  profiles: ApiProfile[];
  selection: { profileId?: string; model: string };
  onChange: (value: { profileId: string; model: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const choices = useMemo(() => collectChatModelChoices(profiles), [profiles]);
  const groups = useMemo(() => {
    const result = new Map<string, { profileName: string; items: ChatModelChoice[] }>();
    for (const choice of choices) {
      const current = result.get(choice.profileId) ?? { profileName: choice.profileName, items: [] };
      current.items.push(choice);
      result.set(choice.profileId, current);
    }
    return result;
  }, [choices]);
  const selected = choices.find(
    ({ profileId, model }) => profileId === selection.profileId && model === selection.model,
  );

  return (
    <div className="chat-model-menu">
      <button
        type="button"
        className="composer-control model-control"
        aria-label="选择聊天模型"
        aria-expanded={open}
        disabled={choices.length === 0}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{selected?.model || selection.model || '选择模型'}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="composer-popover model-popover" role="menu">
          {[...groups].map(([profileId, group]) => (
            <section key={profileId} className="chat-model-group">
              <small>{group.profileName}</small>
              {group.items.map((choice) => {
                const active = choice.profileId === selection.profileId && choice.model === selection.model;
                return (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    key={`${choice.profileId}:${choice.model}`}
                    onClick={() => {
                      onChange({ profileId: choice.profileId, model: choice.model });
                      setOpen(false);
                    }}
                  >
                    <span>{choice.model}</span>
                    {active && <Check size={12} />}
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

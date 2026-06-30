import { Edit3, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ConversationSummary, ProjectIdentity } from "../shared/conversationWorkspace";

interface ConversationDrawerProps {
  open: boolean;
  project: ProjectIdentity;
  conversations: ConversationSummary[];
  activeId: string;
  search: string;
  onToggle(): void;
  onNew(): void;
  onSearch(value: string): void;
  onSelect(id: string): void;
  onRename(id: string, title: string): void;
  onDelete(id: string): void;
}

export function ConversationDrawer({
  open,
  project,
  conversations,
  activeId,
  search,
  onToggle,
  onNew,
  onSearch,
  onSelect,
  onRename,
  onDelete,
}: ConversationDrawerProps) {
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

  return (
    <aside className={`conversation-drawer ${open ? "" : "collapsed"}`}>
      <button
        type="button"
        className="drawer-toggle"
        aria-label={open ? "\u6536\u8d77\u4f1a\u8bdd\u5217\u8868" : "\u5c55\u5f00\u4f1a\u8bdd\u5217\u8868"}
        onClick={onToggle}
      >
        {open ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
      </button>
      {open && (
        <>
          <div className="drawer-project">
            <small>{"\u5f53\u524d\u5de5\u7a0b"}</small>
            <b>{project.label}</b>
          </div>
          <button type="button" className="new-conversation-button" onClick={onNew}>
            <Plus size={15} /> {"\u65b0\u5bf9\u8bdd"}
          </button>
          <label className="conversation-search">
            <Search size={13} />
            <input
              placeholder="\u641c\u7d22\u4f1a\u8bdd"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
            />
          </label>
          <div className="conversation-list">
            {conversations.map((item) => (
              <div
                key={item.id}
                className={`conversation-item ${item.id === activeId ? "active" : ""}`}
              >
                <button
                  type="button"
                  className="conversation-item-main"
                  onClick={() => onSelect(item.id)}
                >
                  <MessageSquare size={14} />
                  <span>
                    <b>{item.title}</b>
                    <small>{new Date(item.updatedAt).toLocaleString()}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="conversation-rename-button"
                  title="\u91cd\u547d\u540d\u4f1a\u8bdd"
                  aria-label="\u91cd\u547d\u540d\u4f1a\u8bdd"
                  onClick={() => setRenaming({ id: item.id, title: item.title })}
                >
                  <Edit3 size={12} />
                </button>
                <button
                  type="button"
                  className="conversation-delete-button"
                  title="\u5220\u9664\u4f1a\u8bdd"
                  aria-label="\u5220\u9664\u4f1a\u8bdd"
                  onClick={() => onDelete(item.id)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {!conversations.length && <p className="muted">{"\u8fd8\u6ca1\u6709\u4f1a\u8bdd"}</p>}
          </div>
          {renaming && (
            <div className="drawer-rename" role="dialog" aria-label="\u91cd\u547d\u540d\u4f1a\u8bdd">
              <label>
                {"\u4f1a\u8bdd\u6807\u9898"}
                <input
                  aria-label="\u4f1a\u8bdd\u6807\u9898"
                  value={renaming.title}
                  onChange={(event) => setRenaming({ ...renaming, title: event.target.value })}
                />
              </label>
              <div>
                <button type="button" onClick={() => setRenaming(null)}>
                  {"\u53d6\u6d88"}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    if (renaming.title.trim()) onRename(renaming.id, renaming.title.trim());
                    setRenaming(null);
                  }}
                >
                  {"\u4fdd\u5b58\u6807\u9898"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
}

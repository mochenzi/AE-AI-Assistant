import { Edit3, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Search } from "lucide-react";
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
}: ConversationDrawerProps) {
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

  return (
    <aside className={`conversation-drawer ${open ? "" : "collapsed"}`}>
      <button
        type="button"
        className="drawer-toggle"
        aria-label={open ? "收起会话列表" : "展开会话列表"}
        onClick={onToggle}
      >
        {open ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
      </button>
      {open && (
        <>
          <div className="drawer-project">
            <small>当前工程</small>
            <b>{project.label}</b>
          </div>
          <button type="button" className="new-conversation-button" onClick={onNew}>
            <Plus size={15} /> 新对话
          </button>
          <label className="conversation-search">
            <Search size={13} />
            <input
              placeholder="搜索会话"
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
                  title="重命名会话"
                  aria-label="重命名会话"
                  onClick={() => setRenaming({ id: item.id, title: item.title })}
                >
                  <Edit3 size={12} />
                </button>
              </div>
            ))}
            {!conversations.length && <p className="muted">还没有会话</p>}
          </div>
          {renaming && (
            <div className="drawer-rename" role="dialog" aria-label="重命名会话">
              <label>
                会话标题
                <input
                  aria-label="会话标题"
                  value={renaming.title}
                  onChange={(event) => setRenaming({ ...renaming, title: event.target.value })}
                />
              </label>
              <div>
                <button type="button" onClick={() => setRenaming(null)}>
                  取消
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    if (renaming.title.trim()) onRename(renaming.id, renaming.title.trim());
                    setRenaming(null);
                  }}
                >
                  保存标题
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
}

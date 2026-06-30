import { FileText, LoaderCircle, X } from "lucide-react";

export interface MarkdownLibrarySource {
  id: string;
  name: string;
  kind: string;
  description: string;
}

interface NewConversationDialogProps {
  open: boolean;
  markdownSources: MarkdownLibrarySource[];
  selectedMarkdownIds: string[];
  reading?: boolean;
  onToggleMarkdown(id: string): void;
  onClearMarkdown(): void;
  onCancel(): void;
  onCreate(): Promise<void>;
}

export function NewConversationDialog({
  open,
  markdownSources,
  selectedMarkdownIds,
  reading = false,
  onToggleMarkdown,
  onClearMarkdown,
  onCancel,
  onCreate,
}: NewConversationDialogProps) {
  if (!open) return null;
  const selected = new Set(selectedMarkdownIds);

  return (
    <div className="dialog-backdrop">
      <section className="new-conversation-dialog" role="dialog" aria-modal="true" aria-label="\u5f00\u59cb\u65b0\u5bf9\u8bdd">
        <div className="dialog-title">
          <div>
            <small>CONVERSATION WORKSPACE</small>
            <h2>{"\u5f00\u59cb\u65b0\u5bf9\u8bdd"}</h2>
          </div>
          <button type="button" aria-label="\u5173\u95ed" onClick={onCancel}>
            <X size={15} />
          </button>
        </div>
        <p className="muted">
          {"\u4ece\u63d2\u4ef6\u5185\u5df2\u4fdd\u5b58\u7684\u6a21\u677f\u6216\u4e0a\u4e0b\u6587\u6863\u6848\u91cc\u9009\u62e9\uff0c\u521b\u5efa\u65f6\u4f1a\u590d\u5236\u6210\u4e00\u6b21\u6027 Markdown \u5feb\u7167\uff0c\u4e0d\u4f1a\u5f39\u51fa\u6587\u4ef6\u7a97\u53e3\u3002"}
        </p>
        <div className="markdown-options">
          <button type="button" className={!selectedMarkdownIds.length ? "active" : ""} onClick={onClearMarkdown}>
            {"\u4e0d\u4f7f\u7528 Markdown"}
          </button>
        </div>
        <div className="markdown-source-list" role="list" aria-label="\u53ef\u9009 Markdown \u8d44\u6599">
          {markdownSources.map((source) => (
            <button
              type="button"
              className={`markdown-source ${selected.has(source.id) ? "active" : ""}`}
              onClick={() => onToggleMarkdown(source.id)}
              key={source.id}
            >
              <FileText size={14} />
              <span>
                <b>{source.name}</b>
                <small>{source.kind} ? {source.description}</small>
              </span>
            </button>
          ))}
          {!markdownSources.length && (
            <p className="muted">
              {"\u8fd8\u6ca1\u6709\u4fdd\u5b58\u7684\u6a21\u677f\u6216\u4e0a\u4e0b\u6587\u6863\u6848\u3002\u5148\u5230\u201c\u6a21\u677f\u201d\u9875\u70b9\u201c\u65b0\u5efa\u201d\u4fdd\u5b58\u4e00\u4e2a\u3002"}
            </p>
          )}
        </div>
        {selectedMarkdownIds.length > 0 && (
          <div className="markdown-chip-list">
            {selectedMarkdownIds.map((id) => {
              const source = markdownSources.find((item) => item.id === id);
              return source ? <span className="markdown-chip" key={id}>{source.name}</span> : null;
            })}
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={reading}>
            {"\u53d6\u6d88"}
          </button>
          <button type="button" className="primary" onClick={onCreate} disabled={reading}>
            {reading ? <LoaderCircle className="spin" size={14} /> : null}
            {"\u521b\u5efa\u5bf9\u8bdd"}
          </button>
        </div>
      </section>
    </div>
  );
}

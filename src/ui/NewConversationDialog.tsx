import { FileText, LoaderCircle, X } from "lucide-react";

interface NewConversationDialogProps {
  open: boolean;
  selectedMarkdownPaths: string[];
  reading?: boolean;
  onPickMarkdown(): void;
  onClearMarkdown(): void;
  onCancel(): void;
  onCreate(): Promise<void>;
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function NewConversationDialog({
  open,
  selectedMarkdownPaths,
  reading = false,
  onPickMarkdown,
  onClearMarkdown,
  onCancel,
  onCreate,
}: NewConversationDialogProps) {
  if (!open) return null;

  return (
    <div className="dialog-backdrop">
      <section className="new-conversation-dialog" role="dialog" aria-modal="true" aria-label="开始新对话">
        <div className="dialog-title">
          <div>
            <small>CONVERSATION WORKSPACE</small>
            <h2>开始新对话</h2>
          </div>
          <button type="button" aria-label="关闭" onClick={onCancel}>
            <X size={15} />
          </button>
        </div>
        <p className="muted">
          Markdown 会在创建时读取为一次性快照，后续发送不会重新打开源文件。
        </p>
        <div className="markdown-options">
          <button type="button" className={!selectedMarkdownPaths.length ? "active" : ""} onClick={onClearMarkdown}>
            不使用 Markdown
          </button>
          <button type="button" onClick={onPickMarkdown}>
            <FileText size={14} /> 选择 Markdown 文件…
          </button>
        </div>
        {selectedMarkdownPaths.length > 0 && (
          <div className="markdown-chip-list">
            {selectedMarkdownPaths.map((path) => (
              <span className="markdown-chip" key={path}>
                {basename(path)}
              </span>
            ))}
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={reading}>
            取消
          </button>
          <button type="button" className="primary" onClick={onCreate} disabled={reading}>
            {reading ? <LoaderCircle className="spin" size={14} /> : null}
            创建对话
          </button>
        </div>
      </section>
    </div>
  );
}

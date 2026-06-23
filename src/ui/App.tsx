import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  Boxes,
  CircleDollarSign,
  FileText,
  History,
  KeyRound,
  Library,
  LoaderCircle,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";
import {
  createDefaultState,
  upsertById,
  type AppState,
  type Conversation,
} from "../shared/appState";
import {
  AE_OPERATION_SYSTEM_PROMPT,
  CHAT_SYSTEM_PROMPT,
  parseAssistantResponse,
} from "../shared/actionResponse";
import {
  requiresDangerConfirmation,
  type AeActionPlan,
} from "../shared/actionProtocol";
import { contextStatus } from "../shared/context";
import { estimateMessages } from "../shared/tokenUsage";
import { extractTemplateVariables, renderTemplate } from "../shared/templates";
import type {
  ApiProfile,
  ContextProfile,
  MediaTask,
  PromptTemplate,
} from "../shared/types";
import {
  getRuntime,
  hostBridge,
  selectCepDirectory,
  type ProjectContext,
} from "../cep/bridge";
import { migrateState } from "../shared/stateMigration";
import {
  createProfileFromPreset,
  listProviderPresets,
} from "../shared/providers";
import {
  effectiveContextWindow,
  ONE_MILLION_TOKENS,
  profilesForCapability,
  resolveSelection,
  setActiveSelection,
  setDeclaredContextWindow,
  withSelectedModel,
} from "../shared/modelSelection";
import {
  beginProfileEdit,
  cacheProfileModels,
  discardProfileDraft,
  saveProfileDraft,
} from "../shared/profileDraft";
import {
  compactArchivedConversation,
  persistArchiveTransition,
} from "../shared/conversationArchive";
import {
  ChatModelMenu,
  findCurrentChatModelChoice,
} from "./ChatModelMenu";
import { reconcileSelectedContextIds } from "./chatComposerState";
import { ModelPicker } from "./ModelPicker";

type Tab = "chat" | "media" | "templates" | "api" | "history";
const tabs: Array<{ id: Tab; label: string; icon: typeof Bot }> = [
  { id: "chat", label: "对话", icon: MessageSquare },
  { id: "media", label: "生成", icon: Sparkles },
  { id: "templates", label: "模板", icon: Library },
  { id: "api", label: "API", icon: KeyRound },
  { id: "history", label: "历史", icon: History },
];
const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();

export function App() {
  const runtime = useMemo(() => getRuntime(), []);
  const [tab, setTab] = useState<Tab>("chat");
  const [state, setState] = useState<AppState>(createDefaultState());
  const [project, setProject] = useState<ProjectContext | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("正在连接 After Effects…");

  useEffect(() => {
    Promise.all([runtime.getState(), hostBridge.getProjectContext()])
      .then(([stored, context]) => {
        setState(migrateState(stored));
        setProject(context);
        setNotice(hostBridge.isCep() ? "AE 已连接" : "浏览器开发预览");
        setReady(true);
      })
      .catch((error) => setNotice(error.message));
  }, [runtime]);
  useEffect(() => {
    if (ready)
      runtime
        .saveState(state)
        .catch((error) => setNotice(`保存失败：${error.message}`));
  }, [ready, runtime, state]);
  const update = useCallback(
    (change: (current: AppState) => AppState) =>
      setState((current) => change(current)),
    [],
  );

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <span>Ai</span>
          <i />
        </div>
        <nav>
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
              title={label}
            >
              <Icon size={18} />
              <small>{label}</small>
            </button>
          ))}
        </nav>
        <div
          className={`host-dot ${hostBridge.isCep() ? "online" : ""}`}
          title={notice}
        >
          <Activity size={16} />
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">AE AI ASSISTANT / 0.1</p>
            <h1>{tabs.find((item) => item.id === tab)?.label}</h1>
          </div>
          <div className="project-chip">
            <span className="pulse" />
            <div>
              <b>{project?.projectName || "未连接工程"}</b>
              <small>
                {project?.activeComp
                  ? `${project.activeComp.name} · ${project.activeComp.layerCount} 层`
                  : notice}
              </small>
            </div>
          </div>
        </header>
        {!ready ? (
          <div className="center">
            <LoaderCircle className="spin" /> 正在载入工作区
          </div>
        ) : (
          <>
            {tab === "chat" && (
              <ChatPage
                state={state}
                update={update}
                project={project!}
                setNotice={setNotice}
              />
            )}
            {tab === "media" && (
              <MediaPage
                state={state}
                update={update}
                project={project!}
                setNotice={setNotice}
              />
            )}
            {tab === "templates" && (
              <TemplatesPage
                state={state}
                update={update}
                onUse={(template) => {
                  sessionStorage.setItem("ae-ai-template", template.body);
                  setTab(template.target === "ae" ? "chat" : "media");
                }}
              />
            )}
            {tab === "api" && (
              <ApiPage state={state} update={update} setNotice={setNotice} />
            )}
            {tab === "history" && (
              <HistoryPage
                state={state}
                update={update}
                setNotice={setNotice}
              />
            )}
          </>
        )}
        <footer className="statusline">
          <span>{notice}</span>
          <span>{hostBridge.isCep() ? "CEP · AE 25/26" : "DEV PREVIEW"}</span>
        </footer>
      </main>
    </div>
  );
}

function CapabilityModelSwitcher({
  capability,
  state,
  update,
}: {
  capability: "chat" | "image" | "video";
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
}) {
  const available = profilesForCapability(state.profiles, capability);
  const selection = resolveSelection(state, capability);
  const models = selection.profile?.cachedModels ?? [];
  const selectProfile = (profileId: string) => {
    const profile = available.find((item) => item.id === profileId);
    const model =
      profile?.cachedModels?.[0]?.id || profile?.[capability]?.model || "";
    update((s) => ({
      ...s,
      activeSelections: setActiveSelection(s.activeSelections, capability, {
        profileId,
        model,
      }),
    }));
  };
  const selectModel = (model: string) => {
    if (!selection.profileId) return;
    update((s) => ({
      ...s,
      activeSelections: setActiveSelection(s.activeSelections, capability, {
        profileId: selection.profileId!,
        model,
      }),
    }));
  };
  return (
    <div className="model-switcher" aria-label={`${capability} 模型切换`}>
      <select
        aria-label="供应商档案"
        value={selection.profileId || ""}
        onChange={(event) => selectProfile(event.target.value)}
      >
        <option value="">未配置供应商</option>
        {available.map((profile) => (
          <option value={profile.id} key={profile.id}>
            {profile.name}
          </option>
        ))}
      </select>
      <ModelPicker
        ariaLabel="模型"
        models={models}
        value={selection.model}
        onChange={selectModel}
      />
    </div>
  );
}

function ChatPage({
  state,
  update,
  project,
  setNotice,
}: {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  project: ProjectContext;
  setNotice: (s: string) => void;
}) {
  const runtime = getRuntime();
  const latestState = useRef(state);
  latestState.current = state;
  const [prompt, setPrompt] = useState(
    () => sessionStorage.getItem("ae-ai-template") || "",
  );
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<AeActionPlan | null>(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [contextPickerOpen, setContextPickerOpen] = useState(false);
  const [contextEditor, setContextEditor] = useState(false);
  const [selectedContexts, setSelectedContexts] = useState<string[]>(
    state.contexts.map(({ id }) => id),
  );
  const selectedContextIds = reconcileSelectedContextIds(
    selectedContexts,
    state.contexts,
  );
  const resolvedChatSelection = resolveSelection(state, "chat");
  const chatSelection = state.activeSelections.chat ?? {
    profileId: resolvedChatSelection.profileId,
    model: resolvedChatSelection.model,
  };
  const currentChatChoice = findCurrentChatModelChoice(state.profiles, {
    profileId: chatSelection.profileId,
    model: chatSelection.model,
  });
  const profile = currentChatChoice
    ? state.profiles.find(({ id }) => id === currentChatChoice.profileId)
    : undefined;
  const requestProfile = profile && currentChatChoice
    ? withSelectedModel(profile, "chat", currentChatChoice.model)
    : undefined;
  const conversation = state.conversations.find(({ archived }) => !archived);
  const hasMessages = Boolean(conversation?.messages.length);
  const systemPrompt =
    state.chatMode === "ae"
      ? AE_OPERATION_SYSTEM_PROMPT
      : CHAT_SYSTEM_PROMPT;
  const injected = state.contexts.filter(({ id }) =>
    selectedContextIds.includes(id),
  );
  const estimated = estimateMessages([
    { role: "system", content: systemPrompt },
    ...injected.map(({ content }) => ({ role: "system" as const, content })),
    ...(conversation?.messages ?? []),
    { role: "user", content: prompt },
  ]);
  const selectedModelMeta = profile?.cachedModels?.find(
    ({ id }) => id === chatSelection.model,
  );
  const contextLimit =
    effectiveContextWindow(selectedModelMeta) || profile?.chat?.contextWindow;
  const budget = contextStatus(estimated, contextLimit);

  useEffect(() => {
    setSelectedContexts((ids) =>
      reconcileSelectedContextIds(ids, state.contexts),
    );
  }, [state.contexts]);

  async function send() {
    if (!currentChatChoice || !profile || !requestProfile) {
      setNotice("请先选择聊天供应商和模型");
      return;
    }
    if (!prompt.trim() || budget.level === "blocked") return;
    setBusy(true);
    setPlan(null);
    setModeMenuOpen(false);
    setNotice("正在请求模型…");
    const active: Conversation = conversation ?? {
      id: uid(),
      title: prompt.slice(0, 24),
      messages: [],
      contextProfileIds: selectedContextIds,
      archived: false,
      createdAt: now(),
    };
    const messages = [
      { role: "system" as const, content: systemPrompt },
      {
        role: "system" as const,
        content: `当前 AE 工程上下文：${JSON.stringify(project)}`,
      },
      ...injected.map(({ name, content }) => ({
        role: "system" as const,
        content: `上下文档案「${name}」：\n${content}`,
      })),
      ...active.messages.map(({ role, content }) => ({ role, content })),
      { role: "user" as const, content: prompt },
    ];
    let text = "";
    let usage = { input: estimated, output: 0, estimated: true };
    try {
      await runtime.chat(requestProfile, messages, (event) => {
        if (event.type === "text") {
          text += event.text;
        }
        if (event.type === "usage")
          usage = {
            input: event.input,
            output: event.output,
            estimated: false,
          };
      });
      const response = parseAssistantResponse(text, {
        allowAeActions: state.chatMode === "ae",
        currentMode: latestState.current.chatMode,
      });
      setPlan(response.kind === "ae_action" ? response.plan : null);
      const nextConversation = {
        ...active,
        contextProfileIds: selectedContextIds,
        messages: [
          ...active.messages,
          { role: "user" as const, content: prompt },
          {
            role: "assistant" as const,
            content: response.visibleText,
            usage,
          },
        ],
      };
      update((s) => ({
        ...s,
        conversations: upsertById(s.conversations, nextConversation),
        tokenTotals: {
          ...s.tokenTotals,
          [`${profile.id}:${chatSelection.model}`]: {
            input:
              (s.tokenTotals[`${profile.id}:${chatSelection.model}`]?.input ||
                0) + usage.input,
            output:
              (s.tokenTotals[`${profile.id}:${chatSelection.model}`]?.output ||
                0) + usage.output,
          },
        },
      }));
      setPrompt("");
      sessionStorage.removeItem("ae-ai-template");
      setNotice("模型响应完成");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    if (
      !plan ||
      !confirm(`执行 ${plan.actions.length} 个 AE 动作？\n${plan.summary}`)
    )
      return;
    if (
      requiresDangerConfirmation(plan.actions) &&
      !confirm("此计划会删除图层或关键帧。再次确认执行危险操作？")
    )
      return;
    try {
      await hostBridge.executePlan(plan);
      setPlan(null);
      setNotice("AE 动作已执行，可使用 Ctrl+Z 一次撤销");
    } catch (error) {
      setNotice((error as Error).message);
    }
  }

  async function archiveWithSummary() {
    if (
      !conversation ||
      !profile ||
      !requestProfile ||
      !confirm(
        "调用当前模型生成交接摘要，并将完整旧会话写入外部 Markdown 归档？",
      )
    )
      return;
    let archiveDirectory = state.archiveDirectory;
    if (!archiveDirectory) {
      archiveDirectory = selectCepDirectory() || "";
      if (!archiveDirectory) {
        setNotice("请先在“历史”页面选择对话归档目录");
        return;
      }
    }
    setBusy(true);
    setNotice("正在生成上下文交接摘要…");
    let summary = "";
    try {
      await runtime.chat(
        requestProfile,
        [
          {
            role: "system",
            content:
              "请把以下对话压缩为结构化 JSON，字段为 goal、decisions、aeState、nextSteps、constraints。保留精确名称和数值，不执行 AE 动作。",
          },
          {
            role: "user",
            content: conversation.messages
              .map((m) => `${m.role}: ${m.content}`)
              .join("\n"),
          },
        ],
        (event) => {
          if (event.type === "text") summary += event.text;
        },
      );
      const archivePath = await runtime.archiveConversation(
        archiveDirectory,
        conversation,
        state.contexts,
      );
      const archivedConversation = compactArchivedConversation(
        conversation,
        archivePath,
        summary,
      );
      const next: Conversation = {
        id: uid(),
        title: `${conversation.title} · 续`,
        messages: [
          { role: "system", content: `上一会话交接摘要：\n${summary}` },
        ],
        contextProfileIds: selectedContextIds,
        archived: false,
        createdAt: now(),
      };
      const currentState = latestState.current;
      const nextState: AppState = {
        ...currentState,
        archiveDirectory,
        conversations: [
          ...currentState.conversations.map((c) =>
            c.id === conversation.id ? archivedConversation : c,
          ),
          next,
        ],
      };
      await persistArchiveTransition(
        (value) => runtime.saveState(value),
        nextState,
        (value) => update(() => value),
      );
      setNotice(`旧会话已归档到：${archivePath}`);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page chat-layout">
      <div className="conversation-frame clean-chat">
        <div className="conversation">
          {state.chatMode === "ae" && (
            <div className="ae-project-status">
              {project.activeComp
                ? `${project.activeComp.name} · AE 已连接`
                : "未选择活动合成"}
            </div>
          )}
          {!hasMessages && !busy && (
            <div className="empty-mark centered">
              <b>你好</b>
              <span>今天想制作什么？</span>
            </div>
          )}
          {conversation?.messages.map((message, index) => (
            <article key={index} className={`message ${message.role}`}>
              <small>
                {message.role === "user"
                  ? "你"
                  : message.role === "assistant"
                    ? "AI"
                    : "上下文"}
              </small>
              <p>{message.content}</p>
            </article>
          ))}
          {busy && (
            <article
              className="message assistant pending-response"
              aria-live="polite"
            >
              <small>AI</small>
              <p>
                <LoaderCircle className="spin" size={14} /> 正在思考…
              </p>
            </article>
          )}
          {plan && (
            <div className="plan-card">
              <div>
                <WandSparkles size={18} />
                <b>{plan.summary}</b>
                <span className={`risk ${plan.risk}`}>{plan.risk}</span>
              </div>
              <ol>
                {plan.actions.map((action, index) => (
                  <li
                    key={index}
                    className={action.type.includes("delete") ? "danger" : ""}
                  >
                    <code>{action.type}</code>
                    <span>{JSON.stringify(action).slice(0, 100)}</span>
                  </li>
                ))}
              </ol>
              <button className="primary" onClick={execute}>
                <Play size={16} /> 确认执行
              </button>
            </div>
          )}
        </div>
        <div className="composer-shell">
          {(budget.level === "warning" || budget.level === "blocked") && (
            <div className={`context-warning ${budget.level}`}>
              <span>
                {budget.level === "blocked"
                  ? "上下文已接近上限，请压缩后继续。"
                  : "上下文将满，可压缩后继续。"}
              </span>
              <button disabled={busy} onClick={archiveWithSummary}>
                {busy ? "归档中…" : "压缩并续聊"}
              </button>
            </div>
          )}
          {contextEditor && (
            <div className="composer-context-editor">
              <ContextEditor state={state} update={update} />
              <button
                type="button"
                onClick={() => {
                  setContextEditor(false);
                  setContextPickerOpen(false);
                }}
              >
                完成
              </button>
            </div>
          )}
          <div className="composer codex-composer">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={
                state.chatMode === "ae"
                  ? "描述想在 AE 中完成的操作…"
                  : "输入问题，和 AI 正常对话…"
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  (event.ctrlKey || event.metaKey)
                )
                  send();
              }}
            />
            <div className="composer-controls">
              <div className="composer-menu-anchor">
                <button
                  type="button"
                  className="composer-icon-button"
                  aria-label="更多对话选项"
                  aria-expanded={plusMenuOpen}
                  onClick={() => {
                    if (plusMenuOpen) setContextPickerOpen(false);
                    setPlusMenuOpen(!plusMenuOpen);
                  }}
                >
                  <Plus size={16} />
                </button>
                {plusMenuOpen && (
                  <div className="composer-popover context-popover">
                    <button
                      type="button"
                      onClick={() => setContextPickerOpen((open) => !open)}
                    >
                      <FileText size={14} /> 上下文档案
                    </button>
                    {contextPickerOpen && (
                      <div className="composer-context-list">
                        {state.contexts.length === 0 && (
                          <small>还没有上下文档案</small>
                        )}
                        {state.contexts.map((item) => (
                          <label key={item.id}>
                            <input
                              type="checkbox"
                              checked={selectedContextIds.includes(item.id)}
                              onChange={() =>
                                setSelectedContexts((ids) =>
                                  ids.includes(item.id)
                                    ? ids.filter((id) => id !== item.id)
                                    : [...ids, item.id],
                                )
                              }
                            />
                            {item.name}
                          </label>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setContextEditor(true);
                            setContextPickerOpen(false);
                            setPlusMenuOpen(false);
                          }}
                        >
                          管理上下文档案
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="composer-menu-anchor">
                <button
                  type="button"
                  className={`composer-control mode-control ${state.chatMode}`}
                  aria-label="选择对话模式"
                  aria-expanded={modeMenuOpen}
                  disabled={busy}
                  onClick={() => setModeMenuOpen((open) => !open)}
                >
                  {state.chatMode === "ae" ? "操作 AE" : "普通对话"}
                </button>
                {modeMenuOpen && (
                  <div className="composer-popover mode-popover">
                    {([
                      ["chat", "普通对话"],
                      ["ae", "操作 AE"],
                    ] as const).map(([value, label]) => (
                      <button
                        type="button"
                        aria-pressed={state.chatMode === value}
                        disabled={busy}
                        key={value}
                        onClick={() => {
                          update((current) => ({
                            ...current,
                            chatMode: value,
                          }));
                          setModeMenuOpen(false);
                          setPlan(null);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <ChatModelMenu
                profiles={state.profiles}
                selection={{
                  profileId: chatSelection.profileId,
                  model: chatSelection.model,
                }}
                onChange={(selection) =>
                  update((current) => ({
                    ...current,
                    activeSelections: setActiveSelection(
                      current.activeSelections,
                      "chat",
                      selection,
                    ),
                  }))
                }
              />
              {selectedContextIds.length > 0 && (
                <span className="context-count">
                  上下文 {selectedContextIds.length}
                </span>
              )}
              <button
                className="send"
                aria-label="发送消息"
                disabled={
                  busy ||
                  !prompt.trim() ||
                  budget.level === "blocked" ||
                  !currentChatChoice
                }
                onClick={send}
              >
                {busy ? <LoaderCircle className="spin" /> : <Send />}
              </button>
            </div>
            {!currentChatChoice && (
              <small className="composer-hint">
                请先在 API 页面保存聊天模型
              </small>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ContextEditor({
  state,
  update,
}: {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("项目背景");
  const [content, setContent] = useState("");
  const save = () => {
    if (!name.trim() || !content.trim()) return;
    const item: ContextProfile = {
      id: editingId || uid(),
      name,
      content,
      updatedAt: now(),
    };
    update((s) => ({ ...s, contexts: upsertById(s.contexts, item) }));
    setContent("");
    setEditingId(null);
  };
  const edit = (item: ContextProfile) => {
    setEditingId(item.id);
    setName(item.name);
    setContent(item.content);
  };
  const importMd = async (files: FileList | null) => {
    if (!files) return;
    const imported = await Promise.all(
      [...files].map(async (file) => ({
        id: uid(),
        name: file.name.replace(/\.md$/i, ""),
        content: await file.text(),
        updatedAt: now(),
      })),
    );
    update((s) => ({ ...s, contexts: [...s.contexts, ...imported] }));
  };
  const exportMd = (item: ContextProfile) => {
    const url = URL.createObjectURL(
      new Blob([item.content], { type: "text/markdown;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${item.name}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="inline-editor">
      <div className="context-manager">
        {state.contexts.map((item) => (
          <span key={item.id}>
            <button onClick={() => edit(item)}>{item.name}</button>
            <button title="导出" onClick={() => exportMd(item)}>
              ↓
            </button>
            <button
              title="删除"
              onClick={() =>
                update((s) => ({
                  ...s,
                  contexts: s.contexts.filter((x) => x.id !== item.id),
                }))
              }
            >
              ×
            </button>
          </span>
        ))}
        <label className="file-button">
          导入 .md
          <input
            type="file"
            accept=".md,text/markdown"
            multiple
            onChange={(e) => importMd(e.target.files)}
          />
        </label>
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="粘贴或编写每次对话都需要知道的 Markdown…"
      />
      <button onClick={save}>
        <Plus size={14} /> {editingId ? "更新" : "保存"} MD 档案
      </button>
    </div>
  );
}

function MediaPage({
  state,
  update,
  project,
  setNotice,
}: {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  project: ProjectContext;
  setNotice: (s: string) => void;
}) {
  const [kind, setKind] = useState<"image" | "video">("image");
  const [prompt, setPrompt] = useState(
    () => sessionStorage.getItem("ae-ai-template") || "",
  );
  const [busy, setBusy] = useState(false);
  const [ratio, setRatio] = useState("16:9");
  const [duration, setDuration] = useState(5);
  const mediaSelection = resolveSelection(state, kind);
  const profile = mediaSelection.profile;
  const requestProfile = profile
    ? withSelectedModel(profile, kind, mediaSelection.model)
    : undefined;
  const output = project.projectPath
    ? project.projectPath.replace(/[\\/][^\\/]+$/, "")
    : "";
  useEffect(() => {
    const pending = state.tasks.filter(
      (task) =>
        task.type === "video" && task.status === "polling" && task.remoteTaskId,
    );
    if (!pending.length) return;
    let stopped = false;
    const resume = async () => {
      for (const task of pending) {
        const taskProfile = state.profiles.find(
          (item) => item.id === task.profileId,
        );
        if (!taskProfile || stopped) continue;
        try {
          const result = await getRuntime().pollVideo(
            taskProfile,
            task.remoteTaskId!,
          );
          if (result.state === "ready") {
            update((s) => ({
              ...s,
              tasks: s.tasks.map((item) =>
                item.id === task.id
                  ? {
                      ...item,
                      status: "downloading",
                      remoteUrl: result.url,
                      updatedAt: now(),
                    }
                  : item,
              ),
            }));
            setNotice("恢复的视频任务已完成，等待你确认下载并导入");
          } else if (result.state === "failed")
            update((s) => ({
              ...s,
              tasks: s.tasks.map((item) =>
                item.id === task.id
                  ? {
                      ...item,
                      status: "failed",
                      error: result.error,
                      updatedAt: now(),
                    }
                  : item,
              ),
            }));
        } catch (error) {
          setNotice(`恢复任务失败：${(error as Error).message}`);
        }
      }
    };
    resume();
    const timer = setInterval(resume, 10000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [state.profiles, state.tasks, update, setNotice]);
  async function importPath(path: string) {
    const context = await hostBridge.getProjectContext();
    await hostBridge.executePlan({
      version: "ae-actions/v1",
      summary: "导入 AI 生成素材",
      risk: "low",
      projectRevision: context.revision,
      actions: [{ type: "footage.import", path }],
    });
  }
  async function generate() {
    if (!profile || !requestProfile || !mediaSelection.model)
      return setNotice(
        `请先选择${kind === "image" ? "图片" : "视频"}供应商和模型`,
      );
    if (!output) return setNotice("请先保存 AE 工程，以确定素材目录");
    setBusy(true);
    const task: MediaTask = {
      id: uid(),
      type: kind,
      profileId: profile.id,
      prompt,
      status: "submitting",
      createdAt: now(),
      updatedAt: now(),
    };
    update((s) => ({ ...s, tasks: [task, ...s.tasks] }));
    try {
      let path = "";
      if (kind === "image")
        path = await getRuntime().generateImage(
          requestProfile,
          prompt,
          ratio === "1:1" ? "1024x1024" : "1536x1024",
          output,
        );
      else {
        const taskId = await getRuntime().submitVideo(
          requestProfile,
          prompt,
          ratio,
          duration,
        );
        update((s) => ({
          ...s,
          tasks: s.tasks.map((item) =>
            item.id === task.id
              ? {
                  ...item,
                  status: "polling",
                  remoteTaskId: taskId,
                  updatedAt: now(),
                }
              : item,
          ),
        }));
        let status;
        do {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          status = await getRuntime().pollVideo(requestProfile, taskId);
          setNotice("视频生成中，正在轮询任务…");
        } while (status.state === "polling");
        if (status.state === "failed")
          throw new Error(status.error || "视频生成失败");
        path = await getRuntime().download(status.url!, output);
      }
      await importPath(path);
      update((s) => ({
        ...s,
        tasks: s.tasks.map((item) =>
          item.id === task.id
            ? {
                ...item,
                status: "completed",
                localPath: path,
                updatedAt: now(),
              }
            : item,
        ),
      }));
      setNotice("素材已生成并导入 AE");
      setPrompt("");
      sessionStorage.removeItem("ae-ai-template");
    } catch (error) {
      update((s) => ({
        ...s,
        tasks: s.tasks.map((item) =>
          item.id === task.id
            ? {
                ...item,
                status: "failed",
                error: (error as Error).message,
                updatedAt: now(),
              }
            : item,
        ),
      }));
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function finishRecovered(task: MediaTask) {
    if (!task.remoteUrl || !output) return;
    try {
      const path = await getRuntime().download(task.remoteUrl, output);
      await importPath(path);
      update((s) => ({
        ...s,
        tasks: s.tasks.map((item) =>
          item.id === task.id
            ? {
                ...item,
                status: "completed",
                localPath: path,
                updatedAt: now(),
              }
            : item,
        ),
      }));
      setNotice("恢复任务的素材已下载并导入");
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  return (
    <section className="page media-page">
      <div className="media-toolbar">
        <div className="segmented">
          <button
            className={kind === "image" ? "active" : ""}
            onClick={() => setKind("image")}
          >
            图片
          </button>
          <button
            className={kind === "video" ? "active" : ""}
            onClick={() => setKind("video")}
          >
            视频
          </button>
        </div>
        <CapabilityModelSwitcher
          capability={kind}
          state={state}
          update={update}
        />
      </div>
      <div className="hero-card">
        <span className="serial">
          GEN / {kind === "image" ? "STILL" : "MOTION"}
        </span>
        <h2>{kind === "image" ? "生成静帧素材" : "生成动态素材"}</h2>
        <p>生成结果会保存到工程旁的 AI Generated 目录，并自动进入项目面板。</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="描述画面、风格、构图、光线和运动…"
        />
        <div className="form-grid">
          <label>
            画面比例
            <select value={ratio} onChange={(e) => setRatio(e.target.value)}>
              <option>16:9</option>
              <option>9:16</option>
              <option>1:1</option>
              <option>4:3</option>
            </select>
          </label>
          {kind === "video" && (
            <label>
              时长（秒）
              <input
                type="number"
                min="1"
                max="30"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </label>
          )}
          <label>
            当前模型
            <input
              value={`${profile?.name || "未配置"} / ${mediaSelection.model || "未选择"}`}
              disabled
            />
          </label>
        </div>
        <button
          className="primary large"
          disabled={busy || !prompt.trim()}
          onClick={generate}
        >
          {busy ? <LoaderCircle className="spin" /> : <Sparkles />}{" "}
          {busy ? "生成中…" : "开始生成并导入"}
        </button>
      </div>
      <TaskList tasks={state.tasks} onFinish={finishRecovered} />
    </section>
  );
}

function TaskList({
  tasks,
  onFinish,
}: {
  tasks: MediaTask[];
  onFinish: (task: MediaTask) => void;
}) {
  return (
    <div className="task-list">
      <h3>最近任务</h3>
      {tasks.slice(0, 5).map((task) => (
        <div className="task" key={task.id}>
          <span className={`task-status ${task.status}`} />
          <div>
            <b>
              {task.type === "image" ? "图片" : "视频"} · {task.status}
            </b>
            <small>{task.prompt}</small>
          </div>
          {task.status === "downloading" && task.remoteUrl ? (
            <button onClick={() => onFinish(task)}>下载并导入</button>
          ) : (
            <time>{new Date(task.updatedAt).toLocaleTimeString()}</time>
          )}
        </div>
      ))}
      {!tasks.length && <p className="muted">还没有生成任务。</p>}
    </div>
  );
}

function TemplatesPage({
  state,
  update,
  onUse,
}: {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  onUse: (t: PromptTemplate) => void;
}) {
  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const open = (item: PromptTemplate) => {
    setEditing(item);
    setValues(Object.fromEntries(item.variables.map((key) => [key, ""])));
  };
  const use = () => {
    if (!editing) return;
    try {
      onUse({ ...editing, body: renderTemplate(editing.body, values) });
    } catch (error) {
      alert((error as Error).message);
    }
  };
  return (
    <section className="page">
      <div className="section-title">
        <div>
          <p className="eyebrow">PROMPT LIBRARY</p>
          <h2>把重复描述变成工具</h2>
        </div>
        <button
          onClick={() =>
            setEditing({
              id: uid(),
              title: "新模板",
              category: "自定义",
              target: "ae",
              body: "",
              variables: [],
              builtin: false,
            })
          }
        >
          <Plus size={15} /> 新建
        </button>
      </div>
      <div className="template-grid">
        {state.templates.map((item) => (
          <button
            key={item.id}
            className="template-card"
            onClick={() => open(item)}
          >
            <span>{item.category}</span>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
            <em>
              {item.target.toUpperCase()} · {item.variables.length} 参数
            </em>
          </button>
        ))}
      </div>
      {editing && (
        <div className="drawer">
          <div className="drawer-head">
            <h3>{editing.title}</h3>
            <button onClick={() => setEditing(null)}>×</button>
          </div>
          <label>
            标题
            <input
              value={editing.title}
              onChange={(e) =>
                setEditing({ ...editing, title: e.target.value })
              }
            />
          </label>
          <label>
            提示词
            <textarea
              value={editing.body}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  body: e.target.value,
                  variables: extractTemplateVariables(e.target.value),
                })
              }
            />
          </label>
          {editing.variables.map((key) => (
            <label key={key}>
              {key}
              <input
                value={values[key] || ""}
                onChange={(e) =>
                  setValues({ ...values, [key]: e.target.value })
                }
              />
            </label>
          ))}
          <div className="drawer-actions">
            {!editing.builtin && (
              <button
                onClick={() => {
                  update((s) => ({
                    ...s,
                    templates: upsertById(s.templates, editing),
                  }));
                  setEditing(null);
                }}
              >
                保存模板
              </button>
            )}
            <button className="primary" onClick={use}>
              填充并使用
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function LegacyApiPage({
  state,
  update,
  setNotice,
}: {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  setNotice: (s: string) => void;
}) {
  const blank = (): ApiProfile => ({
    id: uid(),
    name: "新 API 档案",
    baseUrl: "https://api.openai.com/v1",
    timeoutMs: 120000,
    capabilities: ["chat"],
    headers: {},
    chat: {
      model: "",
      endpoint: "/chat/completions",
      structuredOutput: "json_object",
      contextWindow: 128000,
    },
    models: {
      endpoint: "/models",
      idPath: "data[*].id",
      contextPath: "data[*].context_length",
    },
  });
  const [selected, setSelected] = useState<ApiProfile | null>(
    state.profiles[0] || null,
  );
  const [key, setKey] = useState("");
  const [models, setModels] = useState<
    Array<{ id: string; contextWindow?: number }>
  >([]);
  const [balance, setBalance] = useState<string>("未查询");
  const save = async () => {
    if (!selected) return;
    update((s) => ({
      ...s,
      profiles: upsertById(s.profiles, selected),
      defaultProfiles: {
        ...s.defaultProfiles,
        ...Object.fromEntries(
          selected.capabilities.map((cap) => [
            cap,
            s.defaultProfiles[cap] || selected.id,
          ]),
        ),
      },
    }));
    if (key) {
      await getRuntime().saveApiKey(selected.id, key);
      setKey("");
    }
    setNotice("API 档案已安全保存");
  };
  const sync = async () => {
    if (!selected) return;
    try {
      const list = await getRuntime().listModels(selected);
      setModels(list);
      setNotice(`已获取 ${list.length} 个模型`);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const checkBalance = async () => {
    if (!selected) return;
    try {
      const result = await getRuntime().getBalance(selected);
      setBalance(
        result ? `${result.amount} ${result.currency || ""}` : "未配置",
      );
    } catch (error) {
      setBalance("查询失败");
      setNotice((error as Error).message);
    }
  };
  const updateVideo = (change: Partial<NonNullable<ApiProfile["video"]>>) =>
    setSelected({
      ...selected!,
      video: {
        model: "",
        submitEndpoint: "/videos",
        statusEndpoint: "/videos/{taskId}",
        taskIdPath: "id",
        statusPath: "status",
        resultUrlPath: "result.url",
        errorPath: "error.message",
        successValues: ["completed", "done", "succeeded"],
        failureValues: ["failed", "error"],
        ...(selected!.video || {}),
        ...change,
      },
    });
  return (
    <section className="page api-layout">
      <div className="profile-list">
        <div className="section-title">
          <h3>API 档案</h3>
          <button onClick={() => setSelected(blank())}>
            <Plus size={14} />
          </button>
        </div>
        {state.profiles.map((profile) => (
          <button
            key={profile.id}
            className={selected?.id === profile.id ? "active" : ""}
            onClick={() => setSelected(profile)}
          >
            <span className="provider-mark">{profile.name.slice(0, 1)}</span>
            <div>
              <b>{profile.name}</b>
              <small>{profile.capabilities.join(" · ")}</small>
            </div>
          </button>
        ))}
        {!state.profiles.length && (
          <p className="muted">创建第一个兼容接口档案。</p>
        )}
      </div>
      {selected && (
        <div className="settings-form">
          <div className="section-title">
            <div>
              <p className="eyebrow">PROVIDER PROFILE</p>
              <h2>{selected.name}</h2>
            </div>
            <button
              className="danger-button"
              onClick={() => {
                update((s) => ({
                  ...s,
                  profiles: s.profiles.filter((p) => p.id !== selected.id),
                }));
                getRuntime().removeApiKey(selected.id);
                setSelected(null);
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
          <div className="form-grid">
            <label>
              档案名称
              <input
                value={selected.name}
                onChange={(e) =>
                  setSelected({ ...selected, name: e.target.value })
                }
              />
            </label>
            <label>
              Base URL
              <input
                value={selected.baseUrl}
                onChange={(e) =>
                  setSelected({ ...selected, baseUrl: e.target.value })
                }
              />
            </label>
            <label>
              API Key
              <input
                type="password"
                value={key}
                placeholder="已保存时留空不变"
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <label>
              超时 ms
              <input
                type="number"
                value={selected.timeoutMs}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    timeoutMs: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <fieldset>
            <legend>能力</legend>
            <div className="capabilities">
              {(["chat", "image", "video"] as const).map((cap) => (
                <label key={cap}>
                  <input
                    type="checkbox"
                    checked={selected.capabilities.includes(cap)}
                    onChange={() =>
                      setSelected({
                        ...selected,
                        capabilities: selected.capabilities.includes(cap)
                          ? selected.capabilities.filter((x) => x !== cap)
                          : [...selected.capabilities, cap],
                      })
                    }
                  />
                  {cap}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="form-grid">
            <label>
              聊天模型
              <input
                value={selected.chat?.model || ""}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    chat: {
                      ...(selected.chat || {
                        endpoint: "/chat/completions",
                        structuredOutput: "json_object",
                      }),
                      model: e.target.value,
                    },
                  })
                }
                list="models"
              />
            </label>
            <label>
              上下文长度
              <input
                type="number"
                value={selected.chat?.contextWindow || ""}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    chat: {
                      ...(selected.chat || {
                        model: "",
                        endpoint: "/chat/completions",
                        structuredOutput: "json_object",
                      }),
                      contextWindow: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              图片模型
              <input
                value={selected.image?.model || ""}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    image: {
                      model: e.target.value,
                      endpoint:
                        selected.image?.endpoint || "/images/generations",
                    },
                  })
                }
              />
            </label>
            <label>
              视频模型
              <input
                value={selected.video?.model || ""}
                onChange={(e) => updateVideo({ model: e.target.value })}
              />
            </label>
          </div>
          <datalist id="models">
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.contextWindow}
              </option>
            ))}
          </datalist>
          <details>
            <summary>
              <Settings2 size={15} /> 高级端点映射
            </summary>
            <div className="form-grid">
              <label>
                模型端点
                <input
                  value={selected.models?.endpoint || ""}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      models: {
                        idPath: "data[*].id",
                        ...(selected.models || {}),
                        endpoint: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                模型 ID Path
                <input
                  value={selected.models?.idPath || ""}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      models: {
                        endpoint: "/models",
                        ...(selected.models || {}),
                        idPath: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                余额端点
                <input
                  value={selected.balance?.endpoint || ""}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      balance: {
                        method: "GET",
                        amountPath: "data.balance",
                        ...(selected.balance || {}),
                        endpoint: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                余额 Amount Path
                <input
                  value={selected.balance?.amountPath || ""}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      balance: {
                        method: "GET",
                        endpoint: "/balance",
                        ...(selected.balance || {}),
                        amountPath: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                视频提交端点
                <input
                  value={selected.video?.submitEndpoint || ""}
                  onChange={(e) =>
                    updateVideo({ submitEndpoint: e.target.value })
                  }
                />
              </label>
              <label>
                视频状态端点
                <input
                  value={selected.video?.statusEndpoint || ""}
                  onChange={(e) =>
                    updateVideo({ statusEndpoint: e.target.value })
                  }
                />
              </label>
              <label>
                任务 ID Path
                <input
                  value={selected.video?.taskIdPath || ""}
                  onChange={(e) => updateVideo({ taskIdPath: e.target.value })}
                />
              </label>
              <label>
                状态 Path
                <input
                  value={selected.video?.statusPath || ""}
                  onChange={(e) => updateVideo({ statusPath: e.target.value })}
                />
              </label>
              <label>
                结果 URL Path
                <input
                  value={selected.video?.resultUrlPath || ""}
                  onChange={(e) =>
                    updateVideo({ resultUrlPath: e.target.value })
                  }
                />
              </label>
              <label>
                错误 Path
                <input
                  value={selected.video?.errorPath || ""}
                  onChange={(e) => updateVideo({ errorPath: e.target.value })}
                />
              </label>
            </div>
          </details>
          <div className="api-actions">
            <button onClick={sync}>
              <RefreshCw size={15} /> 获取模型
            </button>
            <button onClick={checkBalance}>
              <CircleDollarSign size={15} /> {balance}
            </button>
            <button
              onClick={async () => {
                try {
                  const result = await getRuntime().testProfile(selected);
                  setNotice(`连接成功 · ${result.modelCount} 个模型`);
                } catch (error) {
                  setNotice((error as Error).message);
                }
              }}
            >
              <Activity size={15} /> 测试连接
            </button>
            <button className="primary" onClick={save}>
              保存档案
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function AdvancedProfileFields({
  draft,
  setDraft,
  setStatus,
}: {
  draft: ApiProfile;
  setDraft: (profile: ApiProfile) => void;
  setStatus: (status: { kind: "ok" | "error"; text: string }) => void;
}) {
  const [headersText, setHeadersText] = useState(() =>
    JSON.stringify(draft.headers, null, 2),
  );
  useEffect(() => {
    setHeadersText(JSON.stringify(draft.headers, null, 2));
  }, [draft.id, draft.headers]);
  const updateVideo = (patch: Partial<NonNullable<ApiProfile["video"]>>) =>
    setDraft({
      ...draft,
      video: {
        model: "",
        submitEndpoint: "/videos",
        statusEndpoint: "/videos/{taskId}",
        taskIdPath: "id",
        statusPath: "status",
        resultUrlPath: "result.url",
        errorPath: "error.message",
        successValues: ["completed", "done"],
        failureValues: ["failed", "error"],
        ...(draft.video || {}),
        ...patch,
      },
    });
  const updateModels = (patch: Partial<NonNullable<ApiProfile["models"]>>) =>
    setDraft({
      ...draft,
      models: {
        endpoint: "/models",
        idPath: "data[*].id",
        ...(draft.models || {}),
        ...patch,
      },
    });
  const updateBalance = (patch: Partial<NonNullable<ApiProfile["balance"]>>) =>
    setDraft({
      ...draft,
      balance: {
        method: "GET",
        endpoint: "/balance",
        amountPath: "data.balance",
        ...(draft.balance || {}),
        ...patch,
      },
    });
  return (
    <details className="advanced-profile">
      <summary>高级端点与字段映射</summary>
      <div className="form-grid">
        <label>
          聊天端点
          <input
            value={draft.chat?.endpoint || ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                chat: {
                  model: "",
                  structuredOutput: "json_object",
                  ...(draft.chat || {}),
                  endpoint: e.target.value,
                },
              })
            }
          />
        </label>
        <label>
          上下文长度
          <input
            type="number"
            value={draft.chat?.contextWindow || ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                chat: {
                  model: "",
                  endpoint: "/chat/completions",
                  structuredOutput: "json_object",
                  ...(draft.chat || {}),
                  contextWindow: Number(e.target.value) || undefined,
                },
              })
            }
          />
        </label>
        <label>
          图片端点
          <input
            value={draft.image?.endpoint || ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                image: {
                  model: "",
                  ...(draft.image || {}),
                  endpoint: e.target.value,
                },
              })
            }
          />
        </label>
        <label>
          模型列表端点
          <input
            value={draft.models?.endpoint || ""}
            onChange={(e) => updateModels({ endpoint: e.target.value })}
          />
        </label>
        <label>
          模型 ID Path
          <input
            value={draft.models?.idPath || ""}
            onChange={(e) => updateModels({ idPath: e.target.value })}
          />
        </label>
        <label>
          上下文长度 Path
          <input
            value={draft.models?.contextPath || ""}
            onChange={(e) => updateModels({ contextPath: e.target.value })}
          />
        </label>
        <label>
          视频提交端点
          <input
            value={draft.video?.submitEndpoint || ""}
            onChange={(e) => updateVideo({ submitEndpoint: e.target.value })}
          />
        </label>
        <label>
          视频状态端点
          <input
            value={draft.video?.statusEndpoint || ""}
            onChange={(e) => updateVideo({ statusEndpoint: e.target.value })}
          />
        </label>
        <label>
          任务 ID Path
          <input
            value={draft.video?.taskIdPath || ""}
            onChange={(e) => updateVideo({ taskIdPath: e.target.value })}
          />
        </label>
        <label>
          任务状态 Path
          <input
            value={draft.video?.statusPath || ""}
            onChange={(e) => updateVideo({ statusPath: e.target.value })}
          />
        </label>
        <label>
          结果 URL Path
          <input
            value={draft.video?.resultUrlPath || ""}
            onChange={(e) => updateVideo({ resultUrlPath: e.target.value })}
          />
        </label>
        <label>
          错误 Path
          <input
            value={draft.video?.errorPath || ""}
            onChange={(e) => updateVideo({ errorPath: e.target.value })}
          />
        </label>
        <label>
          余额端点
          <input
            value={draft.balance?.endpoint || ""}
            onChange={(e) => updateBalance({ endpoint: e.target.value })}
          />
        </label>
        <label>
          余额 Amount Path
          <input
            value={draft.balance?.amountPath || ""}
            onChange={(e) => updateBalance({ amountPath: e.target.value })}
          />
        </label>
        <label>
          余额 Currency Path
          <input
            value={draft.balance?.currencyPath || ""}
            onChange={(e) => updateBalance({ currencyPath: e.target.value })}
          />
        </label>
        <label>
          余额请求方式
          <select
            value={draft.balance?.method || "GET"}
            onChange={(e) =>
              updateBalance({ method: e.target.value as "GET" | "POST" })
            }
          >
            <option>GET</option>
            <option>POST</option>
          </select>
        </label>
        <label className="wide-field">
          额外 Headers (JSON)
          <textarea
            aria-label="额外 Headers (JSON)"
            value={headersText}
            onChange={(e) => setHeadersText(e.target.value)}
            onBlur={() => {
              try {
                const headers = JSON.parse(headersText || "{}");
                if (
                  !headers ||
                  Array.isArray(headers) ||
                  typeof headers !== "object"
                )
                  throw new Error();
                setDraft({ ...draft, headers });
                setStatus({
                  kind: "ok",
                  text: "Headers 已更新，保存档案后生效。",
                });
              } catch {
                setStatus({
                  kind: "error",
                  text: 'Headers 必须是 JSON 对象，例如 {"X-Region":"cn"}。',
                });
              }
            }}
          />
        </label>
      </div>
    </details>
  );
}

function ApiPage({
  state,
  update,
  setNotice,
}: {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  setNotice: (s: string) => void;
}) {
  const [draft, setDraft] = useState<ApiProfile | null>(() =>
    state.profiles[0] ? beginProfileEdit(state.profiles[0]) : null,
  );
  const [apiKey, setApiKey] = useState("");
  const [formStatus, setFormStatus] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const [balance, setBalance] = useState("未查询");
  const [operation, setOperation] = useState<
    "save" | "models" | "test" | "balance" | null
  >(null);
  const presets = listProviderPresets();

  const choosePreset = (providerId: NonNullable<ApiProfile["providerId"]>) => {
    setDraft(createProfileFromPreset(providerId, uid()));
    setApiKey("");
    setFormStatus({
      kind: "ok",
      text: "基础信息已填写，请输入 API Key 后保存。",
    });
  };
  const editSaved = (profile: ApiProfile) => {
    setDraft(beginProfileEdit(profile));
    setApiKey("");
    setFormStatus({ kind: "ok", text: "已进入编辑模式，修改后再次保存即可。" });
  };
  const save = async () => {
    if (!draft || operation) return;
    if (!draft.name.trim() || !draft.baseUrl.trim()) {
      setFormStatus({
        kind: "error",
        text: "供应商名称和 Base URL 不能为空。",
      });
      return;
    }
    setOperation("save");
    try {
      if (apiKey.trim()) await getRuntime().saveApiKey(draft.id, apiKey.trim());
      const profiles = saveProfileDraft(state.profiles, draft);
      let activeSelections = state.activeSelections;
      for (const capability of draft.capabilities)
        if (
          !activeSelections[capability] ||
          (activeSelections[capability]?.profileId === draft.id &&
            !activeSelections[capability]?.model)
        ) {
          activeSelections = setActiveSelection(activeSelections, capability, {
            profileId: draft.id,
            model:
              draft[capability]?.model || draft.cachedModels?.[0]?.id || "",
          });
        }
      const nextState = { ...state, profiles, activeSelections };
      await getRuntime().saveState(nextState);
      update(() => nextState);
      setDraft(beginProfileEdit(draft));
      setApiKey("");
      setFormStatus({ kind: "ok", text: "档案已保存，仍可继续修改。" });
      setNotice("API 档案已保存");
    } catch (error) {
      setFormStatus({ kind: "error", text: (error as Error).message });
    } finally {
      setOperation(null);
    }
  };
  const syncModels = async () => {
    if (!draft || operation) return;
    setOperation("models");
    try {
      if (apiKey.trim()) await getRuntime().saveApiKey(draft.id, apiKey.trim());
      setFormStatus({ kind: "ok", text: "正在获取供应商模型…" });
      const models = await getRuntime().listModels(draft);
      let next = cacheProfileModels(draft, models);
      if (!next.chat?.model && models[0]?.id)
        next = withSelectedModel(next, "chat", models[0].id);
      setDraft(next);
      update((s) => ({
        ...s,
        profiles: saveProfileDraft(s.profiles, next),
        activeSelections:
          next.capabilities.includes("chat") && models[0]?.id
            ? setActiveSelection(s.activeSelections, "chat", {
                profileId: next.id,
                model: next.chat?.model || models[0].id,
              })
            : s.activeSelections,
      }));
      setFormStatus({ kind: "ok", text: `已同步 ${models.length} 个模型。` });
    } catch (error) {
      setFormStatus({ kind: "error", text: (error as Error).message });
    } finally {
      setOperation(null);
    }
  };
  const updateCapabilityModel = (
    capability: "chat" | "image" | "video",
    model: string,
  ) => {
    if (!draft) return;
    if (capability === "chat")
      setDraft({
        ...draft,
        chat: {
          ...(draft.chat || {
            endpoint: "/chat/completions",
            structuredOutput: "json_object",
          }),
          model,
        },
      });
    if (capability === "image")
      setDraft({
        ...draft,
        image: {
          ...(draft.image || { endpoint: "/images/generations" }),
          model,
        },
      });
    if (capability === "video")
      setDraft({
        ...draft,
        video: {
          ...(draft.video || {
            submitEndpoint: "/videos",
            statusEndpoint: "/videos/{taskId}",
            taskIdPath: "id",
            statusPath: "status",
            resultUrlPath: "result.url",
            errorPath: "error.message",
            successValues: ["completed", "done"],
            failureValues: ["failed", "error"],
          }),
          model,
        },
      });
  };
  const testConnection = async () => {
    if (!draft || operation) return;
    setOperation("test");
    try {
      if (apiKey.trim()) await getRuntime().saveApiKey(draft.id, apiKey.trim());
      const result = await getRuntime().testProfile(draft);
      setFormStatus({
        kind: "ok",
        text: `连接成功，接口返回 ${result.modelCount} 个模型。`,
      });
    } catch (error) {
      setFormStatus({ kind: "error", text: (error as Error).message });
    } finally {
      setOperation(null);
    }
  };
  const queryBalance = async () => {
    if (!draft || operation) return;
    setOperation("balance");
    try {
      if (apiKey.trim()) await getRuntime().saveApiKey(draft.id, apiKey.trim());
      const result = await getRuntime().getBalance(draft);
      setBalance(
        result ? `${result.amount} ${result.currency || ""}` : "未配置",
      );
    } catch (error) {
      setFormStatus({ kind: "error", text: (error as Error).message });
    } finally {
      setOperation(null);
    }
  };

  return (
    <section className="page api-layout">
      <div className="profile-list">
        <div className="section-title">
          <h3>已保存档案</h3>
          <button
            disabled={Boolean(operation)}
            title="新建自定义档案"
            onClick={() => choosePreset("custom")}
          >
            <Plus size={14} />
          </button>
        </div>
        {state.profiles.map((profile) => (
          <button
            disabled={Boolean(operation)}
            key={profile.id}
            className={draft?.id === profile.id ? "active" : ""}
            onClick={() => editSaved(profile)}
          >
            <span className="provider-mark">{profile.name.slice(0, 1)}</span>
            <div>
              <b>{profile.name}</b>
              <small>{profile.capabilities.join(" · ")} · 点击编辑</small>
            </div>
          </button>
        ))}
        {!state.profiles.length && (
          <p className="muted">先从右侧选择供应商。</p>
        )}
      </div>
      <div className="settings-form">
        <div className="section-title">
          <div>
            <p className="eyebrow">PROVIDER PRESETS</p>
            <h2>选择供应商</h2>
          </div>
        </div>
        <div className="provider-presets">
          {presets.map((preset) => (
            <button
              disabled={Boolean(operation)}
              key={preset.id}
              onClick={() => choosePreset(preset.id)}
            >
              <b>{preset.name}</b>
              <small>{preset.capabilities.join(" · ")}</small>
            </button>
          ))}
        </div>
        {draft ? (
          <>
            <div className="section-title">
              <div>
                <p className="eyebrow">EDITABLE PROFILE</p>
                <h2>{draft.name}</h2>
              </div>
              <button
                disabled={Boolean(operation)}
                className="danger-button"
                title="删除档案"
                onClick={() => {
                  update((s) => ({
                    ...s,
                    profiles: s.profiles.filter((p) => p.id !== draft.id),
                  }));
                  getRuntime().removeApiKey(draft.id);
                  setDraft(null);
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="form-grid">
              <label>
                档案名称
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label>
                Base URL
                <input
                  value={draft.baseUrl}
                  onChange={(e) =>
                    setDraft({ ...draft, baseUrl: e.target.value })
                  }
                />
              </label>
              <label>
                API Key
                <input
                  type="password"
                  value={apiKey}
                  placeholder="留空表示保留现有密钥"
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </label>
              <label>
                超时 ms
                <input
                  type="number"
                  value={draft.timeoutMs}
                  onChange={(e) =>
                    setDraft({ ...draft, timeoutMs: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <fieldset>
              <legend>接口能力</legend>
              <div className="capabilities">
                {(["chat", "image", "video"] as const).map((capability) => (
                  <label key={capability}>
                    <input
                      type="checkbox"
                      checked={draft.capabilities.includes(capability)}
                      onChange={() =>
                        setDraft({
                          ...draft,
                          capabilities: draft.capabilities.includes(capability)
                            ? draft.capabilities.filter(
                                (item) => item !== capability,
                              )
                            : [...draft.capabilities, capability],
                        })
                      }
                    />
                    {capability}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="form-grid model-config-grid">
              {draft.capabilities.map((capability) => (
                <div className="model-config" key={capability}>
                  <label>
                    {capability} 模型
                    <ModelPicker
                      ariaLabel={`${capability} 模型`}
                      models={draft.cachedModels || []}
                      value={draft[capability]?.model || ""}
                      onChange={(model) =>
                        updateCapabilityModel(capability, model)
                      }
                    />
                  </label>
                  {capability === "chat" && (
                    <label className="context-declaration">
                      <input
                        type="checkbox"
                        aria-label="声明支持 1M"
                        disabled={!draft.chat?.model}
                        checked={
                          draft.cachedModels?.find(
                            ({ id }) => id === draft.chat?.model,
                          )?.declaredContextWindow === ONE_MILLION_TOKENS
                        }
                        onChange={(event) =>
                          setDraft(
                            setDeclaredContextWindow(
                              draft,
                              draft.chat?.model || "",
                              event.target.checked,
                            ),
                          )
                        }
                      />
                      声明支持 1M
                    </label>
                  )}
                </div>
              ))}
            </div>
            <AdvancedProfileFields
              draft={draft}
              setDraft={setDraft}
              setStatus={setFormStatus}
            />
            <div
              className={`inline-status ${formStatus?.kind === "error" ? "error" : ""}`}
            >
              {formStatus?.text || "所有字段保存后仍可再次编辑。"}
            </div>
            <div className="api-actions">
              <button disabled={Boolean(operation)} onClick={syncModels}>
                <RefreshCw
                  className={operation === "models" ? "spin" : ""}
                  size={15}
                />
                {operation === "models" ? "获取中…" : "获取模型"}
              </button>
              <button disabled={Boolean(operation)} onClick={testConnection}>
                <Activity size={15} />
                {operation === "test" ? "测试中…" : "测试连接"}
              </button>
              <button disabled={Boolean(operation)} onClick={queryBalance}>
                <CircleDollarSign size={15} />
                {operation === "balance" ? "查询中…" : balance}
              </button>
              <button
                disabled={Boolean(operation)}
                onClick={() => {
                  const saved = state.profiles.find(
                    (item) => item.id === draft.id,
                  );
                  if (saved) setDraft(discardProfileDraft(saved));
                  else setDraft(null);
                  setFormStatus(null);
                }}
              >
                放弃修改
              </button>
              <button
                className="primary"
                disabled={Boolean(operation)}
                onClick={save}
              >
                {operation === "save" ? "保存中…" : "保存档案"}
              </button>
            </div>
          </>
        ) : (
          <div className="muted">
            选择上方供应商，基础地址和端点会自动填写。
          </div>
        )}
      </div>
    </section>
  );
}

function HistoryPage({
  state,
  update,
  setNotice,
}: {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  setNotice: (s: string) => void;
}) {
  const totals = Object.values(state.tokenTotals).reduce(
    (sum, item) => ({
      input: sum.input + item.input,
      output: sum.output + item.output,
    }),
    { input: 0, output: 0 },
  );
  const chooseArchiveDirectory = () => {
    const directory = selectCepDirectory();
    if (!directory) {
      setNotice("未选择归档目录");
      return;
    }
    update((s) => ({ ...s, archiveDirectory: directory }));
    setNotice(`对话将归档到：${directory}`);
  };
  return (
    <section className="page">
      <div className="archive-location">
        <div className="section-title">
          <div>
            <p className="eyebrow">CONVERSATION ARCHIVE</p>
            <h3>对话归档目录</h3>
          </div>
          <button onClick={chooseArchiveDirectory}>选择目录</button>
        </div>
        <code>
          {state.archiveDirectory || "尚未设置；归档时不会自动回退到 C 盘。"}
        </code>
        <small className="muted">
          完整对话保存为 UTF-8 Markdown；系统状态只保留标题、摘要和外部路径。API
          密钥仍由 Windows DPAPI 加密。
        </small>
      </div>
      <div className="stat-grid">
        <div>
          <span>会话</span>
          <b>{state.conversations.length}</b>
          <MessageSquare />
        </div>
        <div>
          <span>生成任务</span>
          <b>{state.tasks.length}</b>
          <Boxes />
        </div>
        <div>
          <span>输入 Tokens</span>
          <b>{totals.input.toLocaleString()}</b>
          <Activity />
        </div>
        <div>
          <span>输出 Tokens</span>
          <b>{totals.output.toLocaleString()}</b>
          <Bot />
        </div>
      </div>
      <div className="history-columns">
        <div>
          <h3>会话归档</h3>
          {state.conversations.map((item) => (
            <article key={item.id}>
              <span>{item.archived ? "已归档" : "当前"}</span>
              <b>{item.title}</b>
              <small>
                {item.archivePath ||
                  `${item.messages.length} 条消息 · ${new Date(item.createdAt).toLocaleString()}`}
              </small>
            </article>
          ))}
        </div>
        <div>
          <h3>素材记录</h3>
          {state.tasks.map((item) => (
            <article key={item.id}>
              <span>{item.status}</span>
              <b>{item.type === "image" ? "图片" : "视频"}</b>
              <small>{item.localPath || item.error || item.prompt}</small>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

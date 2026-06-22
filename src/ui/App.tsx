import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Bot, Boxes, CircleDollarSign, FileText, History, KeyRound, Library, LoaderCircle, MessageSquare, Play, Plus, RefreshCw, Send, Settings2, Sparkles, Trash2, WandSparkles } from 'lucide-react';
import { createDefaultState, upsertById, type AppState, type Conversation } from '../shared/appState';
import { ACTION_SYSTEM_PROMPT, parseActionResponse } from '../shared/actionResponse';
import { requiresDangerConfirmation, type AeActionPlan } from '../shared/actionProtocol';
import { contextStatus } from '../shared/context';
import { estimateMessages } from '../shared/tokenUsage';
import { extractTemplateVariables, renderTemplate } from '../shared/templates';
import type { ApiProfile, ContextProfile, MediaTask, PromptTemplate } from '../shared/types';
import { getRuntime, hostBridge, type ProjectContext } from '../cep/bridge';

type Tab = 'chat' | 'media' | 'templates' | 'api' | 'history';
const tabs: Array<{ id: Tab; label: string; icon: typeof Bot }> = [
  { id: 'chat', label: '对话', icon: MessageSquare }, { id: 'media', label: '生成', icon: Sparkles }, { id: 'templates', label: '模板', icon: Library }, { id: 'api', label: 'API', icon: KeyRound }, { id: 'history', label: '历史', icon: History },
];
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();

export function App() {
  const runtime = useMemo(() => getRuntime(), []);
  const [tab, setTab] = useState<Tab>('chat');
  const [state, setState] = useState<AppState>(createDefaultState());
  const [project, setProject] = useState<ProjectContext | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('正在连接 After Effects…');

  useEffect(() => { Promise.all([runtime.getState(), hostBridge.getProjectContext()]).then(([stored, context]) => { setState(stored); setProject(context); setNotice(hostBridge.isCep() ? 'AE 已连接' : '浏览器开发预览'); setReady(true); }).catch((error) => setNotice(error.message)); }, [runtime]);
  useEffect(() => { if (ready) runtime.saveState(state).catch((error) => setNotice(`保存失败：${error.message}`)); }, [ready, runtime, state]);
  const update = useCallback((change: (current: AppState) => AppState) => setState((current) => change(current)), []);

  return <div className="shell">
    <aside className="rail">
      <div className="brand"><span>Ai</span><i /></div>
      <nav>{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} title={label}><Icon size={18} /><small>{label}</small></button>)}</nav>
      <div className={`host-dot ${hostBridge.isCep() ? 'online' : ''}`} title={notice}><Activity size={16} /></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><div><p className="eyebrow">AE AI ASSISTANT / 0.1</p><h1>{tabs.find((item) => item.id === tab)?.label}</h1></div><div className="project-chip"><span className="pulse" /><div><b>{project?.projectName || '未连接工程'}</b><small>{project?.activeComp ? `${project.activeComp.name} · ${project.activeComp.layerCount} 层` : notice}</small></div></div></header>
      {!ready ? <div className="center"><LoaderCircle className="spin" /> 正在载入工作区</div> : <>
        {tab === 'chat' && <ChatPage state={state} update={update} project={project!} setNotice={setNotice} />}
        {tab === 'media' && <MediaPage state={state} update={update} project={project!} setNotice={setNotice} />}
        {tab === 'templates' && <TemplatesPage state={state} update={update} onUse={(template) => { sessionStorage.setItem('ae-ai-template', template.body); setTab(template.target === 'ae' ? 'chat' : 'media'); }} />}
        {tab === 'api' && <ApiPage state={state} update={update} setNotice={setNotice} />}
        {tab === 'history' && <HistoryPage state={state} />}
      </>}
      <footer className="statusline"><span>{notice}</span><span>{hostBridge.isCep() ? 'CEP · AE 25/26' : 'DEV PREVIEW'}</span></footer>
    </main>
  </div>;
}

function ChatPage({ state, update, project, setNotice }: { state: AppState; update: (fn: (s: AppState) => AppState) => void; project: ProjectContext; setNotice: (s: string) => void }) {
  const runtime = getRuntime();
  const [prompt, setPrompt] = useState(() => sessionStorage.getItem('ae-ai-template') || '');
  const [busy, setBusy] = useState(false); const [stream, setStream] = useState(''); const [plan, setPlan] = useState<AeActionPlan | null>(null);
  const [selectedContexts, setSelectedContexts] = useState<string[]>(state.contexts.map(({ id }) => id));
  const [contextEditor, setContextEditor] = useState(false);
  const profile = state.profiles.find(({ id }) => id === state.defaultProfiles.chat);
  const conversation = state.conversations.find(({ archived }) => !archived);
  const injected = state.contexts.filter(({ id }) => selectedContexts.includes(id));
  const estimated = estimateMessages([{ role: 'system', content: ACTION_SYSTEM_PROMPT }, ...injected.map(({ content }) => ({ role: 'system' as const, content })), ...(conversation?.messages ?? []), { role: 'user', content: prompt }]);
  const budget = contextStatus(estimated, profile?.chat?.contextWindow);

  async function send() {
    if (!profile) { setNotice('请先在 API 管理中配置并启用聊天档案'); return; }
    if (!prompt.trim() || budget.level === 'blocked') return;
    setBusy(true); setStream(''); setPlan(null); setNotice('正在请求模型…');
    const active: Conversation = conversation ?? { id: uid(), title: prompt.slice(0, 24), messages: [], contextProfileIds: selectedContexts, archived: false, createdAt: now() };
    const messages = [{ role: 'system' as const, content: ACTION_SYSTEM_PROMPT }, { role: 'system' as const, content: `当前 AE 工程上下文：${JSON.stringify(project)}` }, ...injected.map(({ name, content }) => ({ role: 'system' as const, content: `上下文档案「${name}」：\n${content}` })), ...active.messages.map(({ role, content }) => ({ role, content })), { role: 'user' as const, content: prompt }];
    let text = ''; let usage = { input: estimated, output: 0, estimated: true };
    try {
      await runtime.chat(profile, messages, (event) => { if (event.type === 'text') { text += event.text; setStream(text); } if (event.type === 'usage') usage = { input: event.input, output: event.output, estimated: false }; });
      try { setPlan(parseActionResponse(text)); } catch { /* ordinary assistant response remains visible */ }
      const nextConversation = { ...active, contextProfileIds: selectedContexts, messages: [...active.messages, { role: 'user' as const, content: prompt }, { role: 'assistant' as const, content: text, usage }] };
      update((s) => ({ ...s, conversations: upsertById(s.conversations, nextConversation), tokenTotals: { ...s.tokenTotals, [`${profile.id}:${profile.chat!.model}`]: { input: (s.tokenTotals[`${profile.id}:${profile.chat!.model}`]?.input || 0) + usage.input, output: (s.tokenTotals[`${profile.id}:${profile.chat!.model}`]?.output || 0) + usage.output } } }));
      setPrompt(''); sessionStorage.removeItem('ae-ai-template'); setNotice('模型响应完成');
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }

  async function execute() {
    if (!plan || !confirm(`执行 ${plan.actions.length} 个 AE 动作？\n${plan.summary}`)) return;
    if (requiresDangerConfirmation(plan.actions) && !confirm('此计划会删除图层或关键帧。再次确认执行危险操作？')) return;
    try { await hostBridge.executePlan(plan); setPlan(null); setNotice('AE 动作已执行，可使用 Ctrl+Z 一次撤销'); } catch (error) { setNotice((error as Error).message); }
  }

  async function archiveWithSummary() {
    if (!conversation || !profile || !confirm('调用当前模型生成交接摘要，并将旧会话归档到下一段对话？')) return;
    setBusy(true); setNotice('正在生成上下文交接摘要…');
    let summary = '';
    try {
      await runtime.chat(profile, [{ role: 'system', content: '请把以下对话压缩为结构化 JSON，字段为 goal、decisions、aeState、nextSteps、constraints。保留精确名称和数值，不执行 AE 动作。' }, { role: 'user', content: conversation.messages.map((m) => `${m.role}: ${m.content}`).join('\n') }], (event) => { if (event.type === 'text') summary += event.text; });
      const next: Conversation = { id: uid(), title: `${conversation.title} · 续`, messages: [{ role: 'system', content: `上一会话交接摘要：\n${summary}` }], contextProfileIds: selectedContexts, archived: false, createdAt: now() };
      update((s) => ({ ...s, conversations: [...s.conversations.map((c) => c.id === conversation.id ? { ...c, archived: true } : c), next] }));
      setNotice('旧会话已归档，AI 交接摘要已带入新会话');
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }

  return <section className="page chat-layout"><div className="context-bar"><div><span>上下文</span><b>{estimated.toLocaleString()} / {profile?.chat?.contextWindow?.toLocaleString() || '未知'} tokens</b></div><div className="meter"><i style={{ width: `${budget.percent}%` }} className={budget.level} /></div><em>{budget.percent || 0}%</em>{budget.level === 'warning' || budget.level === 'blocked' ? <button onClick={archiveWithSummary}>压缩并续聊</button> : null}</div>
    <div className="context-pills"><button onClick={() => setContextEditor(!contextEditor)}><FileText size={14} /> 上下文档案</button>{state.contexts.map((item) => <label key={item.id} className={selectedContexts.includes(item.id) ? 'selected' : ''}><input type="checkbox" checked={selectedContexts.includes(item.id)} onChange={() => setSelectedContexts((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} />{item.name}</label>)}</div>
    {contextEditor && <ContextEditor state={state} update={update} />}
    <div className="conversation"><div className="empty-mark"><Bot size={24} /><div><b>{conversation ? conversation.title : '准备操作 AE'}</b><span>描述你想创建或修改的内容，AI 会先生成可审查的动作计划。</span></div></div>{conversation?.messages.map((message, index) => <article key={index} className={`message ${message.role}`}><small>{message.role === 'user' ? '你' : message.role === 'assistant' ? 'AI' : '上下文'}</small><p>{message.content}</p>{message.usage && <em>↑ {message.usage.input} · ↓ {message.usage.output} {message.usage.estimated ? '估算' : ''}</em>}</article>)}{stream && busy && <article className="message assistant"><small>AI · STREAMING</small><p>{stream}</p></article>}
    {plan && <div className="plan-card"><div><WandSparkles size={18} /><b>{plan.summary}</b><span className={`risk ${plan.risk}`}>{plan.risk}</span></div><ol>{plan.actions.map((action, index) => <li key={index} className={action.type.includes('delete') ? 'danger' : ''}><code>{action.type}</code><span>{JSON.stringify(action).slice(0, 100)}</span></li>)}</ol><button className="primary" onClick={execute}><Play size={16} /> 确认执行</button></div>}</div>
    <div className="composer"><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="例如：创建一个 5 秒片头，标题从下方淡入…" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} /><button className="send" disabled={busy || !prompt.trim() || budget.level === 'blocked'} onClick={send}>{busy ? <LoaderCircle className="spin" /> : <Send />}</button><small>Ctrl + Enter 发送 · 所有 AE 动作先预览</small></div></section>;
}

function ContextEditor({ state, update }: { state: AppState; update: (fn: (s: AppState) => AppState) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null); const [name, setName] = useState('项目背景'); const [content, setContent] = useState('');
  const save = () => { if (!name.trim() || !content.trim()) return; const item: ContextProfile = { id: editingId || uid(), name, content, updatedAt: now() }; update((s) => ({ ...s, contexts: upsertById(s.contexts, item) })); setContent(''); setEditingId(null); };
  const edit = (item: ContextProfile) => { setEditingId(item.id); setName(item.name); setContent(item.content); };
  const importMd = async (files: FileList | null) => { if (!files) return; const imported = await Promise.all([...files].map(async (file) => ({ id: uid(), name: file.name.replace(/\.md$/i, ''), content: await file.text(), updatedAt: now() }))); update((s) => ({ ...s, contexts: [...s.contexts, ...imported] })); };
  const exportMd = (item: ContextProfile) => { const url = URL.createObjectURL(new Blob([item.content], { type: 'text/markdown;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${item.name}.md`; anchor.click(); URL.revokeObjectURL(url); };
  return <div className="inline-editor"><div className="context-manager">{state.contexts.map((item) => <span key={item.id}><button onClick={() => edit(item)}>{item.name}</button><button title="导出" onClick={() => exportMd(item)}>↓</button><button title="删除" onClick={() => update((s) => ({ ...s, contexts: s.contexts.filter((x) => x.id !== item.id) }))}>×</button></span>)}<label className="file-button">导入 .md<input type="file" accept=".md,text/markdown" multiple onChange={(e) => importMd(e.target.files)} /></label></div><input value={name} onChange={(e) => setName(e.target.value)} /><textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="粘贴或编写每次对话都需要知道的 Markdown…" /><button onClick={save}><Plus size={14} /> {editingId ? '更新' : '保存'} MD 档案</button></div>;
}

function MediaPage({ state, update, project, setNotice }: { state: AppState; update: (fn: (s: AppState) => AppState) => void; project: ProjectContext; setNotice: (s: string) => void }) {
  const [kind, setKind] = useState<'image' | 'video'>('image'); const [prompt, setPrompt] = useState(() => sessionStorage.getItem('ae-ai-template') || ''); const [busy, setBusy] = useState(false); const [ratio, setRatio] = useState('16:9'); const [duration, setDuration] = useState(5);
  const profile = state.profiles.find(({ id }) => id === state.defaultProfiles[kind]);
  const output = project.projectPath ? project.projectPath.replace(/[\\/][^\\/]+$/, '') : '';
  useEffect(() => {
    const pending = state.tasks.filter((task) => task.type === 'video' && task.status === 'polling' && task.remoteTaskId);
    if (!pending.length) return;
    let stopped = false;
    const resume = async () => { for (const task of pending) { const taskProfile = state.profiles.find((item) => item.id === task.profileId); if (!taskProfile || stopped) continue; try { const result = await getRuntime().pollVideo(taskProfile, task.remoteTaskId!); if (result.state === 'ready') { update((s) => ({ ...s, tasks: s.tasks.map((item) => item.id === task.id ? { ...item, status: 'downloading', remoteUrl: result.url, updatedAt: now() } : item) })); setNotice('恢复的视频任务已完成，等待你确认下载并导入'); } else if (result.state === 'failed') update((s) => ({ ...s, tasks: s.tasks.map((item) => item.id === task.id ? { ...item, status: 'failed', error: result.error, updatedAt: now() } : item) })); } catch (error) { setNotice(`恢复任务失败：${(error as Error).message}`); } } };
    resume(); const timer = setInterval(resume, 10000); return () => { stopped = true; clearInterval(timer); };
  }, [state.profiles, state.tasks, update, setNotice]);
  async function importPath(path: string) { const context = await hostBridge.getProjectContext(); await hostBridge.executePlan({ version: 'ae-actions/v1', summary: '导入 AI 生成素材', risk: 'low', projectRevision: context.revision, actions: [{ type: 'footage.import', path }] }); }
  async function generate() {
    if (!profile) return setNotice(`请先配置并启用${kind === 'image' ? '图片' : '视频'} API 档案`); if (!output) return setNotice('请先保存 AE 工程，以确定素材目录');
    setBusy(true); const task: MediaTask = { id: uid(), type: kind, profileId: profile.id, prompt, status: 'submitting', createdAt: now(), updatedAt: now() }; update((s) => ({ ...s, tasks: [task, ...s.tasks] }));
    try {
      let path = '';
      if (kind === 'image') path = await getRuntime().generateImage(profile, prompt, ratio === '1:1' ? '1024x1024' : '1536x1024', output);
      else {
        const taskId = await getRuntime().submitVideo(profile, prompt, ratio, duration); update((s) => ({ ...s, tasks: s.tasks.map((item) => item.id === task.id ? { ...item, status: 'polling', remoteTaskId: taskId, updatedAt: now() } : item) })); let status;
        do { await new Promise((resolve) => setTimeout(resolve, 5000)); status = await getRuntime().pollVideo(profile, taskId); setNotice('视频生成中，正在轮询任务…'); } while (status.state === 'polling');
        if (status.state === 'failed') throw new Error(status.error || '视频生成失败'); path = await getRuntime().download(status.url!, output);
      }
      await importPath(path); update((s) => ({ ...s, tasks: s.tasks.map((item) => item.id === task.id ? { ...item, status: 'completed', localPath: path, updatedAt: now() } : item) })); setNotice('素材已生成并导入 AE'); setPrompt(''); sessionStorage.removeItem('ae-ai-template');
    } catch (error) { update((s) => ({ ...s, tasks: s.tasks.map((item) => item.id === task.id ? { ...item, status: 'failed', error: (error as Error).message, updatedAt: now() } : item) })); setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function finishRecovered(task: MediaTask) { if (!task.remoteUrl || !output) return; try { const path = await getRuntime().download(task.remoteUrl, output); await importPath(path); update((s) => ({ ...s, tasks: s.tasks.map((item) => item.id === task.id ? { ...item, status: 'completed', localPath: path, updatedAt: now() } : item) })); setNotice('恢复任务的素材已下载并导入'); } catch (error) { setNotice((error as Error).message); } }
  return <section className="page media-page"><div className="segmented"><button className={kind === 'image' ? 'active' : ''} onClick={() => setKind('image')}>图片</button><button className={kind === 'video' ? 'active' : ''} onClick={() => setKind('video')}>视频</button></div><div className="hero-card"><span className="serial">GEN / {kind === 'image' ? 'STILL' : 'MOTION'}</span><h2>{kind === 'image' ? '生成静帧素材' : '生成动态素材'}</h2><p>生成结果会保存到工程旁的 AI Generated 目录，并自动进入项目面板。</p><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="描述画面、风格、构图、光线和运动…" /><div className="form-grid"><label>画面比例<select value={ratio} onChange={(e) => setRatio(e.target.value)}><option>16:9</option><option>9:16</option><option>1:1</option><option>4:3</option></select></label>{kind === 'video' && <label>时长（秒）<input type="number" min="1" max="30" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></label>}<label>使用档案<input value={profile?.name || '未配置'} disabled /></label></div><button className="primary large" disabled={busy || !prompt.trim()} onClick={generate}>{busy ? <LoaderCircle className="spin" /> : <Sparkles />} {busy ? '生成中…' : '开始生成并导入'}</button></div><TaskList tasks={state.tasks} onFinish={finishRecovered} /></section>;
}

function TaskList({ tasks, onFinish }: { tasks: MediaTask[]; onFinish: (task: MediaTask) => void }) { return <div className="task-list"><h3>最近任务</h3>{tasks.slice(0, 5).map((task) => <div className="task" key={task.id}><span className={`task-status ${task.status}`} /><div><b>{task.type === 'image' ? '图片' : '视频'} · {task.status}</b><small>{task.prompt}</small></div>{task.status === 'downloading' && task.remoteUrl ? <button onClick={() => onFinish(task)}>下载并导入</button> : <time>{new Date(task.updatedAt).toLocaleTimeString()}</time>}</div>)}{!tasks.length && <p className="muted">还没有生成任务。</p>}</div>; }

function TemplatesPage({ state, update, onUse }: { state: AppState; update: (fn: (s: AppState) => AppState) => void; onUse: (t: PromptTemplate) => void }) {
  const [editing, setEditing] = useState<PromptTemplate | null>(null); const [values, setValues] = useState<Record<string, string>>({});
  const open = (item: PromptTemplate) => { setEditing(item); setValues(Object.fromEntries(item.variables.map((key) => [key, '']))); };
  const use = () => { if (!editing) return; try { onUse({ ...editing, body: renderTemplate(editing.body, values) }); } catch (error) { alert((error as Error).message); } };
  return <section className="page"><div className="section-title"><div><p className="eyebrow">PROMPT LIBRARY</p><h2>把重复描述变成工具</h2></div><button onClick={() => setEditing({ id: uid(), title: '新模板', category: '自定义', target: 'ae', body: '', variables: [], builtin: false })}><Plus size={15} /> 新建</button></div><div className="template-grid">{state.templates.map((item) => <button key={item.id} className="template-card" onClick={() => open(item)}><span>{item.category}</span><h3>{item.title}</h3><p>{item.body}</p><em>{item.target.toUpperCase()} · {item.variables.length} 参数</em></button>)}</div>{editing && <div className="drawer"><div className="drawer-head"><h3>{editing.title}</h3><button onClick={() => setEditing(null)}>×</button></div><label>标题<input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label><label>提示词<textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value, variables: extractTemplateVariables(e.target.value) })} /></label>{editing.variables.map((key) => <label key={key}>{key}<input value={values[key] || ''} onChange={(e) => setValues({ ...values, [key]: e.target.value })} /></label>)}<div className="drawer-actions">{!editing.builtin && <button onClick={() => { update((s) => ({ ...s, templates: upsertById(s.templates, editing) })); setEditing(null); }}>保存模板</button>}<button className="primary" onClick={use}>填充并使用</button></div></div>}</section>;
}

function ApiPage({ state, update, setNotice }: { state: AppState; update: (fn: (s: AppState) => AppState) => void; setNotice: (s: string) => void }) {
  const blank = (): ApiProfile => ({ id: uid(), name: '新 API 档案', baseUrl: 'https://api.openai.com/v1', timeoutMs: 120000, capabilities: ['chat'], headers: {}, chat: { model: '', endpoint: '/chat/completions', structuredOutput: 'json_object', contextWindow: 128000 }, models: { endpoint: '/models', idPath: 'data[*].id', contextPath: 'data[*].context_length' } });
  const [selected, setSelected] = useState<ApiProfile | null>(state.profiles[0] || null); const [key, setKey] = useState(''); const [models, setModels] = useState<Array<{ id: string; contextWindow?: number }>>([]); const [balance, setBalance] = useState<string>('未查询');
  const save = async () => { if (!selected) return; update((s) => ({ ...s, profiles: upsertById(s.profiles, selected), defaultProfiles: { ...s.defaultProfiles, ...Object.fromEntries(selected.capabilities.map((cap) => [cap, s.defaultProfiles[cap] || selected.id])) } })); if (key) { await getRuntime().saveApiKey(selected.id, key); setKey(''); } setNotice('API 档案已安全保存'); };
  const sync = async () => { if (!selected) return; try { const list = await getRuntime().listModels(selected); setModels(list); setNotice(`已获取 ${list.length} 个模型`); } catch (error) { setNotice((error as Error).message); } };
  const checkBalance = async () => { if (!selected) return; try { const result = await getRuntime().getBalance(selected); setBalance(result ? `${result.amount} ${result.currency || ''}` : '未配置'); } catch (error) { setBalance('查询失败'); setNotice((error as Error).message); } };
  const updateVideo = (change: Partial<NonNullable<ApiProfile['video']>>) => setSelected({ ...selected!, video: { model: '', submitEndpoint: '/videos', statusEndpoint: '/videos/{taskId}', taskIdPath: 'id', statusPath: 'status', resultUrlPath: 'result.url', errorPath: 'error.message', successValues: ['completed', 'done', 'succeeded'], failureValues: ['failed', 'error'], ...(selected!.video || {}), ...change } });
  return <section className="page api-layout"><div className="profile-list"><div className="section-title"><h3>API 档案</h3><button onClick={() => setSelected(blank())}><Plus size={14} /></button></div>{state.profiles.map((profile) => <button key={profile.id} className={selected?.id === profile.id ? 'active' : ''} onClick={() => setSelected(profile)}><span className="provider-mark">{profile.name.slice(0, 1)}</span><div><b>{profile.name}</b><small>{profile.capabilities.join(' · ')}</small></div></button>)}{!state.profiles.length && <p className="muted">创建第一个兼容接口档案。</p>}</div>{selected && <div className="settings-form"><div className="section-title"><div><p className="eyebrow">PROVIDER PROFILE</p><h2>{selected.name}</h2></div><button className="danger-button" onClick={() => { update((s) => ({ ...s, profiles: s.profiles.filter((p) => p.id !== selected.id) })); getRuntime().removeApiKey(selected.id); setSelected(null); }}><Trash2 size={15} /></button></div><div className="form-grid"><label>档案名称<input value={selected.name} onChange={(e) => setSelected({ ...selected, name: e.target.value })} /></label><label>Base URL<input value={selected.baseUrl} onChange={(e) => setSelected({ ...selected, baseUrl: e.target.value })} /></label><label>API Key<input type="password" value={key} placeholder="已保存时留空不变" onChange={(e) => setKey(e.target.value)} /></label><label>超时 ms<input type="number" value={selected.timeoutMs} onChange={(e) => setSelected({ ...selected, timeoutMs: Number(e.target.value) })} /></label></div><fieldset><legend>能力</legend><div className="capabilities">{(['chat', 'image', 'video'] as const).map((cap) => <label key={cap}><input type="checkbox" checked={selected.capabilities.includes(cap)} onChange={() => setSelected({ ...selected, capabilities: selected.capabilities.includes(cap) ? selected.capabilities.filter((x) => x !== cap) : [...selected.capabilities, cap] })} />{cap}</label>)}</div></fieldset><div className="form-grid"><label>聊天模型<input value={selected.chat?.model || ''} onChange={(e) => setSelected({ ...selected, chat: { ...(selected.chat || { endpoint: '/chat/completions', structuredOutput: 'json_object' }), model: e.target.value } })} list="models" /></label><label>上下文长度<input type="number" value={selected.chat?.contextWindow || ''} onChange={(e) => setSelected({ ...selected, chat: { ...(selected.chat || { model: '', endpoint: '/chat/completions', structuredOutput: 'json_object' }), contextWindow: Number(e.target.value) } })} /></label><label>图片模型<input value={selected.image?.model || ''} onChange={(e) => setSelected({ ...selected, image: { model: e.target.value, endpoint: selected.image?.endpoint || '/images/generations' } })} /></label><label>视频模型<input value={selected.video?.model || ''} onChange={(e) => updateVideo({ model: e.target.value })} /></label></div><datalist id="models">{models.map((model) => <option key={model.id} value={model.id}>{model.contextWindow}</option>)}</datalist><details><summary><Settings2 size={15} /> 高级端点映射</summary><div className="form-grid"><label>模型端点<input value={selected.models?.endpoint || ''} onChange={(e) => setSelected({ ...selected, models: { idPath: 'data[*].id', ...(selected.models || {}), endpoint: e.target.value } })} /></label><label>模型 ID Path<input value={selected.models?.idPath || ''} onChange={(e) => setSelected({ ...selected, models: { endpoint: '/models', ...(selected.models || {}), idPath: e.target.value } })} /></label><label>余额端点<input value={selected.balance?.endpoint || ''} onChange={(e) => setSelected({ ...selected, balance: { method: 'GET', amountPath: 'data.balance', ...(selected.balance || {}), endpoint: e.target.value } })} /></label><label>余额 Amount Path<input value={selected.balance?.amountPath || ''} onChange={(e) => setSelected({ ...selected, balance: { method: 'GET', endpoint: '/balance', ...(selected.balance || {}), amountPath: e.target.value } })} /></label><label>视频提交端点<input value={selected.video?.submitEndpoint || ''} onChange={(e) => updateVideo({ submitEndpoint: e.target.value })} /></label><label>视频状态端点<input value={selected.video?.statusEndpoint || ''} onChange={(e) => updateVideo({ statusEndpoint: e.target.value })} /></label><label>任务 ID Path<input value={selected.video?.taskIdPath || ''} onChange={(e) => updateVideo({ taskIdPath: e.target.value })} /></label><label>状态 Path<input value={selected.video?.statusPath || ''} onChange={(e) => updateVideo({ statusPath: e.target.value })} /></label><label>结果 URL Path<input value={selected.video?.resultUrlPath || ''} onChange={(e) => updateVideo({ resultUrlPath: e.target.value })} /></label><label>错误 Path<input value={selected.video?.errorPath || ''} onChange={(e) => updateVideo({ errorPath: e.target.value })} /></label></div></details><div className="api-actions"><button onClick={sync}><RefreshCw size={15} /> 获取模型</button><button onClick={checkBalance}><CircleDollarSign size={15} /> {balance}</button><button onClick={async () => { try { const result = await getRuntime().testProfile(selected); setNotice(`连接成功 · ${result.modelCount} 个模型`); } catch (error) { setNotice((error as Error).message); } }}><Activity size={15} /> 测试连接</button><button className="primary" onClick={save}>保存档案</button></div></div>}</section>;
}

function HistoryPage({ state }: { state: AppState }) {
  const totals = Object.values(state.tokenTotals).reduce((sum, item) => ({ input: sum.input + item.input, output: sum.output + item.output }), { input: 0, output: 0 });
  return <section className="page"><div className="stat-grid"><div><span>会话</span><b>{state.conversations.length}</b><MessageSquare /></div><div><span>生成任务</span><b>{state.tasks.length}</b><Boxes /></div><div><span>输入 Tokens</span><b>{totals.input.toLocaleString()}</b><Activity /></div><div><span>输出 Tokens</span><b>{totals.output.toLocaleString()}</b><Bot /></div></div><div className="history-columns"><div><h3>会话归档</h3>{state.conversations.map((item) => <article key={item.id}><span>{item.archived ? '已归档' : '当前'}</span><b>{item.title}</b><small>{item.messages.length} 条消息 · {new Date(item.createdAt).toLocaleString()}</small></article>)}</div><div><h3>素材记录</h3>{state.tasks.map((item) => <article key={item.id}><span>{item.status}</span><b>{item.type === 'image' ? '图片' : '视频'}</b><small>{item.localPath || item.error || item.prompt}</small></article>)}</div></div></section>;
}

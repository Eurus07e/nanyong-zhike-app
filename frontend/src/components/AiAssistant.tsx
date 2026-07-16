import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Bot, KeyRound, LoaderCircle, RotateCcw, Send, ShieldCheck, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api, ApiError } from '../api'
import type { AiChatMessage, AiChatResponse } from '../types'

type TranscriptItem = AiChatMessage & { sources?: AiChatResponse['sources'] }

type AiConnection = {
  endpoint: string
  model: string
  apiKey: string
}

const AI_CONNECTION_STORAGE_KEY = 'nanyong-ai-connection:v1'
const DEFAULT_ENDPOINT = 'https://api.deepseek.com/chat/completions'
const DEFAULT_MODEL = 'deepseek-v4-pro'

function loadAiConnection(): AiConnection {
  const fallback = { endpoint: DEFAULT_ENDPOINT, model: DEFAULT_MODEL, apiKey: '' }
  if (typeof window === 'undefined') return fallback
  try {
    const saved = JSON.parse(window.localStorage.getItem(AI_CONNECTION_STORAGE_KEY) ?? '{}') as Partial<AiConnection>
    return {
      endpoint: typeof saved.endpoint === 'string' && saved.endpoint.trim() ? saved.endpoint : fallback.endpoint,
      model: typeof saved.model === 'string' && saved.model.trim() ? saved.model : fallback.model,
      apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : '',
    }
  } catch {
    return fallback
  }
}

const suggestedPromptPool = [
  '我还缺哪些培养方案学分？',
  '帮我看看下学期课表有没有时间冲突。',
  '最近有哪些重要通知值得关注？',
  '我的大学英语和体育课认定完成了吗？',
  '五育活动里我参与了哪些项目？',
  '第二课堂目前有多少活动和服务时长？',
  '我的课表哪几天最忙？',
  '最近有哪些通知和我的年级有关？',
  '根据培养方案，我下学期适合修哪些课程？',
  '帮我总结这学期的成绩表现。',
  '我还有哪些通识课程要求没有完成？',
  '最近有什么值得关注的校园事项？',
]

function pickSuggestedPrompts() {
  const shuffled = [...suggestedPromptPool]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }
  return shuffled.slice(0, 3)
}

const emptyMessages = [
  { title: '问问你的南大资讯', description: '回答将会标注所使用的数据来源。' },
  { title: '整合南大资讯，赋能每一个人', description: '回答将会标注所使用的数据来源。' },
  { title: '探索未至之境', description: '回答将会标注所使用的数据来源。' },
  { title: '让 AI 惠及所有人', description: '回答将会标注所使用的数据来源。' },
  { title: '发现南大生活的更多可能', description: '回答将会标注所使用的数据来源。' },
  { title: '让每一次查询都更有价值', description: '回答将会标注所使用的数据来源。' },
  { title: '把复杂信息，变成清晰答案', description: '回答将会标注所使用的数据来源。' },
  { title: '从校园数据，到你的下一步', description: '回答将会标注所使用的数据来源。' },
  { title: '让信息触手可及', description: '回答将会标注所使用的数据来源。' },
  { title: '你的南大，一站式掌握', description: '回答将会标注所使用的数据来源。' },
  { title: '在每一次选择之前，先多了解一点', description: '回答将会标注所使用的数据来源。' },
] as const

function pickEmptyMessage() {
  return emptyMessages[Math.floor(Math.random() * emptyMessages.length)]
}

export function AiAssistant({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [initialConnection] = useState(loadAiConnection)
  const [emptyMessage] = useState(pickEmptyMessage)
  const [prompts] = useState(pickSuggestedPrompts)
  const [endpoint, setEndpoint] = useState(initialConnection.endpoint)
  const [model, setModel] = useState(initialConnection.model)
  const [apiKey, setApiKey] = useState(initialConnection.apiKey)
  const [draft, setDraft] = useState('')
  const [transcript, setTranscript] = useState<TranscriptItem[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [needsApiKey, setNeedsApiKey] = useState(false)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const apiKeyRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(AI_CONNECTION_STORAGE_KEY, JSON.stringify({ endpoint, model, apiKey }))
    } catch {
      // Browsers may disable local storage in private or restricted contexts.
    }
  }, [endpoint, model, apiKey])

  useEffect(() => {
    const transcriptViewport = transcriptRef.current
    if (!transcriptViewport) return
    transcriptViewport.scrollTo({ top: transcriptViewport.scrollHeight, behavior: sending ? 'auto' : 'smooth' })
  }, [transcript, sending, error])

  const canSend = useMemo(() => Boolean(apiKey.trim() && draft.trim() && !sending), [apiKey, draft, sending])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = draft.trim()
    if (!content || !apiKey.trim() || sending) return
    const nextTranscript = [...transcript, { role: 'user' as const, content }]
    setTranscript(nextTranscript)
    setDraft('')
    setSending(true)
    setError('')
    try {
      const response = await api.post<AiChatResponse>('/api/ai/chat', {
        endpoint,
        model,
        apiKey,
        messages: nextTranscript.map(({ role, content: message }) => ({ role, content: message })),
      })
      setTranscript((current) => [...current, { role: 'assistant', content: response.message, sources: response.sources }])
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        onUnauthorized()
        return
      }
      setError(caught instanceof Error ? caught.message : '模型请求失败，请检查配置后重试')
    } finally {
      setSending(false)
    }
  }

  function clearTranscript() {
    if (sending) return
    setTranscript([])
    setError('')
  }

  function choosePrompt(prompt: string) {
    if (!apiKey.trim()) {
      setNeedsApiKey(true)
      apiKeyRef.current?.focus()
      return
    }
    setNeedsApiKey(false)
    setDraft(prompt)
  }

  return <div className="page-stack ai-page">
    <div className="page-heading ai-heading">
      <div><h1>AI 助手 <span className="beta-badge">Beta</span></h1></div>
      <button type="button" className="secondary-button" onClick={clearTranscript} disabled={sending || transcript.length === 0}><RotateCcw size={16} />清空对话</button>
    </div>

    <section className="ai-layout">
      <aside className="ai-config-panel" aria-label="模型连接设置">
        <div className="ai-panel-heading"><div className="ai-icon"><KeyRound size={18} /></div><div><h2>连接模型</h2><p>仅保存在当前浏览器</p></div></div>
        <label className="ai-field"><span>接口地址</span><input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} type="url" name="llm-endpoint" autoComplete="off" autoCapitalize="none" autoCorrect="off" inputMode="url" placeholder="https://api.example.com/v1/chat/completions" spellCheck={false} /></label>
        <label className="ai-field"><span>模型名称</span><input value={model} onChange={(event) => setModel(event.target.value)} type="text" name="llm-model" autoComplete="off" autoCapitalize="none" autoCorrect="off" placeholder="deepseek-v4-pro" spellCheck={false} /></label>
        <label className={`ai-field${needsApiKey ? ' ai-field-attention' : ''}`}><span>API Key</span><span className="ai-secret-control"><input ref={apiKeyRef} value={apiKey} onChange={(event) => { setApiKey(event.target.value); setNeedsApiKey(false) }} type="text" name="llm-api-token" className="ai-secret-input" autoComplete="one-time-code" autoCapitalize="none" autoCorrect="off" aria-describedby="ai-key-security-note" aria-invalid={needsApiKey || undefined} placeholder="输入你的 API Key" spellCheck={false} /><span className="ai-secret-mask" aria-hidden="true">{'\u2022'.repeat(apiKey.length)}</span></span></label>
        <div className="ai-security-note" id="ai-key-security-note"><ShieldCheck size={16} /><span>接口、模型与 API Key 仅保存在当前浏览器，不会写入本站数据库或服务端日志。API Key 属于敏感凭证，请勿在模型服务账户中存放过高余额，并避免在公共设备使用；清空此字段即可删除已保存的密钥。模型只会在需要时查询成绩、课表、培养方案、五育、第二课堂、通知、红黑榜和备忘录。</span></div>
        <div className="ai-scope-list"><span>当前支持查询</span><p>学业概览、培养方案、我的课表、校园服务、红黑榜、备忘录</p></div>
      </aside>

      <section className="ai-chat-panel" aria-label="AI 对话">
        <div className="ai-chat-header"><strong><Sparkles size={17} />南雍知课 AI</strong><Bot size={22} /></div>
        <div ref={transcriptRef} className="ai-transcript" aria-live="polite">
          {transcript.length === 0 && <div className="ai-empty"><div className="ai-empty-icon"><Bot size={27} /></div><strong>{emptyMessage.title}</strong><span>{emptyMessage.description}</span><div className="ai-prompts">{prompts.map((prompt) => <button type="button" key={prompt} onClick={() => choosePrompt(prompt)}>{prompt}</button>)}</div></div>}
          {transcript.map((item, index) => <article className={`ai-message ${item.role}`} key={`${item.role}-${index}`}>
            <div className="ai-message-avatar">{item.role === 'user' ? <img src="/default-avatar.jpeg" alt="" aria-hidden="true" /> : <Bot size={15} />}</div>
            <div className="ai-message-body">
              <span className="ai-message-label">{item.role === 'user' ? '小蓝鲸' : '南雍知课 AI'}</span>
              <div className="ai-message-bubble">
                {item.role === 'assistant' ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown> : <p>{item.content}</p>}
                {item.sources?.length ? <div className="ai-sources">{item.sources.map((source) => <span key={source.tool}>{source.label}</span>)}</div> : null}
              </div>
            </div>
          </article>)}
          {sending && <div className="ai-message assistant"><div className="ai-message-avatar"><Bot size={15} /></div><div className="ai-message-body"><span className="ai-message-label">南雍知课 AI</span><div className="ai-message-bubble"><p className="ai-thinking"><LoaderCircle size={15} className="spin" />深度思考中</p></div></div></div>}
        </div>
        {error && <div className="error-banner ai-error" role="alert">{error}</div>}
        <form className="ai-composer" onSubmit={(event) => void submit(event)}>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={apiKey.trim() ? '问问你的成绩、培养方案或校园生活…' : '先在左侧填写 API Key'} disabled={!apiKey.trim() || sending} rows={2} aria-label="输入问题" />
          <button type="submit" className="primary-button" disabled={!canSend} aria-label="发送问题" title="发送问题">{sending ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />}发送</button>
        </form>
      </section>
    </section>
  </div>
}

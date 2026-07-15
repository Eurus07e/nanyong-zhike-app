import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, LoaderCircle, Pencil, Pin, Plus, Search, StickyNote, Trash2, X } from 'lucide-react'
import { api, ApiError, query } from '../api'
import { MEMOS_CHANGED_EVENT, removeMemo, upsertMemo, upsertMemoForQuery } from '../memo-state'
import type { Memo, MemoListResponse } from '../types'

export function Memos({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [memos, setMemos] = useState<Memo[]>([])
  const [draft, setDraft] = useState('')
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const requestRef = useRef(0)

  const handleError = useCallback((caught: unknown, fallback: string) => {
    if (caught instanceof ApiError && caught.status === 401) onUnauthorized()
    setError(caught instanceof Error ? caught.message : fallback)
  }, [onUnauthorized])

  function invalidateMemoLoads() {
    requestRef.current += 1
    setLoading(false)
    setSearching(false)
  }

  const loadMemos = useCallback(async (text: string) => {
    const requestId = ++requestRef.current
    setSearching(true)
    setError('')
    try {
      const response = await api.get<MemoListResponse>(query('/api/memos', { q: text.trim() || undefined }))
      if (requestId !== requestRef.current) return
      setMemos(response.items)
    } catch (caught) {
      if (requestId !== requestRef.current) return
      handleError(caught, '备忘录加载失败')
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false)
        setSearching(false)
      }
    }
  }, [handleError])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMemos(searchText), 180)
    return () => window.clearTimeout(timer)
  }, [loadMemos, searchText])

  useEffect(() => {
    const reload = () => void loadMemos(searchText)
    window.addEventListener(MEMOS_CHANGED_EVENT, reload)
    return () => window.removeEventListener(MEMOS_CHANGED_EVENT, reload)
  }, [loadMemos, searchText])

  async function createMemo() {
    const content = draft.trim()
    if (!content || saving) return
    invalidateMemoLoads()
    setSaving(true)
    setError('')
    try {
      const created = await api.post<Memo>('/api/memos', { content })
      invalidateMemoLoads()
      setMemos((current) => upsertMemo(current, created))
      setDraft('')
      setSearchText('')
      window.dispatchEvent(new Event(MEMOS_CHANGED_EVENT))
    } catch (caught) {
      invalidateMemoLoads()
      handleError(caught, '备忘录保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function togglePinned(memo: Memo) {
    if (pendingId != null) return
    invalidateMemoLoads()
    setPendingId(memo.id)
    setError('')
    try {
      const updated = await api.patch<Memo>(`/api/memos/${memo.id}`, { pinned: !memo.pinned })
      invalidateMemoLoads()
      setMemos((current) => upsertMemoForQuery(current, updated, searchText))
    } catch (caught) {
      invalidateMemoLoads()
      handleError(caught, '置顶状态更新失败')
    } finally {
      setPendingId(null)
    }
  }

  function beginEdit(memo: Memo) {
    setEditingId(memo.id)
    setEditingContent(memo.content)
    setDeletingId(null)
  }

  async function saveEdit(memoId: number) {
    const content = editingContent.trim()
    if (!content || pendingId != null) return
    invalidateMemoLoads()
    setPendingId(memoId)
    setError('')
    try {
      const updated = await api.patch<Memo>(`/api/memos/${memoId}`, { content })
      invalidateMemoLoads()
      setMemos((current) => upsertMemoForQuery(current, updated, searchText))
      setEditingId(null)
      setEditingContent('')
    } catch (caught) {
      invalidateMemoLoads()
      handleError(caught, '备忘录更新失败')
    } finally {
      setPendingId(null)
    }
  }

  async function deleteMemo(memoId: number) {
    if (pendingId != null) return
    invalidateMemoLoads()
    setPendingId(memoId)
    setError('')
    try {
      await api.delete(`/api/memos/${memoId}`)
      invalidateMemoLoads()
      setMemos((current) => removeMemo(current, memoId))
      setDeletingId(null)
      window.dispatchEvent(new Event(MEMOS_CHANGED_EVENT))
    } catch (caught) {
      invalidateMemoLoads()
      handleError(caught, '备忘录删除失败')
    } finally {
      setPendingId(null)
    }
  }

  return <div className="page-stack memo-page">
    <div className="page-heading"><div><h1>备忘录</h1></div></div>

    <form className="memo-composer" onSubmit={(event) => { event.preventDefault(); void createMemo() }}>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={10_000} placeholder="记录此刻需要记住的事…" aria-label="新备忘录内容" />
      <footer><span>{draft.length.toLocaleString('zh-CN')} / 10,000</span><button type="submit" className="primary-button" disabled={!draft.trim() || saving}>{saving ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />}添加</button></footer>
    </form>

    <section className="memo-toolbar" aria-label="搜索备忘录">
      <Search size={17} aria-hidden="true" />
      <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索正文或标签" aria-label="搜索正文或标签" />
      {searching && <LoaderCircle size={16} className="spin" aria-label="正在搜索" />}
      {!searching && searchText && <button type="button" className="icon-button" onClick={() => setSearchText('')} aria-label="清除搜索" title="清除搜索"><X size={17} /></button>}
      <span>{memos.length} 条</span>
    </section>

    {error && <div className="error-banner">{error}</div>}
    {loading ? <div className="center-loading"><LoaderCircle className="spin" />正在加载备忘录</div> : memos.length ? <section className="memo-timeline" aria-live="polite">
      {memos.map((memo) => <article className={`memo-card ${memo.pinned ? 'pinned' : ''}`} key={memo.id}>
        <header>
          <div><time dateTime={new Date(memo.updatedAt * 1000).toISOString()}>{formatMemoTime(memo.updatedAt)}</time>{memo.updatedAt !== memo.createdAt && <span>已编辑</span>}</div>
          <div className="memo-actions">
            <button type="button" className="icon-button" onClick={() => void togglePinned(memo)} disabled={pendingId != null} aria-label={memo.pinned ? '取消置顶' : '置顶'} title={memo.pinned ? '取消置顶' : '置顶'}><Pin size={17} fill={memo.pinned ? 'currentColor' : 'none'} /></button>
            <button type="button" className="icon-button" onClick={() => beginEdit(memo)} disabled={pendingId != null} aria-label="编辑" title="编辑"><Pencil size={17} /></button>
            <button type="button" className="icon-button danger" onClick={() => { setDeletingId(memo.id); setEditingId(null) }} disabled={pendingId != null} aria-label="删除" title="删除"><Trash2 size={17} /></button>
          </div>
        </header>

        {editingId === memo.id ? <div className="memo-edit-area">
          <textarea value={editingContent} onChange={(event) => setEditingContent(event.target.value)} maxLength={10_000} aria-label="编辑备忘录内容" autoFocus />
          <div><span>{editingContent.length.toLocaleString('zh-CN')} / 10,000</span><button type="button" className="icon-button" onClick={() => { setEditingId(null); setEditingContent('') }} aria-label="取消编辑" title="取消"><X size={18} /></button><button type="button" className="icon-button confirm" onClick={() => void saveEdit(memo.id)} disabled={!editingContent.trim() || pendingId != null} aria-label="保存修改" title="保存"><Check size={18} /></button></div>
        </div> : <p>{memo.content}</p>}

        {editingId !== memo.id && memo.linkUrl && <a className="memo-source-link" href={memo.linkUrl} target="_blank" rel="noreferrer">
          <span>{memo.linkLabel || '打开链接'}</span><ArrowUpRight size={16} />
        </a>}

        {editingId !== memo.id && memo.tags.length > 0 && <div className="memo-tags">{memo.tags.map((tag) => <button type="button" onClick={() => setSearchText(`#${tag}`)} key={tag}>#{tag}</button>)}</div>}

        {deletingId === memo.id && <div className="memo-delete-confirm"><span>确认删除这条备忘录？</span><button type="button" className="secondary-button" onClick={() => setDeletingId(null)}>取消</button><button type="button" className="memo-delete-button" onClick={() => void deleteMemo(memo.id)} disabled={pendingId != null}>{pendingId === memo.id && <LoaderCircle size={15} className="spin" />}删除</button></div>}
      </article>)}
    </section> : <section className="memo-empty"><StickyNote size={25} /><strong>{searchText ? '没有匹配的备忘录' : '还没有备忘录'}</strong><span>{searchText ? '换一个关键词或标签试试' : '写下第一条需要记住的事'}</span></section>}
  </div>
}

function formatMemoTime(timestamp: number) {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  return new Intl.DateTimeFormat('zh-CN', sameDay
    ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
  ).format(date)
}

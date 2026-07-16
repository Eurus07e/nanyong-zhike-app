import fixture from './preview-data.json'
import type { AiChatResponse, Memo, ReviewResult } from './types'

type PreviewEntry = { value: unknown; updatedAt: number }
type PreviewFixture = {
  meta: { generatedAt: number; sessionUsername: string; version: string; notice: string }
  entries: Record<string, PreviewEntry>
  notices: { id: string; date: string; title: string; url: string }[]
  noticeDetails: Record<string, { id: string; date: string; title: string; url: string; content: string }>
  reviews: ReviewResult[]
  memos: Memo[]
}

const data = fixture as PreviewFixture
const originalFetch = window.fetch.bind(window)
let memos = structuredClone(data.memos)
let nextMemoId = Math.max(0, ...memos.map((memo) => memo.id)) + 1

export function installPreviewApi() {
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const url = new URL(request.url, window.location.href)
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
      return originalFetch(input, init)
    }
    return previewResponse(url, request)
  }
}

async function previewResponse(url: URL, request: Request) {
  const method = request.method.toUpperCase()
  const path = url.pathname

  if (path === '/api/health') {
    return jsonResponse({ status: 'ok', service: '南雍知课', version: data.meta.version, deployment: 'preview' })
  }
  if (path === '/api/auth/session') {
    return jsonResponse({ username: data.meta.sessionUsername, expiresAt: data.meta.generatedAt + 30 * 86400 })
  }
  if (path === '/api/bootstrap') {
    return jsonResponse({ entries: data.entries })
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    return jsonResponse({ ok: true })
  }
  if (path === '/api/desktop/quit' && method === 'POST') {
    return jsonResponse({ ok: true })
  }
  if (path === '/api/notices') {
    return jsonResponse({ items: data.notices, source: 'cache' })
  }
  if (path.startsWith('/api/notices/')) {
    const id = decodeURIComponent(path.slice('/api/notices/'.length))
    return data.noticeDetails[id] ? jsonResponse(data.noticeDetails[id]) : errorResponse(404, '未找到该通知')
  }
  if (path === '/api/reviews/search') {
    return jsonResponse(searchReviews(url))
  }
  if (path === '/api/memos') {
    if (method === 'GET') return jsonResponse({ items: searchMemos(url.searchParams.get('q') || '') })
    if (method === 'POST') return createMemo(request)
  }
  if (path.startsWith('/api/memos/')) {
    const memoId = Number(path.slice('/api/memos/'.length))
    if (!Number.isInteger(memoId)) return errorResponse(404, '未找到该备忘录')
    if (method === 'PATCH') return updateMemo(memoId, request)
    if (method === 'DELETE') return deleteMemo(memoId)
  }
  if (path === '/api/ai/chat' && method === 'POST') {
    return answerAi(request)
  }

  const cacheKey = normalizeCacheKey(url)
  const entry = data.entries[cacheKey]
  return entry ? jsonResponse(entry.value) : errorResponse(404, `预览数据中没有 ${cacheKey}`)
}

function normalizeCacheKey(url: URL) {
  const search = new URLSearchParams(url.search)
  search.delete('refresh')
  const suffix = search.toString()
  return suffix ? `${url.pathname}?${suffix}` : url.pathname
}

function searchReviews(url: URL) {
  const query = (url.searchParams.get('q') || '').trim().toLocaleLowerCase('zh-CN')
  const field = url.searchParams.get('field') || 'all'
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0))
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 50)))
  const items = data.reviews.filter((item) => {
    const course = item.courseName.toLocaleLowerCase('zh-CN')
    const teacher = item.teacher.toLocaleLowerCase('zh-CN')
    if (field === 'course') return course.includes(query)
    if (field === 'teacher') return teacher.includes(query)
    return `${course} ${teacher}`.includes(query)
  })
  return { items: items.slice(offset, offset + limit), total: items.length, query: url.searchParams.get('q') || '' }
}

function searchMemos(query: string) {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  return [...memos]
    .filter((memo) => !normalized
      || memo.content.toLocaleLowerCase('zh-CN').includes(normalized)
      || memo.tags.some((tag) => `#${tag}`.toLocaleLowerCase('zh-CN').includes(normalized)))
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.updatedAt - left.updatedAt)
}

async function createMemo(request: Request) {
  const body = await request.json() as { content?: string; linkUrl?: string; linkLabel?: string }
  const content = body.content?.trim() || ''
  if (!content) return errorResponse(422, '备忘录内容不能为空')
  const now = Math.floor(Date.now() / 1000)
  const memo: Memo = {
    id: nextMemoId++,
    content,
    tags: extractTags(content),
    pinned: false,
    linkUrl: body.linkUrl || null,
    linkLabel: body.linkLabel || null,
    createdAt: now,
    updatedAt: now,
  }
  memos = [memo, ...memos]
  return jsonResponse(memo, 201)
}

async function updateMemo(memoId: number, request: Request) {
  const index = memos.findIndex((memo) => memo.id === memoId)
  if (index < 0) return errorResponse(404, '未找到该备忘录')
  const body = await request.json() as { content?: string; pinned?: boolean }
  const current = memos[index]
  const content = body.content === undefined ? current.content : body.content.trim()
  if (!content) return errorResponse(422, '备忘录内容不能为空')
  const updated: Memo = {
    ...current,
    content,
    tags: extractTags(content),
    pinned: body.pinned === undefined ? current.pinned : body.pinned,
    updatedAt: Math.floor(Date.now() / 1000),
  }
  memos = memos.map((memo) => memo.id === memoId ? updated : memo)
  return jsonResponse(updated)
}

function deleteMemo(memoId: number) {
  if (!memos.some((memo) => memo.id === memoId)) return errorResponse(404, '未找到该备忘录')
  memos = memos.filter((memo) => memo.id !== memoId)
  return new Response(null, { status: 204 })
}

async function answerAi(request: Request) {
  const body = await request.json() as { messages?: { role: string; content: string }[]; model?: string }
  const question = body.messages?.at(-1)?.content || '当前学业情况'
  const response: AiChatResponse = {
    message: `这是交互预览中的本地演示回答。你刚才询问的是“${question}”。正式使用时，南雍知课会按需读取你的成绩、课表、培养方案和校园服务数据，并把实际使用的数据来源标注在回答下方。`,
    sources: [
      { label: '学业概览', tool: 'get_academic_overview' },
      { label: '培养方案', tool: 'get_programs' },
    ],
    model: body.model || '南雍演示模型',
  }
  return jsonResponse(response)
}

function extractTags(content: string) {
  return [...content.matchAll(/(?<!#)#([\w\u3400-\u9fff-]{1,50})/gu)].map((match) => match[1])
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function errorResponse(status: number, detail: string) {
  return jsonResponse({ detail }, status)
}

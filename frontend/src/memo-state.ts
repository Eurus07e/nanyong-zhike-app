import type { Memo } from './types'

export const MEMOS_CHANGED_EVENT = 'nanyong-memos-changed'

export function upsertMemo(items: Memo[], memo: Memo) {
  return sortMemos([memo, ...items.filter((item) => item.id !== memo.id)])
}

export function removeMemo(items: Memo[], memoId: number) {
  return items.filter((item) => item.id !== memoId)
}

export function upsertMemoForQuery(items: Memo[], memo: Memo, query: string) {
  return memoMatchesQuery(memo, query) ? upsertMemo(items, memo) : removeMemo(items, memo.id)
}

function memoMatchesQuery(memo: Memo, query: string) {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  if (!normalized) return true
  return memo.content.toLocaleLowerCase('zh-CN').includes(normalized)
    || JSON.stringify(memo.tags).toLocaleLowerCase('zh-CN').includes(normalized)
}

function sortMemos(items: Memo[]) {
  return [...items].sort((left, right) =>
    Number(right.pinned) - Number(left.pinned)
    || right.updatedAt - left.updatedAt
    || right.id - left.id
  )
}

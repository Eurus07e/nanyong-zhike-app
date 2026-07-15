import assert from 'node:assert/strict'
import test from 'node:test'

import { removeMemo, upsertMemo, upsertMemoForQuery } from '../src/memo-state.ts'

const older = { id: 1, content: '较早', tags: [], pinned: false, createdAt: 100, updatedAt: 100 }
const newer = { id: 2, content: '较新', tags: [], pinned: false, createdAt: 200, updatedAt: 200 }

test('upsert inserts new memos in timeline order', () => {
  const created = { id: 3, content: '最新', tags: [], pinned: false, createdAt: 300, updatedAt: 300 }
  assert.deepEqual(upsertMemo([newer, older], created).map((memo) => memo.id), [3, 2, 1])
})

test('upsert replaces an edited memo and moves pinned items first', () => {
  const pinned = { ...older, content: '已置顶', pinned: true, updatedAt: 400 }
  const result = upsertMemo([newer, older], pinned)

  assert.deepEqual(result.map((memo) => memo.id), [1, 2])
  assert.equal(result[0].content, '已置顶')
})

test('remove deletes only the selected memo', () => {
  assert.deepEqual(removeMemo([newer, older], 2), [older])
})

test('editing a memo removes it from results when it no longer matches the active search', () => {
  const tagged = { ...newer, content: '复习 #课程', tags: ['课程'] }
  const edited = { ...tagged, content: '已经完成', tags: [], updatedAt: 300 }

  assert.deepEqual(upsertMemoForQuery([tagged, older], edited, '#课程'), [older])
})

test('editing a matching memo keeps it in active search order', () => {
  const tagged = { ...older, content: '复习 #课程', tags: ['课程'] }
  const edited = { ...tagged, content: '继续复习 #课程', updatedAt: 300 }

  assert.deepEqual(upsertMemoForQuery([newer, tagged], edited, '课程').map((memo) => memo.id), [1, 2])
})

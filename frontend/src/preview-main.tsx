import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installPreviewApi } from './preview-api'
import { savePlanner, todayDate, type PlannerState } from './planner-state'
import './styles.css'
import './preview.css'

const PREVIEW_USERNAME = 'Rick Sanchez'

installPreviewApi()
seedPreviewStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <div className="preview-badge" role="status">
      <strong>交互预览</strong>
      <span>个人数据已脱敏</span>
      <a href="https://github.com/Eurus07e/nanyong-zhike-app/releases/tag/v2.0.1">下载 v2.0.1</a>
    </div>
  </StrictMode>,
)

function seedPreviewStorage() {
  if (!window.localStorage.getItem('nanyong-preview-initialized:v2.0.1')) {
    savePlanner(PREVIEW_USERNAME, previewPlanner())
    window.localStorage.setItem('nanyong-ai-connection:v1', JSON.stringify({
      endpoint: 'https://preview.local/chat/completions',
      model: '南雍演示模型',
      apiKey: 'preview-only',
    }))
    window.localStorage.setItem('nanyong-preview-initialized:v2.0.1', 'true')
  }
}

function previewPlanner(): PlannerState {
  const start = todayDate()
  const day = (offset: number) => {
    const value = new Date(`${start}T12:00:00`)
    value.setDate(value.getDate() + offset)
    return value.toISOString().slice(0, 10)
  }
  const now = Date.now()
  return {
    version: 2,
    activePlanId: 'preview-plan',
    plans: [{
      id: 'preview-plan',
      title: '本周学习计划',
      startDate: start,
      endDate: day(6),
      createdAt: now,
      updatedAt: now,
      lists: [
        { id: 'preview-list-1', name: '课程任务', createdAt: now, updatedAt: now },
        { id: 'preview-list-2', name: '长期计划', createdAt: now, updatedAt: now },
        { id: 'preview-list-3', name: '校园事项', createdAt: now, updatedAt: now },
        { id: 'preview-list-4', name: '阅读清单', createdAt: now, updatedAt: now },
        { id: 'preview-list-5', name: '灵感记录', createdAt: now, updatedAt: now },
      ],
      tasks: [
        { id: 'preview-task-1', title: '整理本周课程笔记', date: start, status: 'done', source: 'manual', tags: ['学习'], createdAt: now, updatedAt: now },
        { id: 'preview-task-2', title: '完成课程项目阶段总结', date: day(1), status: 'backlog', source: 'course', courseName: '课程项目', tags: ['课程'], createdAt: now, updatedAt: now },
        { id: 'preview-task-3', title: '查看培养方案通识要求', date: day(2), status: 'backlog', source: 'manual', tags: [], createdAt: now, updatedAt: now },
        { id: 'preview-task-4', title: '准备下周课堂展示', date: day(3), status: 'backlog', source: 'course', courseName: '专业课程', tags: ['课程'], createdAt: now, updatedAt: now },
        { id: 'preview-task-5', title: '确认选课安排', date: day(4), status: 'backlog', source: 'manual', tags: [], listId: 'preview-list-1', createdAt: now, updatedAt: now },
        { id: 'preview-task-6', title: '整理学期目标', date: day(4), status: 'backlog', source: 'manual', tags: [], listId: 'preview-list-2', createdAt: now, updatedAt: now },
      ],
    }],
  }
}

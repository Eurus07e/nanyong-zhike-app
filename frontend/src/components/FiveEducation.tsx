import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, CircleAlert, Image, LoaderCircle, Pentagon, RefreshCw, X } from 'lucide-react'
import { ApiError, api } from '../api'
import { assetUrl } from '../assets'
import {
  filterFiveEducationActivities,
  formatActivityDate,
  formatDuration,
  moduleProgress,
  radarPoints,
  radarPolygon,
  sortFiveEducationActivities,
  type FiveEducationActivitySort,
  type FiveEducationActivityStatus,
} from '../five-education'
import type { FiveEducationActivities, FiveEducationActivity, FiveEducationOverview } from '../types'


const OVERVIEW_PATH = '/api/five-education/overview'
const ACTIVITIES_PATH = '/api/five-education/activities'
const CACHE_TTL = 5 * 60_000
const CHART_CENTER = 160
const CHART_RADIUS = 108


export function FiveEducation({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [overview, setOverview] = useState<FiveEducationOverview | null>(() => api.peek<FiveEducationOverview>(OVERVIEW_PATH) || null)
  const [activities, setActivities] = useState<FiveEducationActivities | null>(() => api.peek<FiveEducationActivities>(ACTIVITIES_PATH) || null)
  const [loading, setLoading] = useState(() => !api.hasCache(OVERVIEW_PATH))
  const [error, setError] = useState('')

  const load = useCallback(async (force = false) => {
    setLoading(true)
    setError('')
    try {
      const [nextOverview, nextActivities] = await Promise.all([
        api.cached<FiveEducationOverview>(`${OVERVIEW_PATH}?refresh=true`, { ttl: CACHE_TTL, force }),
        api.cached<FiveEducationActivities>(`${ACTIVITIES_PATH}?refresh=true`, { ttl: CACHE_TTL, force }),
      ])
      api.setCache(OVERVIEW_PATH, nextOverview, CACHE_TTL)
      api.setCache(ACTIVITIES_PATH, nextActivities, CACHE_TTL)
      setOverview(nextOverview)
      setActivities(nextActivities)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        onUnauthorized()
        return
      }
      setError(caught instanceof Error ? caught.message : '我的五育暂时不可用，请连接校园网或vpn并稍后重试')
    } finally {
      setLoading(false)
    }
  }, [onUnauthorized])

  useEffect(() => { void load() }, [load])

  return <section className="service-panel five-education-panel" role="tabpanel">
    <div className="section-title service-panel-title five-education-title">
      <div><h2>我的五育</h2><p>德、智、体、美、劳活动与成长模块总览</p></div>
      <div className="service-panel-actions">
        {overview ? <a className="icon-button" href={overview.source.systemUrl} target="_blank" rel="noreferrer" aria-label="进入五育系统" title="进入五育系统"><Pentagon size={18} /></a> : null}
        <button type="button" className="icon-button" onClick={() => void load(true)} disabled={loading} aria-label="刷新五育数据" title="刷新"><RefreshCw size={18} className={loading ? 'spin' : ''} /></button>
      </div>
    </div>

    {error && <div className="error-banner five-education-error"><CircleAlert size={17} />{error}</div>}
    {loading && !overview ? <FiveEducationSkeleton /> : null}
    {!loading && !overview ? <div className="service-empty"><CircleAlert size={25} /><strong>五育数据暂不可得</strong><button type="button" className="secondary-button" onClick={() => void load(true)}>重新读取</button></div> : null}
    {overview ? <FiveEducationDashboard overview={overview} activities={activities} /> : null}
  </section>
}


function FiveEducationDashboard({ overview, activities }: { overview: FiveEducationOverview; activities: FiveEducationActivities | null }) {
  const [guideOpen, setGuideOpen] = useState(false)
  const chart = useMemo(() => {
    const personal = overview.dimensions.map((item) => item.personalCount)
    const average = overview.dimensions.map((item) => item.cohortAverage)
    const maxima = personal.map((value, index) => Math.max(value, average[index] || 0, 1))
    return {
      grids: [1 / 3, 2 / 3, 1].map((ratio) => radarPolygon(radarPoints(maxima.map((value) => value * ratio), maxima, CHART_CENTER, CHART_CENTER, CHART_RADIUS))),
      axes: radarPoints(maxima, maxima, CHART_CENTER, CHART_CENTER, CHART_RADIUS),
      personal: radarPolygon(radarPoints(personal, maxima, CHART_CENTER, CHART_CENTER, CHART_RADIUS)),
      average: radarPolygon(radarPoints(average, maxima, CHART_CENTER, CHART_CENTER, CHART_RADIUS)),
      labels: radarPoints(maxima, maxima, CHART_CENTER, CHART_CENTER, CHART_RADIUS + 27),
    }
  }, [overview.dimensions])

  useEffect(() => {
    if (!guideOpen) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setGuideOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [guideOpen])

  const evaluationPercent = Math.round(overview.summary.evaluationRate * 100)

  return <div className="five-education-dashboard">
    <div className="five-education-summary">
      <SummaryMetric label="活动总数" value={String(overview.summary.totalActivities)} note="五类活动数量合计" />
      <SummaryMetric label="劳育总时长" value={formatDuration(overview.summary.laborTotalDuration)} note="五育系统统计时长" />
      <SummaryMetric label="学期评价完成率" value={`${evaluationPercent}%`} note={`${overview.summary.evaluatedCount} / ${overview.summary.evaluationTotal} 已评价`} />
    </div>

    <div className="five-education-primary-grid">
      <article className="five-education-card five-radar-card">
        <header><strong>五育活动分布</strong><div className="five-radar-legend"><span className="personal">我的活动数</span><span className="average">同年级平均</span></div></header>
        <div className="five-radar-layout">
          <svg className="five-radar" viewBox="0 0 320 320" role="img" aria-label="五育活动分布雷达图">
            <title>我的活动数与同年级平均活动数雷达图</title>
            {chart.grids.map((points, index) => <polygon key={index} points={points} className="five-radar-grid" />)}
            {chart.axes.map((point, index) => <line key={index} x1={CHART_CENTER} y1={CHART_CENTER} x2={point.x} y2={point.y} className="five-radar-axis" />)}
            <polygon points={chart.average} className="five-radar-average" />
            <polygon points={chart.personal} className="five-radar-personal" />
            {chart.labels.map((point, index) => <text key={overview.dimensions[index]?.key} x={point.x} y={point.y} textAnchor="middle" dominantBaseline="middle">{overview.dimensions[index]?.label}</text>)}
          </svg>
          <div className="five-dimension-list" aria-label="五育活动精确数值">
            <div className="five-dimension-head"><span>类别</span><span>我的</span><span>年级平均</span></div>
            {overview.dimensions.map((item) => <div key={item.key}><strong>{item.label}</strong><span>{item.personalCount}</span><span>{formatNumber(item.cohortAverage)}</span></div>)}
          </div>
        </div>
      </article>

      <article className="five-education-card five-growth-card">
        <header><strong>成长状态</strong><span>实际时长 / 达标时长</span></header>
        <div className="five-growth-list">
          {overview.growthModules.map((module) => {
            const progress = moduleProgress(module)
            return <div className="five-growth-row" key={module.id}>
              <div className="five-growth-heading"><strong>{module.name}</strong><span className={module.achieved ? 'achieved' : 'pending'}>{module.achieved ? <CheckCircle2 size={14} /> : null}{module.achieved ? '已达成' : '未达成'}</span></div>
              {progress === null ? <div className="five-growth-rule">由五育系统规则直接判定</div> : <div className="five-growth-track" aria-label={`${module.name}进度 ${Math.round(progress * 100)}%`}><i style={{ width: `${progress * 100}%` }} /></div>}
              <div className="five-growth-values"><span>实际 {formatDuration(module.actualDuration)}</span>{module.requiredDuration > 0 ? <span>达标 {formatDuration(module.requiredDuration)}</span> : null}</div>
            </div>
          })}
        </div>
      </article>
    </div>

    <article className="five-education-card five-labor-card">
      <header><strong>劳育构成</strong><button type="button" className="five-guide-button" onClick={() => setGuideOpen(true)}><Image size={15} />查看学习导引图</button></header>
      <div className="five-labor-grid">
        {overview.laborBreakdown.map((module) => <div key={module.moduleId}><span>{module.name}</span><strong>{formatDuration(module.actualDuration)}</strong><small>{module.displayTargetDuration === null ? '实际时长' : `目标 ${formatDuration(module.displayTargetDuration)}`}</small></div>)}
        <div className="total"><span>总时长</span><strong>{formatDuration(overview.summary.laborTotalDuration)}</strong><small>五育系统统计</small></div>
      </div>
    </article>

    <ActivitySection data={activities} />
    {guideOpen ? <GuideModal onClose={() => setGuideOpen(false)} /> : null}
  </div>
}


function ActivitySection({ data }: { data: FiveEducationActivities | null }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<FiveEducationActivityStatus>('all')
  const [sort, setSort] = useState<FiveEducationActivitySort>('time-desc')
  const [selected, setSelected] = useState<FiveEducationActivity | null>(null)
  const items = useMemo(() => sortFiveEducationActivities(filterFiveEducationActivities(data?.items || [], query, status), sort), [data, query, status, sort])

  return <section className="five-activity-section" aria-labelledby="five-activity-title">
    <header><div><h3 id="five-activity-title">我的活动</h3><p>{data ? `${data.academicYear}学年 · ${data.termLabel} · ${items.length} / ${data.count} 条` : '正在读取活动记录'}</p></div></header>
    <div className="program-toolbar five-activity-controls" aria-label="活动筛选与排序">
      <label><span>搜索</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="活动名称、单位或地点" /></label>
      <label><span>状态</span><select value={status} onChange={(event) => setStatus(event.target.value as FiveEducationActivityStatus)}><option value="all">全部状态</option><option value="recognized">已认定</option><option value="pending-review">待评价</option></select></label>
      <label><span>排序</span><select value={sort} onChange={(event) => setSort(event.target.value as FiveEducationActivitySort)}><option value="time-desc">活动时间由近到远</option><option value="time-asc">活动时间由远到近</option><option value="title">活动名称</option></select></label>
    </div>
    <div className="five-activity-list">
      <div className="five-activity-head"><span>活动</span><span>单位</span><span>时间与地点</span><span>状态</span><span /></div>
      {items.map((item) => <ActivityRow key={item.id} item={item} onOpen={() => setSelected(item)} />)}
      {data && !items.length ? <div className="five-block-empty">没有符合当前条件的活动</div> : null}
      {!data ? <div className="five-block-empty"><LoaderCircle className="spin" size={20} />正在读取活动记录</div> : null}
    </div>
    {selected ? <ActivityModal item={selected} onClose={() => setSelected(null)} /> : null}
  </section>
}


function ActivityRow({ item, onOpen }: { item: FiveEducationActivity; onOpen: () => void }) {
  return <button type="button" className="five-activity-row" onClick={onOpen} aria-label={`查看活动详情：${item.title}`}>
      <span><strong>{item.title}</strong><small>{[item.category, item.module].filter(Boolean).join(' · ') || '类型待确认'}</small></span>
      <span>{item.organizer || '发起单位待确认'}</span>
      <span><b>{formatActivityRange(item.activityStart, item.activityEnd)}</b><small>{item.location || '地点待确认'}</small></span>
      <span><em>{item.approvalStatus || '状态待确认'}</em><small>{[item.grade, item.recognizedDuration > 0 ? `${formatDuration(item.recognizedDuration)} 小时` : ''].filter(Boolean).join(' · ')}</small></span>
      <ChevronDown size={17} />
  </button>
}


function Detail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  if (!value) return null
  return <div className={wide ? 'wide' : ''}><span>{label}</span><p>{value}</p></div>
}


function GuideModal({ onClose }: { onClose: () => void }) {
  return <div className="five-guide-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="five-guide-modal" role="dialog" aria-modal="true" aria-labelledby="five-guide-title">
      <header><div><h3 id="five-guide-title">劳动教育学习导引图</h3><p>南京大学本科生劳动教育学习参考</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭导引图"><X size={18} /></button></header>
      <div className="five-guide-canvas"><img src={assetUrl('five-education-labor-guide.svg')} alt="南京大学本科生劳动教育学习导引图" /></div>
    </section>
  </div>
}


function ActivityModal({ item, onClose }: { item: FiveEducationActivity; onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  return <div className="five-activity-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="five-activity-modal" role="dialog" aria-modal="true" aria-labelledby="five-activity-modal-title">
      <header><div><span>活动详情</span><h3 id="five-activity-modal-title">{item.title}</h3><p>{[item.category, item.module, item.organizer].filter(Boolean).join(' · ')}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭活动详情"><X size={18} /></button></header>
      <div className="five-activity-modal-body">
        <div className="five-activity-status-strip"><span>{item.approvalStatus || '状态待确认'}</span><span>{item.recognitionStatus || '认定状态待确认'}</span><span>{item.reviewStatus}</span>{item.grade ? <strong>{item.grade}</strong> : null}</div>
        <div className="five-activity-detail">
          <Detail label="英文名称" value={item.englishTitle} wide />
          <Detail label="活动时间" value={formatActivityRange(item.activityStart, item.activityEnd)} wide />
          <Detail label="活动地点" value={item.location} />
          <Detail label="劳动类型" value={item.laborType} />
          <Detail label="负责人" value={item.coordinator} />
          <Detail label="联系电话" value={item.contactPhone} />
          <Detail label="联系邮箱" value={item.contactEmail} />
          <Detail label="报名时间" value={formatActivityRange(item.registrationStart, item.registrationEnd)} wide />
          <Detail label="本人报名" value={formatActivityDate(item.registeredAt)} />
          <Detail label="报名方式" value={item.registrationMethod} />
          <Detail label="招募人数" value={item.capacity ? `${item.capacity} 人` : ''} />
          <Detail label="参与状态" value={item.participationStatus} />
          <Detail label="活动 / 录入 / 认定时长" value={`${formatDuration(item.activityDuration)} / ${formatDuration(item.recordedDuration)} / ${formatDuration(item.recognizedDuration)} 小时`} wide />
          <Detail label="活动介绍" value={item.description} wide />
          <Detail label="考核办法" value={item.assessmentMethod} wide />
        </div>
      </div>
    </section>
  </div>
}


function SummaryMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
}


function FiveEducationSkeleton() {
  return <div className="center-loading service-panel-loading" aria-label="正在加载五育数据"><LoaderCircle className="spin" size={20} />正在连接五育系统</div>
}


function formatActivityRange(start: string | null, end: string | null) {
  const left = formatActivityDate(start)
  if (!end) return left
  return `${left} - ${formatActivityDate(end)}`
}


function formatNumber(value: number) {
  return Number(value.toFixed(1)).toString()
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, CheckCircle2, CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react'
import { ApiError, api } from '../api'
import { formatDuration, moduleProgress, radarPoints, radarPolygon } from '../five-education'
import type { FiveEducationOverview } from '../types'


const OVERVIEW_PATH = '/api/five-education/overview'
const CACHE_TTL = 5 * 60_000
const CHART_CENTER = 150
const CHART_RADIUS = 92


export function FiveEducation({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [overview, setOverview] = useState<FiveEducationOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (force = false) => {
    setLoading(true)
    setError('')
    try {
      const next = await api.cached<FiveEducationOverview>(OVERVIEW_PATH, { ttl: CACHE_TTL, force })
      setOverview(next)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        onUnauthorized()
        return
      }
      setError(caught instanceof Error ? caught.message : '南京大学五育系统暂时不可用')
    } finally {
      setLoading(false)
    }
  }, [onUnauthorized])

  useEffect(() => { void load() }, [load])

  return <section className="service-panel five-education-panel" role="tabpanel">
    <div className="section-title service-panel-title five-education-title">
      <div><h2>我的五育</h2><p>德、智、体、美、劳活动与成长模块总览</p></div>
      <div className="service-panel-actions">
        <a className="icon-button" href="https://ndwy.nju.edu.cn/dztml/#/" target="_blank" rel="noreferrer" aria-label="打开南京大学五育系统" title="打开原系统"><ArrowUpRight size={17} /></a>
        <button type="button" className="icon-button" onClick={() => void load(true)} disabled={loading} aria-label="刷新五育数据" title="刷新"><RefreshCw size={17} className={loading ? 'spin' : ''} /></button>
      </div>
    </div>

    {error && <div className="error-banner five-education-error"><CircleAlert size={17} />{error}</div>}
    {loading && !overview ? <FiveEducationSkeleton /> : null}
    {!loading && !overview ? <div className="service-empty"><CircleAlert size={25} /><strong>五育数据暂不可得</strong><button type="button" className="secondary-button" onClick={() => void load(true)}>重新读取</button></div> : null}
    {overview ? <FiveEducationDashboard overview={overview} /> : null}
  </section>
}


function FiveEducationDashboard({ overview }: { overview: FiveEducationOverview }) {
  const chart = useMemo(() => {
    const personal = overview.dimensions.map((item) => item.personalCount)
    const average = overview.dimensions.map((item) => item.cohortAverage)
    const maxima = personal.map((value, index) => Math.max(value, average[index] || 0, 1))
    const grids = [1 / 3, 2 / 3, 1].map((ratio) => radarPolygon(
      radarPoints(maxima.map((value) => value * ratio), maxima, CHART_CENTER, CHART_CENTER, CHART_RADIUS),
    ))
    return {
      grids,
      axes: radarPoints(maxima, maxima, CHART_CENTER, CHART_CENTER, CHART_RADIUS),
      personal: radarPolygon(radarPoints(personal, maxima, CHART_CENTER, CHART_CENTER, CHART_RADIUS)),
      average: radarPolygon(radarPoints(average, maxima, CHART_CENTER, CHART_CENTER, CHART_RADIUS)),
      labels: radarPoints(maxima, maxima, CHART_CENTER, CHART_CENTER, CHART_RADIUS + 22),
    }
  }, [overview.dimensions])

  const evaluationPercent = Math.round(overview.summary.evaluationRate * 100)
  const empty = overview.summary.totalActivities === 0 && overview.summary.laborTotalDuration === 0

  return <div className="five-education-dashboard">
    <div className="five-education-summary">
      <SummaryMetric label="活动总数" value={String(overview.summary.totalActivities)} note="五类活动数量合计" />
      <SummaryMetric label="劳育总时长" value={formatDuration(overview.summary.laborTotalDuration)} note="来自五育系统统计" />
      <SummaryMetric label="学期评价完成率" value={`${evaluationPercent}%`} note={`${overview.summary.evaluatedCount} / ${overview.summary.evaluationTotal} 已评价`} />
    </div>

    {empty ? <div className="five-education-empty-note">暂时没有活动记录，仍可查看成长模块与系统规则。</div> : null}

    <div className="five-education-primary-grid">
      <article className="five-education-card five-radar-card">
        <header><strong>五育活动分布</strong><div className="five-radar-legend"><span className="personal">我的活动数</span><span className="average">同年级平均</span></div></header>
        <div className="five-radar-layout">
          <svg className="five-radar" viewBox="0 0 300 300" role="img" aria-label="五育活动分布雷达图">
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
        <header><strong>成长模块</strong><span>实际时长 / 达标时长</span></header>
        <div className="five-growth-list">
          {overview.growthModules.map((module) => {
            const progress = moduleProgress(module)
            return <div className="five-growth-row" key={module.id}>
              <div className="five-growth-heading"><strong>{module.name}</strong><span className={module.achieved ? 'achieved' : 'pending'}>{module.achieved ? <CheckCircle2 size={13} /> : null}{module.achieved ? '已达成' : '未达成'}</span></div>
              {progress === null ? <div className="five-growth-rule">当前模块由五育系统规则直接判定</div> : <div className="five-growth-track" aria-label={`${module.name}进度 ${Math.round(progress * 100)}%`}><i style={{ width: `${progress * 100}%` }} /></div>}
              <div className="five-growth-values"><span>实际 {formatDuration(module.actualDuration)}</span><span>{module.requiredDuration > 0 ? `达标 ${formatDuration(module.requiredDuration)}` : '无固定数值阈值'}</span></div>
            </div>
          })}
          {!overview.growthModules.length ? <div className="five-block-empty">成长模块数据暂不可得</div> : null}
        </div>
      </article>
    </div>

    <div className="five-education-secondary-grid">
      <article className="five-education-card five-labor-card">
        <header><strong>劳育构成</strong><span>三类实践模块</span></header>
        <div className="five-labor-grid">
          {overview.laborBreakdown.map((module) => <div key={module.moduleId}><span>{module.name}</span><strong>{formatDuration(module.actualDuration)}</strong><small>{module.displayTargetDuration === null ? '实际时长' : `目标 ${formatDuration(module.displayTargetDuration)}`}</small></div>)}
          <div className="total"><span>总时长</span><strong>{formatDuration(overview.summary.laborTotalDuration)}</strong><small>五育系统统计</small></div>
        </div>
      </article>

      <article className="five-education-card five-details-card">
        <div><span>我的兴趣</span><div className="five-interest-list">{overview.interests.length ? overview.interests.map((item) => <strong key={item.key}>{item.label}</strong>) : <small>暂未设置</small>}</div></div>
        <div><span>学期评价</span><strong className="five-evaluation-count">{overview.summary.evaluatedCount} / {overview.summary.evaluationTotal}</strong><small>已评价 / 总数</small></div>
      </article>
    </div>

    <footer className="five-education-source"><span>数据来自{overview.source.systemName} · 查询于 {formatFetchedAt(overview.fetchedAt)}</span><a href={overview.source.systemUrl} target="_blank" rel="noreferrer">打开原系统<ArrowUpRight size={14} /></a></footer>
  </div>
}


function SummaryMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
}


function FiveEducationSkeleton() {
  return <div className="five-education-skeleton" aria-label="正在加载五育数据">
    <div /><div /><div />
    <span><LoaderCircle className="spin" size={20} />正在连接五育系统</span>
  </div>
}


function formatFetchedAt(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(timestamp * 1000))
}


function formatNumber(value: number) {
  return Number(value.toFixed(1)).toString()
}

import { useCallback, useEffect, useState } from 'react'
import { CircleAlert, LoaderCircle, Medal, RefreshCw } from 'lucide-react'
import { ApiError, api } from '../api'
import type { SecondClassroomProfile } from '../types'


const PROFILE_PATH = '/api/second-classroom/profile'
const CACHE_TTL = 5 * 60_000


export function SecondClassroom({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [profile, setProfile] = useState<SecondClassroomProfile | null>(() => api.peek<SecondClassroomProfile>(PROFILE_PATH) || null)
  const [loading, setLoading] = useState(() => !api.hasCache(PROFILE_PATH))
  const [error, setError] = useState('')
  const load = useCallback(async (force = false) => {
    setLoading(true); setError('')
    try {
      const nextProfile = await api.cached<SecondClassroomProfile>(`${PROFILE_PATH}?refresh=true`, { ttl: CACHE_TTL, force })
      api.setCache(PROFILE_PATH, nextProfile, CACHE_TTL)
      setProfile(nextProfile)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) return onUnauthorized()
      setError(caught instanceof Error ? caught.message : '第二课堂暂时不可用')
    } finally { setLoading(false) }
  }, [onUnauthorized])
  useEffect(() => { void load() }, [load])

  return <section className="service-panel second-class-panel" role="tabpanel">
    <div className="section-title service-panel-title">
      <div><h2>第二课堂</h2><p>个人资料与志愿服务概览</p></div>
      <div className="service-panel-actions">
        {profile ? <a className="icon-button" href={profile.sourceUrl} target="_blank" rel="noreferrer" aria-label="进入第二课堂" title="进入第二课堂"><Medal size={18} /></a> : null}
        <button type="button" className="icon-button" onClick={() => void load(true)} disabled={loading} aria-label="刷新第二课堂数据"><RefreshCw size={18} className={loading ? 'spin' : ''} /></button>
      </div>
    </div>
    {error ? <div className="error-banner"><CircleAlert size={17} />{error}</div> : null}
    {loading && !profile ? <div className="center-loading service-panel-loading"><LoaderCircle className="spin" />正在连接第二课堂</div> : null}
    {profile ? <div className="second-class-dashboard">
      <div className="second-class-summary">
        <Metric label="参加活动数" value={String(profile.activityCount)} />
        <Metric label="服务总时长" value={formatNumber(profile.serviceHours)} />
        <Metric label="不诚信记录" value={String(profile.dishonestyCount)} />
      </div>
      <section className="second-class-profile" aria-labelledby="second-profile-title">
        <header><h3 id="second-profile-title">个人资料</h3><span>数据来自南京大学学生第二课堂</span></header>
        <div>
          <Field label="学号" value={profile.studentId} /><Field label="姓名" value={profile.name} />
          <Field label="年级" value={profile.grade} /><Field label="学院" value={profile.college} />
          <Field label="电子邮箱" value={profile.email} wide /><Field label="英语水平" value={profile.englishLevel} />
          <Field label="其他语言" value={profile.otherLanguages} /><Field label="其他技能" value={profile.otherSkills} />
        </div>
      </section>
    </div> : null}
  </section>
}


function Metric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div> }
function Field({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) { return <div className={wide ? 'wide' : ''}><span>{label}</span><strong>{value || '无'}</strong></div> }
function formatNumber(value: number) { return Number(value.toFixed(2)).toString() }

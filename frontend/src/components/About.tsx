import { ArrowUpRight, GraduationCap } from 'lucide-react'
import { siGithub, siGmail, siQq, siX, type SimpleIcon as SimpleIconType } from 'simple-icons'

type Contact = { label: string; value: string; href: string; icon?: SimpleIconType; academic?: boolean }

const contacts: Contact[] = [
  { label: '南京大学邮箱', value: 'yuxuanshu@smail.nju.edu.cn', href: 'mailto:yuxuanshu@smail.nju.edu.cn', academic: true },
  { label: 'GitHub', value: '@Eurus07e', href: 'https://github.com/Eurus07e', icon: siGithub },
  { label: 'Gmail', value: 'yxshucassell@gmail.com', href: 'mailto:yxshucassell@gmail.com', icon: siGmail },
  { label: 'QQ 邮箱', value: '180372413@qq.com', href: 'mailto:180372413@qq.com', icon: siQq },
  { label: 'X', value: '@EurusYeZhi', href: 'https://x.com/EurusYeZhi', icon: siX },
]

export function About() {
  return <div className="page-stack about-page">
    <div className="page-heading"><div><h1>关于本站</h1></div></div>
    <div className="about-copy">
      <section className="about-copy-section">
        <h2>感谢说明</h2>
        <p>感谢 <a href="https://github.com/nju-cli/nju-cli" target="_blank" rel="noreferrer">nju-cli</a> 以可靠而优雅的方式打通了南京大学校园服务，为学生开发者提供了极具价值的基础设施；<a href="https://github.com/carottX/nju-class" target="_blank" rel="noreferrer">nju-class</a> 长期整理并开放宝贵的课程评价数据，让分散的选课经验得以被更多同学看见。这两个出色的项目所体现的工程能力、长期投入与开放精神，是南雍知课能够诞生的重要前提，也直接启发了本站的设计与实现。谨向项目作者、维护者和每一位贡献者致以诚挚而由衷的感谢。</p>
      </section>
      <section className="about-copy-section">
        <h2>开发说明</h2>
        <p>久苦于南大各类网站多而分散，且每次打开都要登录，我们做了一个把所有关键信息都集成起来的网站。</p>
        <p>受到 <a href="https://github.com/nju-cli/nju-cli" target="_blank" rel="noreferrer">nju-cli</a> 与 <a href="https://github.com/carottX/nju-class" target="_blank" rel="noreferrer">nju-class</a> 的启发，南雍知课由此诞生。后续还会持续加入更多真正实用的功能。</p>
        <p className="about-disclaimer">本站为学生个人开发的非官方工具，与南京大学官方无隶属关系。课程、成绩与培养方案请以学校系统最终结果为准。</p>
      </section>
      <section className="about-copy-section">
        <h2>隐私说明</h2>
        <p>南雍知课只处理完成校园身份认证和展示学业信息所必需的数据，并尽量缩短数据的保留范围与时间。</p>
        <div className="privacy-points">
          <article><strong>密码</strong><p>仅用于发起本次南京大学统一身份认证，不会写入本站数据库、浏览器存储，或用于身份验证以外的用途。</p></article>
          <article><strong>登录状态</strong><p>为避免反复登录，服务端会保存学号、加密的学校认证票据与会话时效；浏览器仅持有随机的 HttpOnly 会话 Cookie，本站数据库只保存会话令牌的摘要。退出登录或会话到期后，本站会话即失效。</p></article>
          <article><strong>学业数据</strong><p>成绩、课表与培养方案按需从 eHall 查询，排名与平均学分绩按需从南京大学交换生系统查询；相关结果仅在当前服务和浏览器内存中短期缓存，不作为个人档案写入本站数据库。</p></article>
          <article><strong>本地偏好</strong><p>浏览器本地仅保存按学号区分的培养方案页面最近浏览选择，用于恢复界面偏好；该选择不会改变学业概览采用的本人专业培养方案。本站不会在本地存储密码或学校认证票据。公共设备使用完毕后，请主动退出登录。</p></article>
        </div>
      </section>
    </div>
    <section className="contact-section">
      <div className="section-title"><div><h2>联系我</h2><p>如果遇到数据错误、页面问题等欢迎联系我。</p></div></div>
      <div className="contact-list">{contacts.map((item) => <a href={item.href} target={item.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" key={item.label}>
        <span className="contact-brand">
          {item.academic ? <GraduationCap aria-label="学术邮箱" /> : item.icon ? <BrandIcon icon={item.icon} /> : null}
        </span>
        <span><strong>{item.label}</strong><small>{item.value}</small></span>
        <ArrowUpRight size={20} />
      </a>)}</div>
    </section>
  </div>
}

function BrandIcon({ icon }: { icon: SimpleIconType }) {
  return <svg viewBox="0 0 24 24" role="img" aria-label={icon.title} fill="currentColor"><path d={icon.path} /></svg>
}

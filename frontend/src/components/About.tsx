import { ArrowUpRight, Coffee, GraduationCap, Heart, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { siGithub, siGmail, type SimpleIcon as SimpleIconType } from 'simple-icons'

type Contact = { label: string; value: string; href: string; icon?: SimpleIconType; academic?: boolean }

const contacts: Contact[] = [
  { label: '南京大学邮箱', value: 'yuxuanshu@smail.nju.edu.cn', href: 'mailto:yuxuanshu@smail.nju.edu.cn', academic: true },
  { label: 'GitHub', value: '@Eurus07e', href: 'https://github.com/Eurus07e', icon: siGithub },
  { label: 'Gmail', value: 'yxshucassell@gmail.com', href: 'mailto:yxshucassell@gmail.com', icon: siGmail },
]

export function About() {
  const [showSupport, setShowSupport] = useState(false)
  const supportDialogRef = useRef<HTMLDialogElement>(null)
  const supportTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dialog = supportDialogRef.current
    if (!dialog) return
    if (showSupport && !dialog.open) dialog.showModal()
    if (!showSupport && dialog.open) dialog.close()
  }, [showSupport])

  function closeSupport() {
    setShowSupport(false)
    requestAnimationFrame(() => supportTriggerRef.current?.focus())
  }

  return <div className="page-stack about-page">
    <div className="page-heading"><div><h1>关于本站</h1></div></div>
    <div className="about-copy">
      <section className="about-copy-section">
        <h2>感谢说明</h2>
        <p>感谢 <a href="https://github.com/nju-cli/nju-cli" target="_blank" rel="noreferrer">nju-cli</a> 以可靠而优雅的方式打通了南京大学校园服务，为学生开发者提供了极具价值的基础设施；<a href="https://github.com/carottX/nju-class" target="_blank" rel="noreferrer">nju-class</a> 长期整理并开放宝贵的红黑榜数据，让分散的选课经验得以被更多同学看见。这两个出色的项目所体现的工程能力、长期投入与开放精神，是南雍知课能够诞生的重要前提，也直接启发了本站的设计与实现。谨向项目作者、维护者和每一位贡献者致以诚挚而由衷的感谢。</p>
        <p>备忘录的快速记录、标签与时间线体验受到开源项目 <a href="https://github.com/usememos/memos" target="_blank" rel="noreferrer">Memos</a> 启发。感谢 Memos 社区持续打磨轻量、开放且真正由用户掌控的记录工具。</p>
      </section>
      <section className="about-copy-section">
        <h2>开发说明</h2>
        <p>久苦于南大各类网站多而分散，且每次打开都要登录，我们做了一个把所有关键信息都集成起来的网站。</p>
        <p>受到 <a href="https://github.com/nju-cli/nju-cli" target="_blank" rel="noreferrer">nju-cli</a> 与 <a href="https://github.com/carottX/nju-class" target="_blank" rel="noreferrer">nju-class</a> 的启发，南雍知课由此诞生。后续还会持续加入更多真正实用的功能。</p>
        <p className="about-disclaimer">本站为学生个人开发的非官方工具，与南京大学官方无隶属关系。课程、成绩与培养方案请以学校系统最终结果为准。</p>
      </section>
      <section className="about-copy-section">
        <h2>隐私说明</h2>
        <p>南雍知课只处理完成校园身份认证、展示学业信息和提供本地备忘录所必需的数据，并尽量缩短数据的保留范围与时间。</p>
        <div className="privacy-points">
          <article><strong>密码</strong><p>仅用于发起本次南京大学统一身份认证，不会写入本站数据库、浏览器存储，或用于身份验证以外的用途。</p></article>
          <article><strong>登录状态</strong><p>为避免反复登录，服务端会保存学号、加密的学校认证票据与会话时效；浏览器仅持有随机的 HttpOnly 会话 Cookie，本站数据库只保存会话令牌的摘要。退出登录或会话到期后，本站会话即失效。</p></article>
          <article><strong>学业数据</strong><p>成绩、课表与培养方案按需从 eHall 查询；排名与平均学分绩按需从南京大学交换生系统查询。为先显示上次结果并在后台刷新，服务端会按学号保存最近一次成绩、排名、课表和培养方案快照，全部使用与认证票据相同等级的密钥加密；浏览器只接收当前会话的启动快照，不持久保存这些学业数据。交换生系统目前仅支持 HTTP，其查询链路不具备 HTTPS 传输保护。</p></article>
          <article><strong>备忘录</strong><p>备忘录正文会持久保存在运行南雍知课的 SQLite 数据库中，按统一身份认证学号隔离，不发送给第三方。删除备忘录后，对应记录会从数据库中删除；使用他人维护的共享部署前，请确认你信任该服务维护者。</p></article>
          <article><strong>本地偏好</strong><p>浏览器本地仅保存按学号区分的培养方案页面最近浏览选择，以及 NJU Tabs 中隐藏的默认网站和自定义快捷入口；这些设置不会发送到服务器，也不会改变学业概览采用的本人专业培养方案。本站不会在本地存储密码或学校认证票据。公共设备使用完毕后，请主动退出登录并清理浏览器站点数据。</p></article>
        </div>
      </section>
    </div>
    <section className="support-section">
      <div className="section-title"><div><h2>支持开发</h2><p>如果南雍知课对你有帮助，欢迎自愿请开发者喝杯咖啡。</p></div><button ref={supportTriggerRef} type="button" className="secondary-button" onClick={() => setShowSupport(true)}><Coffee size={17} />查看收款码</button></div>
    </section>
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
    <dialog
      ref={supportDialogRef}
      className="support-modal"
      aria-labelledby="support-title"
      onCancel={(event) => { event.preventDefault(); closeSupport() }}
      onClose={() => showSupport && setShowSupport(false)}
      onMouseDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
        if (outside) closeSupport()
      }}
    >
      <header><div><h2 id="support-title">自愿支持</h2><p>支付宝扫码即可支持个人开发者</p></div><button type="button" className="icon-button" onClick={closeSupport} aria-label="关闭支持开发" autoFocus><X size={20} /></button></header>
      <div className="support-qr-wrap"><img src="/alipay-support.jpeg" alt="支付宝收钱码，收款昵称 Euros(**轩)" /></div>
      <p className="support-note">付款由支付宝处理，请在付款前核对收款昵称 Euros(**轩)。支持完全自愿，不影响任何功能，也不代表南京大学官方；本站不会记录付款人信息或交易数据。</p>
      <footer><button type="button" className="secondary-button" onClick={closeSupport}><Heart size={16} />关闭</button></footer>
    </dialog>
  </div>
}

function BrandIcon({ icon }: { icon: SimpleIconType }) {
  return <svg viewBox="0 0 24 24" role="img" aria-label={icon.title} fill="currentColor"><path d={icon.path} /></svg>
}

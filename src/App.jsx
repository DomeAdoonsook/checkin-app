import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Login from './Login.jsx'
import Student from './Student.jsx'
import Teacher from './Teacher.jsx'
import Account from './Account.jsx'
import Admin from './Admin.jsx'
import CourseManager from './CourseManager.jsx'
import AdminHome from './AdminHome.jsx'
import Results from './Results.jsx'
import ShareApp from './ShareApp.jsx'
import Icon from './Icon.jsx'
import Logo from './Logo.jsx'

function useHash() {
  const [h, setH] = useState(location.hash)
  useEffect(() => {
    const f = () => setH(location.hash)
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return h
}

const ACCOUNT = { id: 'account', icon: 'user', label: 'บัญชีของฉัน', short: 'บัญชี' }

// เมนูด้านข้างจัดกลุ่มตามบทบาท
function navFor(role, pending) {
  if (role === 'student') {
    return [
      { title: 'การเรียน', items: [
        { id: 'checkin', icon: 'camera', label: 'เช็คชื่อ', short: 'เช็คชื่อ' },
        { id: 'history', icon: 'chart', label: 'ประวัติของฉัน', short: 'ประวัติ' },
      ] },
      { title: 'บัญชี', items: [ACCOUNT] },
    ]
  }
  if (role === 'admin') {
    // แอดมิน: งานสอน (รวมเพิ่ม/จัดการวิชา) อยู่บนสุด ตามด้วยกลุ่มผู้ดูแลระบบ
    return [
      { title: 'การสอน', items: [
        { id: 'courses', icon: 'book', label: 'วิชาที่ฉันสอน', short: 'วิชา' },
        { id: 'results', icon: 'chart', label: 'ผลการเช็คชื่อ', short: 'ผลเช็ค' },
        { id: 'manage', icon: 'plus', label: 'จัดการวิชา', short: 'จัดการ' },
        { id: 'share', icon: 'share', label: 'แชร์แอป', short: 'แชร์', hideMobile: true },
      ] },
      { title: 'ผู้ดูแลระบบ', items: [
        { id: 'overview', icon: 'home', label: 'ภาพรวม', short: 'ภาพรวม' },
        { id: 'applicants', icon: 'file', label: 'ใบสมัครอาจารย์', short: 'ใบสมัคร', badge: pending },
      ] },
      { title: 'บัญชี', items: [ACCOUNT] },
    ]
  }
  return [
    { title: 'การสอน', items: [
      { id: 'courses', icon: 'book', label: 'วิชาของฉัน', short: 'วิชา' },
      { id: 'results', icon: 'chart', label: 'ผลการเช็คชื่อ', short: 'ผลเช็ค' },
      { id: 'manage', icon: 'plus', label: 'เพิ่มรายวิชา', short: 'เพิ่มวิชา' },
      { id: 'share', icon: 'share', label: 'แชร์แอป', short: 'แชร์', hideMobile: true },
    ] },
    { title: 'บัญชี', items: [ACCOUNT] },
  ]
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [page, setPage] = useState(() => { try { return sessionStorage.getItem('page') } catch { return null } })
  const [pending, setPending] = useState(0)
  const [consumed, setConsumed] = useState('')   // ลิงก์ QR ที่ใช้เช็คชื่อไปแล้ว กันทำซ้ำเมื่อสลับหน้า
  const hash = useHash()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setProfile(null); return }
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => setProfile(data))
  }, [session])

  async function refreshPending() {
    const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true })
      .eq('role', 'teacher').eq('status', 'pending')
    setPending(count ?? 0)
  }
  useEffect(() => { if (profile?.role === 'admin') refreshPending() }, [profile])

  if (session === undefined) return <p className="center">กำลังโหลด…</p>
  if (!session) return <Login />
  if (!profile) return <p className="center">กำลังโหลดโปรไฟล์… (ถ้าค้าง บัญชีนี้ยังไม่มีสิทธิ์ใช้งาน)</p>

  if (profile.status === 'pending' || profile.status === 'rejected') {
    return (
      <main>
        <section className="card center">
          <h2>{profile.status === 'pending' ? <><Icon name="clock" size={22} /> รอแอดมินอนุมัติ</> : 'ใบสมัครไม่ได้รับการอนุมัติ'}</h2>
          <p className="muted">
            {profile.status === 'pending'
              ? 'บัญชีของคุณยังไม่ได้รับสิทธิ์ใช้งาน กรุณาลองเข้าสู่ระบบใหม่หลังแอดมินอนุมัติ'
              : 'กรุณาติดต่อแอดมินหากคิดว่าเกิดความผิดพลาด'}
          </p>
          <button onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button>
        </section>
      </main>
    )
  }

  const isStudent = profile.role === 'student'
  const groups = navFor(profile.role, pending)
  const items = groups.flatMap(g => g.items)

  // ลิงก์จาก QR: #/c/<session_id>/<token> (เปิดหน้าเช็คชื่อให้อัตโนมัติ)
  const m = hash !== consumed ? hash.match(/^#\/c\/([0-9a-f-]{36})\/(.+)$/) : null
  const scan = isStudent && m ? { session: m[1], token: m[2] } : null

  const current = scan ? 'checkin' : (items.some(i => i.id === page) ? page : items[0].id)
  const title = items.find(i => i.id === current)?.label ?? ''
  function go(id) {
    setPage(id)
    try { sessionStorage.setItem('page', id) } catch { /* ignore */ }
  }

  let view
  if (current === 'account') view = <Account profile={profile} email={session.user.email} />
  else if (isStudent) view = <Student profile={profile} view={current} scan={scan} onScanDone={() => setConsumed(hash)} />
  else if (current === 'overview') view = <AdminHome onGo={go} />
  else if (current === 'applicants') view = <Admin onChanged={refreshPending} />
  else if (current === 'results') view = <Results isAdmin={profile.role === 'admin'} />
  else if (current === 'manage') view = <CourseManager isAdmin={profile.role === 'admin'} />
  else if (current === 'share') view = <ShareApp />
  else view = <Teacher profile={profile} onGo={go} />

  return (
    <div className="shell">
      <nav className="side">
        <div className="brand"><Logo size={30} /></div>
        <div className="navlist">
          {groups.map(g => (
            <div key={g.title}>
              <div className="navgroup">{g.title}</div>
              {g.items.map(it => (
                <button key={it.id} className={'nav-item' + (current === it.id ? ' on' : '') + (it.hideMobile ? ' hide-mobile' : '')} onClick={() => go(it.id)}>
                  <span className="ico"><Icon name={it.icon} /></span>
                  <span className="lbl-long">{it.label}</span>
                  <span className="lbl-short">{it.short}</span>
                  {it.badge > 0 && <span className="badge">{it.badge}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="sidefoot">
          <div className="who">
            <b>{profile.full_name}</b>
            <span className="muted">{{ student: 'นักศึกษา', teacher: 'อาจารย์', admin: 'ผู้ดูแลระบบ' }[profile.role]}</span>
          </div>
          <button className="signout" onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button>
        </div>
      </nav>
      <div className="content">
        <header><div className="hdr-logo"><Logo size={20} /></div><b>{title}</b><span className="hdr-name">{profile.full_name}</span></header>
        <main>{view}</main>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Login from './Login.jsx'
import Student from './Student.jsx'
import Teacher from './Teacher.jsx'
import ChangePassword from './ChangePassword.jsx'
import Admin from './Admin.jsx'
import CourseManager from './CourseManager.jsx'

function useHash() {
  const [h, setH] = useState(location.hash)
  useEffect(() => {
    const f = () => setH(location.hash)
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return h
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
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

  if (session === undefined) return <p className="center">กำลังโหลด…</p>
  if (!session) return <Login />
  if (!profile) return <p className="center">กำลังโหลดโปรไฟล์… (ถ้าค้าง บัญชีนี้ยังไม่มีสิทธิ์ใช้งาน)</p>

  if (profile.status === 'pending' || profile.status === 'rejected') {
    return (
      <main>
        <section className="card center">
          <h2>{profile.status === 'pending' ? '⏳ รอแอดมินอนุมัติ' : 'ใบสมัครไม่ได้รับการอนุมัติ'}</h2>
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

  // ลิงก์จาก QR: #/c/<session_id>/<token>
  const m = hash.match(/^#\/c\/([0-9a-f-]{36})\/(.+)$/)
  return (
    <>
      <header>
        <b>เช็คชื่อ</b>
        <span>{profile.full_name}</span>
        <button className="logout" onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button>
      </header>
      <main>
        {profile.role === 'student'
          ? <Student profile={profile} scan={m ? { session: m[1], token: m[2] } : null} />
          : <>{profile.role === 'admin' && <><Admin /><CourseManager /></>}<Teacher profile={profile} /></>}
        <ChangePassword />
      </main>
    </>
  )
}

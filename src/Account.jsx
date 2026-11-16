import { supabase } from './supabase.js'
import ChangePassword from './ChangePassword.jsx'

const ROLE = { student: 'นักศึกษา', teacher: 'อาจารย์', admin: 'ผู้ดูแลระบบ' }

export default function Account({ profile, email }) {
  const login = profile.student_code ?? email
  return (
    <>
      <section className="card">
        <h2>{profile.full_name}</h2>
        <p className="muted">{ROLE[profile.role]}{login ? ` · ${login}` : ''}</p>
        <button className="danger" onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button>
      </section>
      <ChangePassword defaultOpen />
    </>
  )
}

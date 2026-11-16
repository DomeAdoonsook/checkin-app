import { useState } from 'react'
import { supabase, errMsg } from './supabase.js'
import InstallCard from './InstallCard.jsx'

const TABS = [
  ['login', 'เข้าสู่ระบบ'],
  ['activate', 'นักศึกษา: ลงทะเบียนครั้งแรก'],
  ['teacher', 'อาจารย์: สมัครใช้งาน'],
]

export default function Login() {
  const [mode, setMode] = useState('login')   // login | activate | teacher
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState(null)        // { ok, text }
  const [busy, setBusy] = useState(false)

  const isStudent = /^\d{10}$/.test(id.trim())
  const email = isStudent ? `${id.trim()}@student.local` : id.trim()

  function go(m) { setMode(m); setMsg(null); setPw(''); setPw2('') }

  async function login(e) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    if (error) setMsg({ text: 'รหัสนักศึกษา/อีเมล หรือรหัสผ่านไม่ถูกต้อง' })
    setBusy(false)
  }

  async function activate(e) {
    e.preventDefault(); setMsg(null)
    if (pw !== pw2) return setMsg({ text: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' })
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('activate', {
      body: { student_code: id.trim(), code, password: pw },
    })
    if (error || !data?.ok) { setMsg({ text: 'ลงทะเบียนไม่สำเร็จ ตรวจสอบรหัสนักศึกษาและรหัสเปิดใช้งาน' }); setBusy(false); return }
    const { error: e2 } = await supabase.auth.signInWithPassword({ email, password: pw })
    if (e2) setMsg({ text: errMsg(e2) })
    setBusy(false)
  }

  async function registerTeacher(e) {
    e.preventDefault(); setMsg(null)
    if (pw !== pw2) return setMsg({ text: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' })
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('register-teacher', {
      body: { full_name: name, email: id.trim(), password: pw },
    })
    setBusy(false)
    if (error || !data?.ok) return setMsg({ text: 'สมัครไม่สำเร็จ (อีเมลอาจถูกใช้แล้ว หรือข้อมูลไม่ถูกต้อง)' })
    setMode('login'); setPw(''); setPw2('')
    setMsg({ ok: true, text: 'ส่งใบสมัครเรียบร้อย กรุณารอแอดมินอนุมัติ แล้วจึงเข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่ตั้งไว้' })
  }

  const submit = mode === 'login' ? login : mode === 'activate' ? activate : registerTeacher
  const isNew = mode !== 'login'

  return (
    <>
    <form className="card login" onSubmit={submit}>
      <h1>ระบบเช็คชื่อ</h1>
      <div className="tabs">
        {TABS.map(([k, label]) => (
          <button type="button" key={k} className={mode === k ? 'tab on' : 'tab'} onClick={() => go(k)}>{label}</button>
        ))}
      </div>

      {mode === 'teacher' && (
        <label>ชื่อ-นามสกุล (พร้อมคำนำหน้า)
          <input value={name} onChange={e => setName(e.target.value)} minLength={2} required />
        </label>
      )}
      <label>{mode === 'teacher' ? 'อีเมล' : 'รหัสนักศึกษา (หรืออีเมลอาจารย์)'}
        <input value={id} onChange={e => setId(e.target.value)}
          type={mode === 'teacher' ? 'email' : 'text'} autoComplete="username" required />
      </label>
      {mode === 'activate' && (
        <label>รหัสเปิดใช้งาน (จากอาจารย์)
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="XXXX-XXXX" autoCapitalize="characters" required />
        </label>
      )}
      <label>{isNew ? 'ตั้งรหัสผ่าน (อย่างน้อย 8 ตัว)' : 'รหัสผ่าน'}
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} minLength={isNew ? 8 : 1}
          autoComplete={isNew ? 'new-password' : 'current-password'} required />
      </label>
      {isNew && (
        <label>ยืนยันรหัสผ่าน
          <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} minLength={8}
            autoComplete="new-password" required />
        </label>
      )}

      {mode === 'teacher' && <p className="muted">หลังสมัคร แอดมินต้องอนุมัติและกำหนดวิชาให้ก่อนจึงจะใช้งานได้</p>}
      {mode === 'activate' && <p className="muted">ขอรหัสเปิดใช้งานได้จากอาจารย์ผู้สอน (ใช้ได้ครั้งเดียว)</p>}
      {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}

      <button disabled={busy}>
        {mode === 'login' ? 'เข้าสู่ระบบ' : mode === 'activate' ? 'ลงทะเบียน' : 'ส่งใบสมัคร'}
      </button>
    </form>
    <InstallCard />
    </>
  )
}

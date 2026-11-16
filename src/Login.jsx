import { useState } from 'react'
import { supabase, errMsg } from './supabase.js'

export default function Login() {
  const [mode, setMode] = useState('login')   // login | activate
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const isStudent = /^\d{10}$/.test(id.trim())
  const email = isStudent ? `${id.trim()}@student.local` : id.trim()

  async function login(e) {
    e.preventDefault(); setBusy(true); setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    if (error) setMsg('รหัสนักศึกษา/อีเมล หรือรหัสผ่านไม่ถูกต้อง')
    setBusy(false)
  }

  async function activate(e) {
    e.preventDefault(); setBusy(true); setMsg('')
    const { data, error } = await supabase.functions.invoke('activate', {
      body: { student_code: id.trim(), code, password: pw },
    })
    if (error || !data?.ok) { setMsg('เปิดใช้งานไม่สำเร็จ ตรวจสอบรหัสนักศึกษาและรหัสเปิดใช้งาน'); setBusy(false); return }
    const { error: e2 } = await supabase.auth.signInWithPassword({ email, password: pw })
    if (e2) setMsg(errMsg(e2))
    setBusy(false)
  }

  return (
    <form className="card login" onSubmit={mode === 'login' ? login : activate}>
      <h1>ระบบเช็คชื่อ</h1>
      <label>รหัสนักศึกษา (หรืออีเมลอาจารย์)
        <input value={id} onChange={e => setId(e.target.value)} inputMode="text" autoComplete="username" required />
      </label>
      {mode === 'activate' && (
        <label>รหัสเปิดใช้งาน (จากอาจารย์)
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="XXXX-XXXX" autoCapitalize="characters" required />
        </label>
      )}
      <label>{mode === 'activate' ? 'ตั้งรหัสผ่านใหม่ (อย่างน้อย 8 ตัว)' : 'รหัสผ่าน'}
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} minLength={mode === 'activate' ? 8 : 1}
          autoComplete={mode === 'activate' ? 'new-password' : 'current-password'} required />
      </label>
      {msg && <p className="err">{msg}</p>}
      <button disabled={busy}>{mode === 'login' ? 'เข้าสู่ระบบ' : 'เปิดใช้งานบัญชี'}</button>
      <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'activate' : 'login'); setMsg('') }}>
        {mode === 'login' ? 'ครั้งแรก? เปิดใช้งานบัญชี' : 'มีบัญชีแล้ว? เข้าสู่ระบบ'}
      </button>
    </form>
  )
}

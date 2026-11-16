import { useState } from 'react'
import { supabase } from './supabase.js'

export default function ChangePassword() {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState(null)   // { ok, text }
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (pw !== pw2) return setMsg({ ok: false, text: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' })
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: 'เปลี่ยนรหัสผ่านไม่สำเร็จ: ' + error.message })
    setPw(''); setPw2('')
    setMsg({ ok: true, text: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' })
  }

  return (
    <section className="card">
      <details>
        <summary>เปลี่ยนรหัสผ่านของฉัน</summary>
        <form onSubmit={submit}>
          <label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)
            <input type="password" minLength={8} value={pw} onChange={e => setPw(e.target.value)}
              autoComplete="new-password" required />
          </label>
          <label>ยืนยันรหัสผ่านใหม่
            <input type="password" minLength={8} value={pw2} onChange={e => setPw2(e.target.value)}
              autoComplete="new-password" required />
          </label>
          {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
          <button disabled={busy}>บันทึกรหัสผ่านใหม่</button>
        </form>
      </details>
    </section>
  )
}

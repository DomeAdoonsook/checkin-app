import { useEffect, useState } from 'react'
import { supabase, errMsg } from './supabase.js'

// หน้าแอดมิน: อนุมัติอาจารย์ที่สมัครเข้ามา + เลือกวิชาที่ให้สอน
export default function Admin() {
  const [pending, setPending] = useState([])
  const [sections, setSections] = useState([])
  const [pick, setPick] = useState({})   // { teacherId: Set(sectionId) }
  const [msg, setMsg] = useState('')

  async function load() {
    const [p, s] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').eq('role', 'teacher').eq('status', 'pending'),
      supabase.from('sections').select('id, term, group_no, courses(code, name)').order('term'),
    ])
    setPending(p.data ?? []); setSections(s.data ?? [])
  }
  useEffect(() => { load() }, [])

  function toggle(tid, sid) {
    setPick(prev => {
      const set = new Set(prev[tid] ?? [])
      set.has(sid) ? set.delete(sid) : set.add(sid)
      return { ...prev, [tid]: set }
    })
  }

  async function approve(t) {
    const ids = [...(pick[t.id] ?? [])]
    if (ids.length === 0 && !confirm(`ยังไม่ได้เลือกวิชาให้ ${t.full_name} อนุมัติโดยไม่มอบหมายวิชาใช่ไหม?`)) return
    setMsg('')
    const { error } = await supabase.rpc('admin_approve_teacher', { p_teacher: t.id, p_sections: ids })
    if (error) setMsg(errMsg(error)); else load()
  }

  async function reject(t) {
    if (!confirm(`ปฏิเสธใบสมัครของ ${t.full_name}?`)) return
    const { error } = await supabase.rpc('admin_reject_teacher', { p_teacher: t.id })
    if (error) setMsg(errMsg(error)); else load()
  }

  return (
    <section className="card">
      <h2>ใบสมัครอาจารย์ที่รออนุมัติ ({pending.length})</h2>
      {msg && <p className="err">{msg}</p>}
      {pending.length === 0 && <p className="muted">ไม่มีใบสมัครที่รออนุมัติ</p>}
      {pending.map(t => (
        <div key={t.id} className="applicant">
          <b>{t.full_name}</b> <span className="muted">{t.email}</span>
          <p className="muted">เลือกวิชาที่ให้สอน:</p>
          {sections.map(s => (
            <label key={s.id} className="check">
              <input type="checkbox" checked={pick[t.id]?.has(s.id) ?? false} onChange={() => toggle(t.id, s.id)} />
              {s.courses.code} {s.courses.name ?? ''} · ภาค {s.term} · กลุ่ม {s.group_no}
            </label>
          ))}
          <button onClick={() => approve(t)}>อนุมัติ</button>
          <button className="secondary" onClick={() => reject(t)}>ปฏิเสธ</button>
        </div>
      ))}
    </section>
  )
}

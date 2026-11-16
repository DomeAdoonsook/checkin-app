import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Icon from './Icon.jsx'

const count = q => q.then(r => r.count ?? 0)
const head = { count: 'exact', head: true }

// หน้าแรกของแอดมิน: ภาพรวมระบบ + ทางลัดไปงานที่ต้องทำ
export default function AdminHome({ onGo }) {
  const [s, setS] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      count(supabase.from('profiles').select('id', head).eq('role', 'teacher').eq('status', 'pending')),
      count(supabase.from('profiles').select('id', head).in('role', ['teacher', 'admin']).eq('status', 'active')),
      count(supabase.from('sections').select('id', head)),
      count(supabase.from('students').select('student_code', head)),
      count(supabase.from('students').select('student_code', head).not('profile_id', 'is', null)),
      count(supabase.from('class_sessions').select('id', head).is('closed_at', null)),
    ]).then(([pending, teachers, sections, students, activated, openNow]) => {
      if (alive) setS({ pending, teachers, sections, students, activated, openNow })
    })
    return () => { alive = false }
  }, [])

  if (!s) return <p className="muted">กำลังโหลดภาพรวม…</p>

  const Card = ({ n, label, go, hot }) => (
    <button className={'stat' + (hot ? ' hot' : '')} onClick={go ? () => onGo(go) : undefined} disabled={!go}>
      <span className="n">{n}</span><span className="l">{label}</span>
    </button>
  )

  return (
    <>
      {s.pending > 0 && (
        <section className="card alert">
          <b className="withico"><Icon name="file" size={18} /> มีใบสมัครอาจารย์รออนุมัติ {s.pending} ใบ</b>
          <button onClick={() => onGo('applicants')}>ตรวจสอบและอนุมัติ</button>
        </section>
      )}
      <section className="card">
        <h2>ภาพรวมระบบ</h2>
        <div className="stats">
          <Card n={s.pending} label="ใบสมัครรออนุมัติ" go="applicants" hot={s.pending > 0} />
          <Card n={s.teachers} label="อาจารย์/ผู้ดูแล ที่ใช้งานได้" />
          <Card n={s.sections} label="กลุ่มเรียนทั้งหมด" go="manage" />
          <Card n={s.students} label="นักศึกษาในระบบ" />
          <Card n={`${s.activated}/${s.students}`} label="นักศึกษาที่เปิดใช้งานบัญชีแล้ว" />
          <Card n={s.openNow} label="คาบที่กำลังเปิดเช็คชื่อ" />
        </div>
      </section>
      <section className="card">
        <h2>งานของผู้ดูแลระบบ</h2>
        <button onClick={() => onGo('applicants')}><Icon name="file" size={18} /> ตรวจสอบใบสมัครอาจารย์</button>
        <button onClick={() => onGo('manage')}><Icon name="plus" size={18} /> สร้าง/ลบวิชา และนำเข้ารายชื่อ</button>
        <button className="secondary" onClick={() => onGo('courses')}><Icon name="book" size={18} /> วิชาที่ฉันสอน (เปิดคาบ / รหัสนักศึกษา / Excel)</button>
      </section>
    </>
  )
}

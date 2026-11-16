import { useEffect, useState } from 'react'
import { supabase, errMsg } from './supabase.js'
import { fileToText, parseRows, parseFileName } from './parseRoster.js'

// หน้าแอดมิน: สร้างวิชา/กลุ่มเรียน + นำเข้ารายชื่อ + มอบหมายอาจารย์
export default function CourseManager() {
  const [open, setOpen] = useState(false)
  const [teachers, setTeachers] = useState([])
  const [sections, setSections] = useState([])
  const [f, setF] = useState({ code: '', name: '', term: '', group: '1', teacher: '' })
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [msg, setMsg] = useState(null)   // { ok, text }
  const [busy, setBusy] = useState(false)

  const { rows, skipped } = parseRows(text)

  async function load() {
    const [t, s] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role').in('role', ['teacher', 'admin']).eq('status', 'active'),
      supabase.from('sections')
        .select('id, term, group_no, courses(code, name), enrollments(count), section_teachers(profiles(full_name))')
        .order('term', { ascending: false }),
    ])
    setTeachers(t.data ?? []); setSections(s.data ?? [])
  }
  useEffect(() => { load() }, [])

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setMsg(null); setFileName(file.name)
    try {
      setText(await fileToText(file))
      const g = parseFileName(file.name)           // เช่น 10901106_1_Year_2_2569.doc
      if (g) setF(p => ({ ...p, code: p.code || g.course, group: g.group, term: p.term || g.term }))
    } catch (err) { setMsg({ text: err.message }) }
  }

  async function create() {
    setMsg(null)
    if (!f.code.trim() || !f.term.trim()) return setMsg({ text: 'กรุณากรอกรหัสวิชาและภาคเรียน' })
    if (rows.length === 0) return setMsg({ text: 'ยังไม่พบรายชื่อนักศึกษา (ต้องมีรหัสนักศึกษา 10 หลัก)' })
    if (!confirm(`สร้างวิชา ${f.code} ภาค ${f.term} กลุ่ม ${f.group}\nนำเข้านักศึกษา ${rows.length} คน?`)) return
    setBusy(true)
    const { data, error } = await supabase.rpc('admin_create_course', {
      p_code: f.code.trim(), p_name: f.name.trim(), p_term: f.term.trim(), p_group: +f.group || 1,
      p_students: rows, p_teacher: f.teacher || null,
    })
    setBusy(false)
    if (error) return setMsg({ text: errMsg(error) })
    setMsg({ ok: true, text: `สร้างเรียบร้อย: ลงทะเบียน ${data.enrolled} คน (นักศึกษาใหม่ในระบบ ${data.new_students} คน) ` +
      (f.teacher ? 'และมอบหมายอาจารย์แล้ว' : '— ยังไม่ได้เลือกอาจารย์ผู้สอน') })
    setText(''); setFileName(''); setF({ code: '', name: '', term: '', group: '1', teacher: '' })
    load()
  }

  return (
    <section className="card">
      <h2>จัดการวิชา</h2>
      <div>
        {sections.map(s => (
          <p key={s.id} className="secrow">
            <b>{s.courses.code}</b> {s.courses.name ?? ''} · ภาค {s.term} · กลุ่ม {s.group_no}
            <span className="muted"> · {s.enrollments?.[0]?.count ?? 0} คน · ผู้สอน: {
              s.section_teachers.map(t => t.profiles?.full_name).filter(Boolean).join(', ') || 'ยังไม่มี'}</span>
          </p>
        ))}
      </div>
      <button className="secondary" onClick={() => setOpen(!open)}>{open ? 'ปิดฟอร์ม' : '＋ เพิ่มวิชา / กลุ่มเรียนใหม่'}</button>

      {open && (
        <div className="coursebox">
          <label>ไฟล์รายชื่อจากทะเบียน (.doc / .csv / .txt)
            <input type="file" accept=".doc,.rtf,.csv,.txt,.tsv" onChange={onFile} />
          </label>
          <label>หรือวางรายชื่อ (รหัสนักศึกษา, ชื่อ, หลักสูตร ทีละบรรทัด)
            <textarea rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="6910101001,นายสมชาย ใจดี,วท.บ." />
          </label>
          {text && (
            <p className={rows.length ? 'ok' : 'err'}>
              พบนักศึกษา {rows.length} คน{skipped ? ` (ข้าม ${skipped} บรรทัดที่ซ้ำ/ไม่สมบูรณ์)` : ''}{fileName ? ` จาก ${fileName}` : ''}
              {rows.length > 0 && <span className="muted"> — เช่น {rows[0].code} {rows[0].name}{rows.length > 1 ? ` … ${rows[rows.length - 1].code} ${rows[rows.length - 1].name}` : ''}</span>}
            </p>
          )}
          <label>รหัสวิชา <input value={f.code} onChange={e => setF({ ...f, code: e.target.value })} /></label>
          <label>ชื่อวิชา <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label>ภาคเรียน (เช่น 2/2569) <input value={f.term} onChange={e => setF({ ...f, term: e.target.value })} /></label>
          <label>กลุ่มเรียน <input type="number" min="1" value={f.group} onChange={e => setF({ ...f, group: e.target.value })} /></label>
          <label>อาจารย์ผู้สอนหลัก
            <select value={f.teacher} onChange={e => setF({ ...f, teacher: e.target.value })}>
              <option value="">— ยังไม่เลือก —</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name} ({t.email ?? 'ไม่มีอีเมล'})</option>)}
            </select>
          </label>
          <button onClick={create} disabled={busy || rows.length === 0}>{busy ? 'กำลังสร้าง…' : 'สร้างวิชาและนำเข้ารายชื่อ'}</button>
        </div>
      )}
      {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
    </section>
  )
}

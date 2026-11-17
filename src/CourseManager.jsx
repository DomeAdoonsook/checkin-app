import { useEffect, useState } from 'react'
import { supabase, errMsg } from './supabase.js'
import { fileToText, parseRows, parseMeta, parseFileName } from './parseRoster.js'
import { exportAttendance } from './exportAttendance.js'
import Icon from './Icon.jsx'

// เพิ่มรายวิชา/กลุ่มเรียน + นำเข้ารายชื่อ
// อาจารย์ทั่วไป: เห็นและสร้างได้เฉพาะวิชาของตัวเอง | แอดมิน: ทุกวิชา เลือกผู้สอน และลบวิชาได้
export default function CourseManager({ isAdmin }) {
  const [open, setOpen] = useState(false)
  const [teachers, setTeachers] = useState([])
  const [sections, setSections] = useState([])
  const BLANK = { code: '', name: '', term: '', group: '1', teacher: '', hasLab: false, labN: '8' }
  const [f, setF] = useState(BLANK)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [msg, setMsg] = useState(null)   // { ok, text }
  const [busy, setBusy] = useState(false)
  const [working, setWorking] = useState(null)   // section id ที่กำลังส่งออก/ลบ

  const { rows, skipped, withdrawn } = parseRows(text)
  // กลุ่มเรียน (หมู่): อ่านจากคอลัมน์ "กลุ่ม" ในไฟล์ทะเบียน ถ้าไม่ระบุใช้ช่อง "กลุ่มเรียน" ในฟอร์ม
  const groupOf = r => r.group ?? (+f.group || 1)
  const fileHasGroups = rows.some(r => r.group != null)
  const groups = [...new Set(rows.map(groupOf))].sort((a, b) => a - b)

  async function load() {
    const [t, s] = await Promise.all([
      isAdmin
        ? supabase.from('profiles').select('id, full_name, email, role').in('role', ['teacher', 'admin']).eq('status', 'active')
        : Promise.resolve({ data: [] }),
      supabase.from('sections')
        .select('id, term, group_no, courses(code, name), enrollments(count), section_teachers(profiles(full_name))')
        .order('term', { ascending: false }),
    ])
    setTeachers(t.data ?? []); setSections(s.data ?? [])
  }
  useEffect(() => { load() }, [])

  async function backup(s) {
    setMsg(null); setWorking(s.id)
    try { await exportAttendance(s) } catch (e) { setMsg({ text: 'ส่งออกไม่สำเร็จ: ' + errMsg(e) }) }
    setWorking(null)
  }

  // ลบกลุ่มเรียนพร้อมข้อมูลทั้งหมด (ต้องพิมพ์รหัสวิชายืนยัน) ย้อนกลับไม่ได้
  async function removeSection(s) {
    const code = s.courses.code
    const typed = prompt(
      `คำเตือน: ลบวิชา ${code} ${s.courses.name ?? ''} (ภาค ${s.term} กลุ่ม ${s.group_no}) ?\n\n` +
      `จะลบถาวร: คาบเรียน การเช็คชื่อทั้งหมด รายชื่อนักศึกษา และการมอบหมายอาจารย์ กู้คืนไม่ได้\n` +
      `แนะนำให้กดปุ่ม Excel สำรองข้อมูลก่อน\n\nพิมพ์รหัสวิชา ${code} เพื่อยืนยัน`)
    if (typed === null) return
    if (typed.trim() !== code) return setMsg({ text: 'รหัสวิชาที่พิมพ์ไม่ตรง ยกเลิกการลบ' })
    setMsg(null); setWorking(s.id)
    const { data, error } = await supabase.rpc('admin_delete_section', { p_section: s.id })
    setWorking(null)
    if (error) return setMsg({ text: errMsg(error) })
    setMsg({ ok: true, text: `ลบเรียบร้อย: คาบ ${data.sessions} · การเช็คชื่อ ${data.attendance} รายการ · ลงทะเบียน ${data.enrollments} คน` +
      (data.students_removed ? ` · นักศึกษาในระบบที่ไม่ได้ใช้แล้ว ${data.students_removed} คน` : '') +
      (data.course_deleted ? ' · ลบรายวิชาแล้ว' : '') })
    load()
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setMsg(null); setFileName(file.name)
    try {
      const raw = await fileToText(file)
      const meta = parseMeta(raw)                  // รหัสวิชา ชื่อวิชา ภาคเรียน จากส่วนหัวของไฟล์ทะเบียน
      const parsed = parseRows(raw)
      // แสดงรหัสนักศึกษา ชื่อ-สกุล และกลุ่ม (ตัดคอลัมน์อื่นออก) ถ้าอ่านไม่ได้เลยให้แสดงต้นฉบับเพื่อตรวจ
      const clean = parsed.rows.map(r => `${r.code}\t${r.name}${r.group != null ? '\t' + r.group : ''}`).join('\n')
      setText(clean || raw)
      const g = parseFileName(file.name)           // เช่น 10901106_1_Year_2_2569.doc (ใช้เมื่อในไฟล์ไม่มีข้อมูล)
      setF(p => ({
        ...p,
        code: p.code || meta.code || g?.course || '',
        name: p.name || meta.name || '',
        term: p.term || meta.term || g?.term || '',
        group: parsed.rows.some(r => r.group != null) ? p.group : (g?.group ?? p.group),
      }))
    } catch (err) { setMsg({ text: err.message }) }
  }

  async function create() {
    setMsg(null)
    if (!f.code.trim() || !f.term.trim()) return setMsg({ text: 'กรุณากรอกรหัสวิชาและภาคเรียน' })
    if (rows.length === 0) return setMsg({ text: 'ยังไม่พบรายชื่อนักศึกษา (ต้องมีรหัสนักศึกษา 10 หลัก)' })
    const summary = groups.map(g => `กลุ่ม ${g}: ${rows.filter(r => groupOf(r) === g).length} คน`).join('\n')
    if (!confirm(`สร้างวิชา ${f.code} ภาค ${f.term}\n${summary}\n\nนำเข้าตามนี้?`)) return
    setBusy(true)
    const results = []
    for (const g of groups) {          // สร้างทีละกลุ่มเรียน (หมู่) ตามที่ไฟล์ระบุ
      const part = rows.filter(r => groupOf(r) === g).map(({ code, name }) => ({ code, name }))
      const { data, error } = await supabase.rpc('create_course', {
        p_code: f.code.trim(), p_name: f.name.trim(), p_term: f.term.trim(), p_group: g,
        p_students: part, p_teacher: f.teacher || null,
        ...(f.hasLab ? { p_lab: Math.max(1, +f.labN || 1) } : {}),   // ส่งเมื่อติ๊กว่ามีแล็บเท่านั้น (ไม่ทับค่าเดิมของกลุ่มที่นำเข้าซ้ำ)
      })
      if (error) {
        setBusy(false); load()
        return setMsg({ text: `กลุ่ม ${g}: ${errMsg(error)}` + (results.length ? ` (กลุ่ม ${results.map(r => r.g).join(', ')} สร้างสำเร็จไปแล้ว)` : '') })
      }
      results.push({ g, ...data })
    }
    setBusy(false)
    const newStudents = results.reduce((s, r) => s + r.new_students, 0)
    setMsg({ ok: true, text: `สร้างเรียบร้อย: ${results.map(r => `กลุ่ม ${r.g} ลงทะเบียน ${r.enrolled} คน`).join(' · ')} (นักศึกษาใหม่ในระบบ ${newStudents} คน) ` +
      (!isAdmin ? '— คุณเป็นผู้สอนหลักของกลุ่มนี้แล้ว ไปที่ "วิชาที่ฉันสอน" เพื่อเปิดคาบหรือออกรหัสเปิดใช้งาน'
        : f.teacher ? 'และมอบหมายอาจารย์แล้ว' : '— ยังไม่ได้เลือกอาจารย์ผู้สอน') })
    setText(''); setFileName(''); setF(BLANK)
    load()
  }

  return (
    <section className="card">
      <h2>{isAdmin ? 'จัดการวิชา' : 'เพิ่มรายวิชา'}</h2>
      {!isAdmin && <p className="muted">รายวิชาและกลุ่มเรียนของคุณ เพิ่มใหม่ได้จากไฟล์รายชื่อของทะเบียน</p>}
      <div>
        {sections.map(s => (
          <div key={s.id} className="secrow">
            <div>
              <b>{s.courses.code}</b> {s.courses.name ?? ''} · ภาค {s.term} · กลุ่ม {s.group_no}
              <span className="muted"> · {s.enrollments?.[0]?.count ?? 0} คน · ผู้สอน: {
                s.section_teachers.map(t => t.profiles?.full_name).filter(Boolean).join(', ') || 'ยังไม่มี'}</span>
            </div>
            <button className="link" disabled={working === s.id} onClick={() => backup(s)}><Icon name="download" size={16} /> Excel</button>
            {isAdmin && <button className="link danger-link" disabled={working === s.id} onClick={() => removeSection(s)}><Icon name="trash" size={16} /> ลบวิชา</button>}
          </div>
        ))}
      </div>
      <button className="secondary" onClick={() => setOpen(!open)}>{open ? 'ปิดฟอร์ม' : <><Icon name="plus" size={18} /> เพิ่มวิชา / กลุ่มเรียนใหม่</>}</button>

      {open && (
        <div className="coursebox">
          <label>ไฟล์รายชื่อจากทะเบียน (.doc / .csv / .txt)
            <input type="file" accept=".doc,.rtf,.csv,.txt,.tsv" onChange={onFile} />
          </label>
          <label>หรือวางรายชื่อ (รหัสนักศึกษา, ชื่อ-สกุล ทีละบรรทัด)
            <textarea rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="6910101001,นายสมชาย ใจดี" />
          </label>
          {text && (
            <p className={rows.length ? 'ok' : 'err'}>
              พบนักศึกษา {rows.length} คน{fileName ? ` จาก ${fileName}` : ''}
              {groups.length > 0 && <> · {groups.map(g => `กลุ่ม ${g}: ${rows.filter(r => groupOf(r) === g).length} คน`).join(' · ')}</>}
              {withdrawn ? ` · ข้ามคนที่ถอน/โอนย้ายออก ${withdrawn} คน` : ''}{skipped ? ` · ข้าม ${skipped} บรรทัดที่ซ้ำ/ไม่สมบูรณ์` : ''}
              {rows.length > 0 && <span className="muted"> — เช่น {rows[0].code} {rows[0].name}{rows.length > 1 ? ` … ${rows[rows.length - 1].code} ${rows[rows.length - 1].name}` : ''}</span>}
            </p>
          )}
          <label>รหัสวิชา <input value={f.code} onChange={e => setF({ ...f, code: e.target.value })} /></label>
          <label>ชื่อวิชา <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label>ภาคเรียน (เช่น 2/2569) <input value={f.term} onChange={e => setF({ ...f, term: e.target.value })} /></label>
          {fileHasGroups
            ? <p className="muted">กลุ่มเรียน (หมู่) อ่านจากคอลัมน์ "กลุ่ม" ในไฟล์ แยกเป็นกลุ่มให้อัตโนมัติ</p>
            : <label>กลุ่มเรียน (หมู่) <input type="number" min="1" value={f.group} onChange={e => setF({ ...f, group: e.target.value })} /></label>}
          <p className="muted">
            ไฟล์ทะเบียนที่มีหลายกลุ่ม (หมู่) จะถูกแยกให้เองในครั้งเดียว (คาบบรรยายเปิดรวมทุกหมู่ได้ ส่วนคาบแล็บเปิดแยกทีละหมู่)
          </p>
          <label className="check">
            <input type="checkbox" checked={f.hasLab} onChange={e => setF({ ...f, hasLab: e.target.checked })} />
            วิชานี้มีคาบปฏิบัติ (แล็บ)
          </label>
          {f.hasLab && (
            <label>จำนวนคาบแล็บทั้งเทอม
              <input type="number" min="1" max="200" value={f.labN} onChange={e => setF({ ...f, labN: e.target.value })} />
            </label>
          )}
          {isAdmin ? (
            <label>อาจารย์ผู้สอนหลัก
              <select value={f.teacher} onChange={e => setF({ ...f, teacher: e.target.value })}>
                <option value="">— ยังไม่เลือก —</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name} ({t.email ?? 'ไม่มีอีเมล'})</option>)}
              </select>
            </label>
          ) : <p className="muted">คุณจะเป็นผู้สอนหลักของกลุ่มเรียนนี้โดยอัตโนมัติ</p>}
          <button onClick={create} disabled={busy || rows.length === 0}>{busy ? 'กำลังสร้าง…' : 'สร้างวิชาและนำเข้ารายชื่อ'}</button>
        </div>
      )}
      {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
    </section>
  )
}

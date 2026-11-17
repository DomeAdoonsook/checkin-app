import writeExcelFile from 'write-excel-file/browser'
import { supabase } from './supabase.js'
import { buildSheets, fileNameFor } from './attendanceSheets.js'
import { planOf } from './attendanceStats.js'

// ดึงข้อมูลทั้งหมดแบบแบ่งหน้า (PostgREST จำกัด 1,000 แถวต่อคำขอ)
async function fetchAll(make) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make().range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

// คาบของกลุ่มเรียน = คาบของกลุ่มนี้ + คาบบรรยายรวมของวิชา+ภาคเรียนเดียวกัน
async function loadSessions(section) {
  try {
    const all = await fetchAll(() =>
      supabase.from('class_sessions').select('id, section_id, kind, combined, opened_at, closed_at')
        .eq('course_id', section.course_id).eq('term', section.term).order('opened_at'))
    return all.filter(s => s.section_id === section.id || s.combined)
  } catch {
    // ฐานข้อมูลยังไม่ได้อัปเดตเป็นแบบแล็บ/บรรยายรวม: ใช้คาบของกลุ่มนี้อย่างเดียว
    return fetchAll(() =>
      supabase.from('class_sessions').select('id, section_id, opened_at, closed_at')
        .eq('section_id', section.id).order('opened_at'))
  }
}

// โหลดข้อมูลการเข้าเรียนของ section: คาบ, รายชื่อนักศึกษา, รายการเช็คชื่อทั้งหมด
export async function loadSectionData(section) {
  const sessions = await loadSessions(section)
  const enr = await fetchAll(() =>
    supabase.from('enrollments').select('student_code, students(full_name)')
      .eq('section_id', section.id).order('student_code'))
  const students = enr.map(e => ({ code: e.student_code, name: e.students?.full_name ?? '' }))
  const mine = new Set(students.map(s => s.code))

  const records = []
  const ids = sessions.map(s => s.id)
  // แบ่งชุด session ไม่ให้ URL ยาวเกิน
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40)
    const part = await fetchAll(() =>
      supabase.from('attendance')
        .select('session_id, student_code, status, method, reason, checked_at')
        .in('session_id', chunk).order('id'))
    records.push(...part.filter(r => mine.has(r.student_code)))   // บรรยายรวมมีนักศึกษาหมู่อื่นด้วย เอาเฉพาะของกลุ่มนี้
  }
  return { sessions, students, records }
}

// ส่งออกการเข้าเรียนของ section เป็นไฟล์ Excel (.xlsx) ดาวน์โหลดทันที
export async function exportAttendance(section) {
  const { sessions, students, records } = await loadSectionData(section)
  const sheets = buildSheets({
    course: `${section.courses.code} ${section.courses.name ?? ''}`.trim(),
    term: section.term, group: section.group_no, sessions, students, records,
    plan: planOf(section),
  })
  await writeExcelFile(sheets).toFile(fileNameFor(section.courses.code, section.term, section.group_no))
  return { sessions: sessions.length, students: students.length, records: records.length }
}

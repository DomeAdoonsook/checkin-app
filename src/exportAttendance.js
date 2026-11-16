import writeExcelFile from 'write-excel-file/browser'
import { supabase } from './supabase.js'
import { buildSheets, fileNameFor } from './attendanceSheets.js'

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

// ส่งออกการเข้าเรียนของ section เป็นไฟล์ Excel (.xlsx) ดาวน์โหลดทันที
export async function exportAttendance(section) {
  const sessions = await fetchAll(() =>
    supabase.from('class_sessions').select('id, opened_at, closed_at')
      .eq('section_id', section.id).order('opened_at'))
  const enr = await fetchAll(() =>
    supabase.from('enrollments').select('student_code, students(full_name)')
      .eq('section_id', section.id).order('student_code'))
  const students = enr.map(e => ({ code: e.student_code, name: e.students?.full_name ?? '' }))

  let records = []
  if (sessions.length) {
    const ids = sessions.map(s => s.id)
    // แบ่งชุด session ไม่ให้ URL ยาวเกิน
    for (let i = 0; i < ids.length; i += 40) {
      const chunk = ids.slice(i, i + 40)
      records.push(...await fetchAll(() =>
        supabase.from('attendance')
          .select('session_id, student_code, status, method, reason, checked_at')
          .in('session_id', chunk).order('id')))
    }
  }

  const sheets = buildSheets({
    course: `${section.courses.code} ${section.courses.name ?? ''}`.trim(),
    term: section.term, group: section.group_no, sessions, students, records,
  })
  await writeExcelFile(sheets).toFile(fileNameFor(section.courses.code, section.term, section.group_no))
  return { sessions: sessions.length, students: students.length, records: records.length }
}

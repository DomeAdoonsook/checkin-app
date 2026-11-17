// คำนวณสถิติการเข้าเรียน (กติกาเดียวกับไฟล์ Excel)
//  - นับเฉพาะคาบที่ปิดแล้ว คาบที่ยังเปิดอยู่ไม่นับเป็นขาด
//  - ไม่มีรายการเช็คชื่อในคาบที่ปิดแล้ว = ขาด
//  - % เข้าเรียน = (มา + สาย) / จำนวนคาบที่ปิดแล้ว (ลาไม่นับเป็นเข้าเรียน, "รอตรวจ" ยังไม่นับ)
export const LABEL = { present: 'มา', late: 'สาย', absent: 'ขาด', leave: 'ลา', pending: 'รอตรวจ' }

export function computeStats({ sessions, students, records }) {
  const rec = new Map(records.map(r => [`${r.session_id}|${r.student_code}`, r]))
  const closed = sessions.filter(s => s.closed_at)

  const perStudent = students.map(st => {
    const c = { present: 0, late: 0, leave: 0, absent: 0, pending: 0 }
    const cells = sessions.map(s => {
      const r = rec.get(`${s.id}|${st.code}`)
      if (!s.closed_at) return r ? r.status : null            // คาบที่ยังเปิดอยู่
      const status = r ? r.status : 'absent'
      c[status] = (c[status] ?? 0) + 1
      return status
    })
    const pct = closed.length ? (c.present + c.late) / closed.length : null
    return { ...st, cells, counts: c, pct }
  })

  const perSession = sessions.map(s => {
    const c = { present: 0, late: 0, leave: 0, absent: 0, pending: 0 }
    for (const st of students) {
      const r = rec.get(`${s.id}|${st.code}`)
      if (!r) { if (s.closed_at) c.absent++ ; continue }
      c[r.status] = (c[r.status] ?? 0) + 1
    }
    return { ...s, counts: c, total: students.length }
  })

  const withPct = perStudent.filter(s => s.pct != null)
  const avg = withPct.length ? withPct.reduce((a, s) => a + s.pct, 0) / withPct.length : null
  return { perStudent, perSession, closedCount: closed.length, avg }
}

// คำนวณสถิติการเข้าเรียน (กติกาเดียวกับไฟล์ Excel)
//  - นับเฉพาะคาบที่ปิดแล้ว คาบที่ยังเปิดอยู่ไม่นับเป็นขาด
//  - ไม่มีรายการเช็คชื่อในคาบที่ปิดแล้ว = ขาด
//  - เข้าเรียน = มา + สาย (ลาไม่นับเป็นเข้าเรียน, "รอตรวจ" ยังไม่นับ)
export const LABEL = { present: 'มา', late: 'สาย', absent: 'ขาด', leave: 'ลา', pending: 'รอตรวจ' }
export const DEFAULT_PLAN = { planned: 16, minPct: 80 }
export const STATUS_LABEL = { pass: 'ผ่านเกณฑ์แล้ว', ok: 'ปกติ', risk: 'เสี่ยง', fail: 'ไม่ผ่านเกณฑ์' }

// สถานะตลอดเทอม: เทียบกับจำนวนคาบทั้งเทอมตามแผน
//   required  = จำนวนครั้งที่ต้องเข้าเรียนอย่างน้อย (ปัดขึ้น)
//   allowed   = ขาดได้อีกกี่ครั้งโดยยังถึงเกณฑ์ (ถ้า < 0 คือเป็นไปไม่ได้แล้ว)
//   status    = pass (ครบเกณฑ์แล้ว) | ok | risk (ขาดได้อีก ≤ 2 ครั้ง) | fail (ต่อให้มาครบที่เหลือก็ไม่ถึง)
export function termStatus({ attended, closed, planned, minPct }) {
  const total = Math.max(planned || DEFAULT_PLAN.planned, closed)      // เรียนเกินแผนแล้วใช้จำนวนจริง
  const min = minPct ?? DEFAULT_PLAN.minPct
  const required = Math.ceil((min / 100) * total - 1e-9)
  const remaining = total - closed
  const allowedRaw = attended + remaining - required
  let status
  if (attended >= required) status = 'pass'
  else if (allowedRaw < 0) status = 'fail'
  else if (allowedRaw <= 2) status = 'risk'
  else status = 'ok'
  return {
    total, required, remaining, status,
    allowed: Math.max(-1, Math.min(allowedRaw, remaining)),          // -1 = ไม่ถึงเกณฑ์แล้ว
    pct: total ? attended / total : null,                            // % ตามคาบทั้งเทอม
  }
}

export function computeStats({ sessions, students, records, planned, minPct }) {
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
    const attended = c.present + c.late
    const pct = closed.length ? attended / closed.length : null  // % ตามคาบที่ปิดแล้ว
    const term = termStatus({ attended, closed: closed.length, planned, minPct })
    return { ...st, cells, counts: c, attended, pct, term }
  })

  const perSession = sessions.map(s => {
    const c = { present: 0, late: 0, leave: 0, absent: 0, pending: 0 }
    for (const st of students) {
      const r = rec.get(`${s.id}|${st.code}`)
      if (!r) { if (s.closed_at) c.absent++; continue }
      c[r.status] = (c[r.status] ?? 0) + 1
    }
    return { ...s, counts: c, total: students.length }
  })

  const withPct = perStudent.filter(s => s.pct != null)
  const avg = withPct.length ? withPct.reduce((a, s) => a + s.pct, 0) / withPct.length : null
  const byStatus = { pass: 0, ok: 0, risk: 0, fail: 0 }
  for (const s of perStudent) byStatus[s.term.status]++
  return { perStudent, perSession, closedCount: closed.length, avg, byStatus }
}

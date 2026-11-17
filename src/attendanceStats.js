// คำนวณสถิติการเข้าเรียน (กติกาเดียวกับไฟล์ Excel)
//  - นับเฉพาะคาบที่ปิดแล้ว คาบที่ยังเปิดอยู่ไม่นับเป็นขาด
//  - ไม่มีรายการเช็คชื่อในคาบที่ปิดแล้ว = ขาด
//  - เข้าเรียน = มา + สาย (ลาไม่นับเป็นเข้าเรียน, "รอตรวจ" ยังไม่นับ)
//  - บรรยายกับแล็บ นับแยกกัน มีจำนวนคาบทั้งเทอมและเกณฑ์ % ของตัวเอง และต้องผ่านทั้งสองส่วน
export const LABEL = { present: 'มา', late: 'สาย', absent: 'ขาด', leave: 'ลา', pending: 'รอตรวจ' }
export const KIND_LABEL = { lecture: 'บรรยาย', lab: 'แล็บ' }
export const DEFAULT_PLAN = {
  lecture: { planned: 16, minPct: 80 },
  lab: { planned: 0, minPct: 80 },
}
export const STATUS_LABEL = { pass: 'ผ่านเกณฑ์แล้ว', ok: 'ปกติ', risk: 'เสี่ยง', fail: 'ไม่ผ่านเกณฑ์' }

export const kindOf = s => (s.kind === 'lab' ? 'lab' : 'lecture')

// นโยบายของกลุ่มเรียนจากแถวใน sections (ใช้ค่าเริ่มต้นถ้ายังไม่ได้ตั้ง)
export function planOf(sec) {
  return {
    lecture: { planned: sec?.planned_sessions ?? DEFAULT_PLAN.lecture.planned, minPct: sec?.min_attendance_pct ?? DEFAULT_PLAN.lecture.minPct },
    lab: { planned: sec?.planned_lab_sessions ?? DEFAULT_PLAN.lab.planned, minPct: sec?.min_lab_pct ?? DEFAULT_PLAN.lab.minPct },
  }
}

// สถานะตลอดเทอม: เทียบกับจำนวนคาบทั้งเทอมตามแผน
//   required  = จำนวนครั้งที่ต้องเข้าเรียนอย่างน้อย (ปัดขึ้น)
//   allowed   = ขาดได้อีกกี่ครั้งโดยยังถึงเกณฑ์ (-1 = เป็นไปไม่ได้แล้ว)
//   status    = pass (ครบเกณฑ์แล้ว) | ok | risk (ขาดได้อีก ≤ 2 ครั้ง) | fail (ต่อให้มาครบที่เหลือก็ไม่ถึง)
export function termStatus({ attended, closed, planned, minPct }) {
  const total = Math.max(planned ?? DEFAULT_PLAN.lecture.planned, closed)   // เรียนเกินแผนแล้วใช้จำนวนจริง
  const min = minPct ?? 80
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
    allowed: Math.max(-1, Math.min(allowedRaw, remaining)),
    pct: total ? attended / total : null,                            // % ตามคาบทั้งเทอม
  }
}

// สถานะรวมของหลายส่วน (บรรยาย + แล็บ): ผ่านเมื่อผ่านครบทุกส่วน, ไม่ผ่านถ้าส่วนใดส่วนหนึ่งไม่ผ่าน
export function combineStatus(list) {
  const xs = list.filter(Boolean)
  if (xs.includes('fail')) return 'fail'
  if (xs.includes('risk')) return 'risk'
  if (xs.length && xs.every(x => x === 'pass')) return 'pass'
  return 'ok'
}

const blank = () => ({ present: 0, late: 0, leave: 0, absent: 0, pending: 0 })

// plan = { lecture: {planned, minPct}, lab: {planned, minPct} } (ดู planOf)
export function computeStats({ sessions, students, records, plan = DEFAULT_PLAN }) {
  const rec = new Map(records.map(r => [`${r.session_id}|${r.student_code}`, r]))
  const closed = sessions.filter(s => s.closed_at)
  const closedBy = { lecture: closed.filter(s => kindOf(s) === 'lecture').length, lab: closed.filter(s => kindOf(s) === 'lab').length }
  const hasLab = (plan.lab?.planned ?? 0) > 0 || sessions.some(s => kindOf(s) === 'lab')

  const perStudent = students.map(st => {
    const by = { lecture: blank(), lab: blank() }
    const cells = sessions.map(s => {
      const r = rec.get(`${s.id}|${st.code}`)
      if (!s.closed_at) return r ? r.status : null            // คาบที่ยังเปิดอยู่
      const status = r ? r.status : 'absent'
      by[kindOf(s)][status] = (by[kindOf(s)][status] ?? 0) + 1
      return status
    })
    const mk = kind => {
      const c = by[kind]
      const attended = c.present + c.late
      return {
        counts: c, attended, closed: closedBy[kind],
        pct: closedBy[kind] ? attended / closedBy[kind] : null,                  // % ตามคาบที่ปิดแล้ว
        term: termStatus({ attended, closed: closedBy[kind], planned: plan[kind]?.planned, minPct: plan[kind]?.minPct }),
      }
    }
    const lec = mk('lecture'), lab = mk('lab')
    const counts = {}
    for (const k of Object.keys(blank())) counts[k] = lec.counts[k] + lab.counts[k]
    const attended = lec.attended + lab.attended
    return {
      ...st, cells, counts, attended,
      pct: closed.length ? attended / closed.length : null,
      lec, lab,
      status: combineStatus([lec.term.status, hasLab ? lab.term.status : null]),
    }
  })

  const perSession = sessions.map(s => {
    const c = blank()
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
  for (const s of perStudent) byStatus[s.status]++
  return { perStudent, perSession, closedCount: closed.length, closedBy, hasLab, avg, byStatus }
}

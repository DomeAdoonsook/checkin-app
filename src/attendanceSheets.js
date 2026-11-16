// สร้างข้อมูลสมุดงาน Excel จากข้อมูลการเข้าเรียน (ฟังก์ชันล้วน ไม่แตะเครือข่าย)
const LABEL = { present: 'มา', late: 'สาย', absent: 'ขาด', leave: 'ลา', pending: 'รอตรวจ' }
const FILL = { 'ขาด': '#fee2e2', 'สาย': '#fef3c7', 'ลา': '#e0e7ff', 'รอตรวจ': '#fde68a' }
const HEAD = { fontWeight: 'bold', backgroundColor: '#dbeafe', align: 'center', alignVertical: 'center' }

const when = d => new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const full = d => new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

// sessions: [{id, opened_at, closed_at}] เรียงตามเวลา | students: [{code, name}] | records: [{session_id, student_code, status, method, reason, checked_at}]
export function buildSheets({ course, term, group, sessions, students, records }) {
  const rec = new Map(records.map(r => [`${r.session_id}|${r.student_code}`, r]))
  const closed = sessions.filter(s => s.closed_at)

  // ---- แผ่นสรุป ----
  const head = ['ลำดับ', 'รหัสนักศึกษา', 'ชื่อ-นามสกุล', ...sessions.map(s => when(s.opened_at)),
    'มา', 'สาย', 'ลา', 'ขาด', 'คาบที่ปิดแล้ว', '% เข้าเรียน'].map(v => ({ value: v, ...HEAD }))
  const rows = [head]
  students.forEach((st, i) => {
    let p = 0, l = 0, lv = 0, ab = 0
    const cells = sessions.map(s => {
      const r = rec.get(`${s.id}|${st.code}`)
      if (!s.closed_at) return { value: r ? LABEL[r.status] : '', align: 'center' }   // คาบที่ยังเปิดอยู่ ยังไม่นับขาด
      const label = r ? LABEL[r.status] : 'ขาด'
      if (label === 'มา') p++; else if (label === 'สาย') l++; else if (label === 'ลา') lv++; else if (label === 'ขาด') ab++
      const c = { value: label, align: 'center' }
      if (FILL[label]) c.backgroundColor = FILL[label]
      return c
    })
    const pct = closed.length ? (p + l) / closed.length : 0
    rows.push([
      { value: i + 1, align: 'center' }, st.code, st.name, ...cells,
      { value: p, align: 'center' }, { value: l, align: 'center' }, { value: lv, align: 'center' }, { value: ab, align: 'center' },
      { value: closed.length, align: 'center' }, { value: pct, format: '0%', align: 'center', fontWeight: 'bold' },
    ])
  })
  const summary = {
    data: rows, sheet: 'สรุป', stickyRowsCount: 1, stickyColumnsCount: 3,
    columns: [{ width: 7 }, { width: 14 }, { width: 30 }, ...sessions.map(() => ({ width: 13 })),
      { width: 6 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 14 }, { width: 12 }],
  }

  // ---- แผ่นรายละเอียด (ทุกรายการที่บันทึก) ----
  const sById = new Map(sessions.map(s => [s.id, s]))
  const nameBy = new Map(students.map(s => [s.code, s.name]))
  const detail = [['คาบ', 'รหัสนักศึกษา', 'ชื่อ-นามสกุล', 'สถานะ', 'วิธีบันทึก', 'เหตุผล (กรณีอาจารย์บันทึก)', 'เวลาที่บันทึก']
    .map(v => ({ value: v, ...HEAD }))]
  const sorted = [...records].sort((a, b) =>
    (sById.get(a.session_id)?.opened_at ?? '').localeCompare(sById.get(b.session_id)?.opened_at ?? '') ||
    a.student_code.localeCompare(b.student_code))
  for (const r of sorted) {
    detail.push([
      sById.has(r.session_id) ? full(sById.get(r.session_id).opened_at) : '',
      r.student_code, nameBy.get(r.student_code) ?? '', LABEL[r.status] ?? r.status,
      r.method === 'teacher_manual' ? 'อาจารย์บันทึก' : 'นักศึกษาเช็คเอง', r.reason ?? '', r.checked_at ? full(r.checked_at) : '',
    ])
  }
  const details = {
    data: detail, sheet: 'รายละเอียด', stickyRowsCount: 1,
    columns: [{ width: 20 }, { width: 14 }, { width: 30 }, { width: 10 }, { width: 16 }, { width: 34 }, { width: 20 }],
  }

  // ---- แผ่นหมายเหตุ ----
  const note = {
    data: [
      [{ value: 'รายงานการเข้าเรียน', fontWeight: 'bold', fontSize: 14 }],
      [`วิชา ${course}`], [`ภาคเรียน ${term} กลุ่ม ${group}`],
      [`ส่งออกเมื่อ ${full(new Date())}`], [`จำนวนนักศึกษา ${students.length} คน · คาบทั้งหมด ${sessions.length} คาบ (ปิดแล้ว ${closed.length} คาบ)`],
      [''],
      [{ value: 'วิธีนับ', fontWeight: 'bold' }],
      ['• นับเฉพาะคาบที่ "ปิดแล้ว" คาบที่ยังเปิดอยู่จะไม่ถูกนับเป็นขาด'],
      ['• นักศึกษาที่ไม่มีรายการเช็คชื่อในคาบที่ปิดแล้ว นับเป็น "ขาด"'],
      ['• % เข้าเรียน = (มา + สาย) ÷ จำนวนคาบที่ปิดแล้ว (ลาไม่นับเป็นเข้าเรียน)'],
      ['• "รอตรวจ" คือรายการที่ระบบติดธง (เช่น เครื่องเดียวกันเช็คหลายบัญชี) และอาจารย์ยังไม่ตัดสิน นับเป็นขาดจนกว่าจะอนุมัติ'],
    ],
    sheet: 'หมายเหตุ', columns: [{ width: 110 }],
  }
  return [summary, details, note]
}

export function fileNameFor(course, term, group) {
  return `attendance-${course}-${String(term).replace('/', '-')}-g${group}.xlsx`
}

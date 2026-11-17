// สร้างข้อมูลสมุดงาน Excel จากข้อมูลการเข้าเรียน (ฟังก์ชันล้วน ไม่แตะเครือข่าย)
import { computeStats, planOf, kindOf, KIND_LABEL, STATUS_LABEL } from './attendanceStats.js'

const LABEL = { present: 'มา', late: 'สาย', absent: 'ขาด', leave: 'ลา', pending: 'รอตรวจ' }
const FILL = { 'ขาด': '#fee2e2', 'สาย': '#fef3c7', 'ลา': '#e0e7ff', 'รอตรวจ': '#fde68a' }
const STATUS_FILL = { pass: '#dcfce7', risk: '#fef3c7', fail: '#fee2e2' }
const HEAD = { fontWeight: 'bold', backgroundColor: '#dbeafe', align: 'center', alignVertical: 'center', wrap: true }
const cen = (v, extra = {}) => ({ value: v, align: 'center', ...extra })

const when = d => new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const full = d => new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
const sessionHead = s => `${when(s.opened_at)} (${KIND_LABEL[kindOf(s)]}${s.combined ? ' รวม' : ''})`

// sessions: [{id, kind, combined, opened_at, closed_at}] เรียงตามเวลา | students: [{code, name}]
// records: [{session_id, student_code, status, method, reason, checked_at}] | plan: ดู planOf()
export function buildSheets({ course, term, group, sessions, students, records, plan = planOf() }) {
  const rec = new Map(records.map(r => [`${r.session_id}|${r.student_code}`, r]))
  const closed = sessions.filter(s => s.closed_at)
  const stats = computeStats({ sessions, students, records, plan })
  const hasLab = stats.hasLab

  // ---- แผ่นสรุป (รายคน × รายคาบ) ----
  const head = ['ลำดับ', 'รหัสนักศึกษา', 'ชื่อ-นามสกุล', ...sessions.map(sessionHead),
    'มา', 'สาย', 'ลา', 'ขาด', 'คาบที่ปิดแล้ว', '% เข้าเรียน'].map(v => ({ value: v, ...HEAD }))
  const rows = [head]
  stats.perStudent.forEach((st, i) => {
    const cells = st.cells.map(c => {
      if (c == null) return cen('')
      const label = LABEL[c]
      return cen(label, FILL[label] ? { backgroundColor: FILL[label] } : {})
    })
    rows.push([
      cen(i + 1), st.code, st.name, ...cells,
      cen(st.counts.present), cen(st.counts.late), cen(st.counts.leave), cen(st.counts.absent),
      cen(closed.length), cen(st.pct ?? 0, { format: '0%', fontWeight: 'bold' }),
    ])
  })
  const summary = {
    data: rows, sheet: 'สรุป', stickyRowsCount: 1, stickyColumnsCount: 3,
    columns: [{ width: 7 }, { width: 14 }, { width: 30 }, ...sessions.map(() => ({ width: 17 })),
      { width: 6 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 14 }, { width: 12 }],
  }

  // ---- แผ่นสรุปตลอดเทอม (เทียบกับจำนวนคาบทั้งเทอมตามแผน แยกบรรยาย/แล็บ) ----
  const kinds = hasLab ? ['lecture', 'lab'] : ['lecture']
  const th = ['ลำดับ', 'รหัสนักศึกษา', 'ชื่อ-นามสกุล']
  for (const k of kinds) {
    const P = plan[k].planned
    th.push(`${KIND_LABEL[k]}: มา`, `${KIND_LABEL[k]}: สาย`, `${KIND_LABEL[k]}: ลา`, `${KIND_LABEL[k]}: ขาด`,
      `${KIND_LABEL[k]}: % ตามคาบทั้งเทอม (${P} คาบ)`, `${KIND_LABEL[k]}: ต้องเข้าอย่างน้อย`, `${KIND_LABEL[k]}: ขาดได้อีก`, `${KIND_LABEL[k]}: สถานะ`)
  }
  th.push('สถานะรวม')
  const termRows = [th.map(v => ({ value: v, ...HEAD }))]
  stats.perStudent.forEach((st, i) => {
    const row = [cen(i + 1), st.code, st.name]
    for (const k of kinds) {
      const x = k === 'lab' ? st.lab : st.lec
      const fill = STATUS_FILL[x.term.status]
      row.push(cen(x.counts.present), cen(x.counts.late), cen(x.counts.leave), cen(x.counts.absent),
        cen(x.term.pct ?? 0, { format: '0%', fontWeight: 'bold' }),
        cen(x.term.required), cen(x.term.allowed < 0 ? 0 : x.term.allowed),
        cen(STATUS_LABEL[x.term.status], fill ? { backgroundColor: fill } : {}))
    }
    const fillAll = STATUS_FILL[st.status]
    row.push(cen(STATUS_LABEL[st.status], { fontWeight: 'bold', ...(fillAll ? { backgroundColor: fillAll } : {}) }))
    termRows.push(row)
  })
  const termSheet = {
    data: termRows, sheet: 'สรุปตลอดเทอม', stickyRowsCount: 1, stickyColumnsCount: 3,
    columns: [{ width: 7 }, { width: 14 }, { width: 30 },
      ...kinds.flatMap(() => [6, 6, 6, 6, 20, 14, 12, 14].map(width => ({ width }))), { width: 16 }],
  }

  // ---- แผ่นรายละเอียด (ทุกรายการที่บันทึก) ----
  const sById = new Map(sessions.map(s => [s.id, s]))
  const nameBy = new Map(students.map(s => [s.code, s.name]))
  const detail = [['คาบ', 'ประเภท', 'รหัสนักศึกษา', 'ชื่อ-นามสกุล', 'สถานะ', 'วิธีบันทึก', 'เหตุผล (กรณีอาจารย์บันทึก)', 'เวลาที่บันทึก']
    .map(v => ({ value: v, ...HEAD }))]
  const sorted = [...records].sort((a, b) =>
    (sById.get(a.session_id)?.opened_at ?? '').localeCompare(sById.get(b.session_id)?.opened_at ?? '') ||
    a.student_code.localeCompare(b.student_code))
  for (const r of sorted) {
    const s = sById.get(r.session_id)
    detail.push([
      s ? full(s.opened_at) : '', s ? `${KIND_LABEL[kindOf(s)]}${s.combined ? ' (รวม)' : ''}` : '',
      r.student_code, nameBy.get(r.student_code) ?? '', LABEL[r.status] ?? r.status,
      r.method === 'teacher_manual' ? 'อาจารย์บันทึก' : 'นักศึกษาเช็คเอง', r.reason ?? '', r.checked_at ? full(r.checked_at) : '',
    ])
  }
  const details = {
    data: detail, sheet: 'รายละเอียด', stickyRowsCount: 1,
    columns: [{ width: 20 }, { width: 14 }, { width: 14 }, { width: 30 }, { width: 10 }, { width: 16 }, { width: 34 }, { width: 20 }],
  }

  // ---- แผ่นหมายเหตุ ----
  const req = k => Math.ceil((plan[k].minPct / 100) * plan[k].planned - 1e-9)
  const note = {
    data: [
      [{ value: 'รายงานการเข้าเรียน', fontWeight: 'bold', fontSize: 14 }],
      [`วิชา ${course}`], [`ภาคเรียน ${term} กลุ่ม ${group}`],
      [`ส่งออกเมื่อ ${full(new Date())}`],
      [`จำนวนนักศึกษา ${students.length} คน · คาบทั้งหมด ${sessions.length} คาบ (ปิดแล้ว ${closed.length} คาบ: บรรยาย ${stats.closedBy.lecture}${hasLab ? `, แล็บ ${stats.closedBy.lab}` : ''})`],
      [''],
      [{ value: 'วิธีนับ', fontWeight: 'bold' }],
      ['• นับเฉพาะคาบที่ "ปิดแล้ว" คาบที่ยังเปิดอยู่จะไม่ถูกนับเป็นขาด'],
      ['• นักศึกษาที่ไม่มีรายการเช็คชื่อในคาบที่ปิดแล้ว นับเป็น "ขาด"'],
      ['• เข้าเรียน = มา + สาย (ลาไม่นับเป็นเข้าเรียน)'],
      ['• "รอตรวจ" คือรายการที่ระบบติดธง (เช่น เครื่องเดียวกันเช็คหลายบัญชี) และอาจารย์ยังไม่ตัดสิน นับเป็นขาดจนกว่าจะอนุมัติ'],
      ['• คาบบรรยายที่ระบุ "รวม" คือบรรยายรวมทุกหมู่เรียนของวิชาเดียวกัน (นับให้ทุกหมู่)'],
      [''],
      [{ value: 'สรุปตลอดเทอม', fontWeight: 'bold' }],
      [`• บรรยาย: ทั้งเทอม ${plan.lecture.planned} คาบ เกณฑ์ ${plan.lecture.minPct}% (ต้องเข้าอย่างน้อย ${req('lecture')} ครั้ง)`],
      ...(hasLab ? [[`• แล็บ: ทั้งเทอม ${plan.lab.planned} คาบ เกณฑ์ ${plan.lab.minPct}% (ต้องเข้าอย่างน้อย ${req('lab')} ครั้ง)`],
        ['• สถานะรวม: ต้องผ่านเกณฑ์ทั้งบรรยายและแล็บ']] : []),
      ['• สถานะ: ผ่านเกณฑ์แล้ว = เข้าเรียนครบเกณฑ์แล้ว · ปกติ = ขาดได้อีกมากกว่า 2 ครั้ง · เสี่ยง = ขาดได้อีกไม่เกิน 2 ครั้ง · ไม่ผ่านเกณฑ์ = ต่อให้มาครบทุกคาบที่เหลือก็ไม่ถึงเกณฑ์'],
    ],
    sheet: 'หมายเหตุ', columns: [{ width: 110 }],
  }
  return [summary, termSheet, details, note]
}

export function fileNameFor(course, term, group) {
  return `attendance-${course}-${String(term).replace('/', '-')}-g${group}.xlsx`
}

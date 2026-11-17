import { useEffect, useMemo, useState } from 'react'
import { supabase, errMsg } from './supabase.js'
import { loadSectionData, exportAttendance } from './exportAttendance.js'
import { computeStats, planOf, kindOf, LABEL, KIND_LABEL, STATUS_LABEL } from './attendanceStats.js'
import { Roster } from './Teacher.jsx'
import Icon from './Icon.jsx'

const BASE = 'id, course_id, term, group_no, courses(code, name)'
const COLS = `${BASE}, planned_sessions, min_attendance_pct, planned_lab_sessions, min_lab_pct`
const when = d => new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const pctText = p => (p == null ? '–' : `${Math.round(p * 100)}%`)
const read = (k, d) => { try { return sessionStorage.getItem(k) ?? d } catch { return d } }
const BINS = [['ต่ำกว่า 60%', 0, 60], ['60–69%', 60, 70], ['70–79%', 70, 80], ['80–89%', 80, 90], ['90–100%', 90, 101]]
const toPlan = p => ({ lecture: { planned: p.lecPlanned, minPct: p.lecMin }, lab: { planned: p.labPlanned, minPct: p.labMin } })
const fromSection = sec => {
  const p = planOf(sec)
  return { lecPlanned: p.lecture.planned, lecMin: p.lecture.minPct, labPlanned: p.lab.planned, labMin: p.lab.minPct }
}

function NumField({ label, value, min, max, onChange }) {
  return (
    <label className="inline">{label}
      <input type="number" min={min} max={max} value={value}
        onChange={e => onChange(Math.min(max, Math.max(min, +e.target.value || min)))} />
    </label>
  )
}

// หน้า "ผลการเช็คชื่อ": สรุปตลอดเทอม / รายคน × รายคาบ / รายคาบ ของแต่ละวิชา (แยกบรรยาย/แล็บ)
export default function Results({ isAdmin }) {
  const [sections, setSections] = useState(null)
  const [sid, setSid] = useState(() => read('resultsSection', ''))
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('term')
  const [plan, setPlan] = useState(fromSection(null))
  const [lowFirst, setLowFirst] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [exporting, setExporting] = useState(false)

  // รายการวิชา: แอดมินเห็นทุกวิชา, อาจารย์เห็นเฉพาะวิชาที่ตัวเองสอน
  async function loadSections() {
    const { data: { session } } = await supabase.auth.getSession()
    const fetchList = async cols => {
      if (isAdmin) return supabase.from('sections').select(cols).order('term', { ascending: false })
      return supabase.from('section_teachers').select(`sections(${cols})`).eq('teacher_id', session.user.id)
    }
    // ถ้ายังไม่ได้ติดตั้ง SQL นโยบาย/แล็บ ให้ถอยไปใช้คอลัมน์พื้นฐาน แสดงค่าเริ่มต้น 16 คาบ / 80%
    let res = await fetchList(COLS)
    if (res.error) res = await fetchList(BASE)
    const list = isAdmin ? (res.data ?? []) : (res.data ?? []).map(r => r.sections).filter(Boolean)
    setSections(list)
    setSid(cur => (list.some(s => s.id === cur) ? cur : list[0]?.id ?? ''))
    return list
  }
  useEffect(() => { loadSections() }, [isAdmin])

  const section = sections?.find(s => s.id === sid)
  const saved = fromSection(section)

  // เปลี่ยนวิชา -> ใช้นโยบายที่บันทึกไว้ของวิชานั้น
  useEffect(() => { if (section) setPlan(fromSection(section)) },
    [section?.id, section?.planned_sessions, section?.min_attendance_pct, section?.planned_lab_sessions, section?.min_lab_pct])

  async function reload() {
    if (!section) return
    setErr('')
    try { setData(await loadSectionData(section)) } catch (e) { setErr(errMsg(e)) }
  }
  useEffect(() => { setData(null); setOpenId(null); setNote(''); reload() }, [section?.id])
  useEffect(() => { if (tab !== 'sessions') reload() }, [tab])      // กลับมาแท็บสรุป โหลดใหม่ (เผื่อมีการแก้รายคาบ)

  function pick(id) { setSid(id); try { sessionStorage.setItem('resultsSection', id) } catch { /* ignore */ } }

  const stats = useMemo(() => (data ? computeStats({ ...data, plan: toPlan(plan) }) : null), [data, plan])
  const dirty = section && JSON.stringify(plan) !== JSON.stringify(saved)
  const hasLab = !!stats?.hasLab

  async function savePlan() {
    setErr(''); setNote('')
    const { error } = await supabase.rpc('set_section_policy', {
      p_section: section.id, p_planned: plan.lecPlanned, p_min: plan.lecMin,
      p_lab_planned: plan.labPlanned, p_lab_min: plan.labMin,
    })
    if (error) return setErr(errMsg(error))
    await loadSections()
    setNote('บันทึกนโยบายแล้ว นักศึกษาจะเห็นสถานะตามค่านี้')
  }

  async function doExport() {
    setExporting(true); setErr('')
    try {
      await exportAttendance({
        ...section, planned_sessions: plan.lecPlanned, min_attendance_pct: plan.lecMin,
        planned_lab_sessions: plan.labPlanned, min_lab_pct: plan.labMin,
      })
    } catch (e) { setErr('ส่งออกไม่สำเร็จ: ' + errMsg(e)) }
    setExporting(false)
  }

  if (sections === null) return <p className="muted">กำลังโหลด…</p>
  if (sections.length === 0) return <p className="card muted">ยังไม่มีวิชาให้ดูผล ไปที่เมนู "เพิ่มรายวิชา" หรือ "จัดการวิชา" เพื่อเพิ่มวิชาก่อน</p>

  // % ตามคาบทั้งเทอมรวมบรรยาย+แล็บ (ใช้เรียงและทำกราฟ)
  const termPct = r => {
    const total = r.lec.term.total + (hasLab ? r.lab.term.total : 0)
    return total ? (r.lec.attended + (hasLab ? r.lab.attended : 0)) / total : null
  }
  const rowsLow = stats ? [...stats.perStudent].sort((a, b) => (termPct(a) ?? 2) - (termPct(b) ?? 2)) : []
  const lowStudents = stats ? stats.perStudent.filter(s => s.status === 'risk' || s.status === 'fail') : []
  const hist = stats ? BINS.map(([label, lo, hi]) => ({
    label, n: stats.perStudent.filter(s => { const p = termPct(s); return p != null && p * 100 >= lo && p * 100 < hi }).length })) : []
  const maxBin = Math.max(1, ...hist.map(h => h.n))
  const kinds = hasLab ? ['lecture', 'lab'] : ['lecture']
  const first = stats?.perStudent[0]

  return (
    <>
      <section className="card">
        <label>เลือกวิชา
          <select value={sid} onChange={e => pick(e.target.value)}>
            {sections.map(s => (
              <option key={s.id} value={s.id}>
                {s.courses.code} {s.courses.name ?? ''} · ภาค {s.term} · กลุ่ม {s.group_no}
              </option>
            ))}
          </select>
        </label>
        {err && <p className="err">{err}</p>}
        {note && <p className="ok">{note}</p>}

        {stats && (
          <div className="stats">
            <div className="stat plain">
              <span className="n">{stats.closedBy.lecture}<small>/{first?.lec.term.total ?? plan.lecPlanned}</small></span>
              <span className="l">คาบบรรยายที่ปิดแล้ว / ทั้งเทอม</span>
            </div>
            {hasLab && (
              <div className="stat plain">
                <span className="n">{stats.closedBy.lab}<small>/{first?.lab.term.total ?? plan.labPlanned}</small></span>
                <span className="l">คาบแล็บที่ปิดแล้ว / ทั้งเทอม</span>
              </div>
            )}
            <div className="stat plain"><span className="n">{pctText(stats.avg)}</span><span className="l">เข้าเรียนเฉลี่ย (คาบที่ปิดแล้ว)</span></div>
            <div className={'stat plain' + (lowStudents.length ? ' hot' : '')}><span className="n">{lowStudents.length}</span><span className="l">เสี่ยง / ไม่ผ่านเกณฑ์</span></div>
            <div className="stat plain"><span className="n">{data.students.length}</span><span className="l">นักศึกษาในวิชา</span></div>
          </div>
        )}

        <div className="res-tools">
          <div className="tabs">
            <button type="button" className={'tab' + (tab === 'term' ? ' on' : '')} onClick={() => setTab('term')}>สรุปตลอดเทอม</button>
            <button type="button" className={'tab' + (tab === 'students' ? ' on' : '')} onClick={() => setTab('students')}>รายคน × รายคาบ</button>
            <button type="button" className={'tab' + (tab === 'sessions' ? ' on' : '')} onClick={() => setTab('sessions')}>รายคาบ</button>
          </div>
          <button className="secondary" disabled={exporting || !section} onClick={doExport}>
            <Icon name="download" size={18} /> {exporting ? 'กำลังสร้างไฟล์…' : 'ส่งออก Excel'}
          </button>
        </div>
      </section>

      {!data && !err && <p className="muted">กำลังโหลดข้อมูล…</p>}

      {stats && tab === 'term' && (
        <>
          <section className="card">
            <h3>นโยบายการเข้าเรียนของวิชานี้</h3>
            <p className="policylabel">บรรยาย</p>
            <div className="res-opts">
              <NumField label="จำนวนคาบทั้งเทอม" value={plan.lecPlanned} min={1} max={200} onChange={v => setPlan(p => ({ ...p, lecPlanned: v }))} />
              <NumField label="เกณฑ์เข้าเรียนขั้นต่ำ (%)" value={plan.lecMin} min={0} max={100} onChange={v => setPlan(p => ({ ...p, lecMin: v }))} />
            </div>
            <p className="policylabel">แล็บ <span className="muted">(ใส่จำนวนคาบ 0 = วิชานี้ไม่มีแล็บ)</span></p>
            <div className="res-opts">
              <NumField label="จำนวนคาบทั้งเทอม" value={plan.labPlanned} min={0} max={200} onChange={v => setPlan(p => ({ ...p, labPlanned: v }))} />
              <NumField label="เกณฑ์เข้าเรียนขั้นต่ำ (%)" value={plan.labMin} min={0} max={100} onChange={v => setPlan(p => ({ ...p, labMin: v }))} />
            </div>
            <button className="secondary smallbtn" disabled={!dirty} onClick={savePlan}>{dirty ? 'บันทึกนโยบาย' : 'บันทึกแล้ว'}</button>
            <p className="muted">
              บรรยายต้องเข้าอย่างน้อย <b>{first?.lec.term.required ?? '–'}</b> ครั้งจาก {first?.lec.term.total ?? plan.lecPlanned} คาบ
              {hasLab && <> · แล็บต้องเข้าอย่างน้อย <b>{first?.lab.term.required ?? '–'}</b> ครั้งจาก {first?.lab.term.total ?? plan.labPlanned} คาบ (ต้องผ่านทั้งสองส่วน)</>}
              {' '}(มา + สาย นับเป็นเข้าเรียน, ลาไม่นับ){dirty ? ' · ยังไม่ได้บันทึก (นักศึกษายังเห็นค่าเดิม)' : ''}
            </p>
            <div className="statusrow">
              {['pass', 'ok', 'risk', 'fail'].map(k => (
                <span key={k} className={'badge2 ' + k}>{STATUS_LABEL[k]} {stats.byStatus[k]}</span>
              ))}
            </div>
          </section>

          <section className="card print-term">
            <div className="termhead">
              <h3>สรุปตลอดเทอม — {section?.courses.code} {section?.courses.name ?? ''} · ภาค {section?.term} · กลุ่ม {section?.group_no}</h3>
              <button className="link noprint" onClick={() => window.print()}><Icon name="printer" size={16} /> พิมพ์</button>
            </div>
            <div className="tablewrap">
              <table className="restable">
                <thead>
                  <tr>
                    <th className="sticky c1" rowSpan={hasLab ? 2 : 1}>รหัส</th>
                    <th className="sticky c2" rowSpan={hasLab ? 2 : 1}>ชื่อ-สกุล</th>
                    {kinds.map(k => <th key={k} colSpan={hasLab ? 4 : 4} className="grouphead">{KIND_LABEL[k]}</th>)}
                    <th rowSpan={hasLab ? 2 : 1}>สถานะรวม</th>
                  </tr>
                  <tr>
                    {kinds.flatMap(k => ['มา+สาย', '% ทั้งเทอม', 'ขาดได้อีก', 'สถานะ'].map(h => <th key={k + h} className="subhead">{h}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {rowsLow.map(r => (
                    <tr key={r.code} className={r.status === 'fail' ? 'warnrow' : ''}>
                      <td className="sticky c1">{r.code}</td><td className="sticky c2">{r.name}</td>
                      {kinds.flatMap(k => {
                        const x = k === 'lab' ? r.lab : r.lec
                        return [
                          <td key={k + 'a'}>{x.attended}/{x.closed}</td>,
                          <td key={k + 'p'} className="pct">{pctText(x.term.pct)}</td>,
                          <td key={k + 'm'}>{x.term.status === 'fail' ? '–' : `${x.term.allowed} ครั้ง`}</td>,
                          <td key={k + 's'}><span className={'badge2 ' + x.term.status}>{STATUS_LABEL[x.term.status]}</span></td>,
                        ]
                      })}
                      <td><span className={'badge2 ' + r.status}>{STATUS_LABEL[r.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">เรียงคนที่เข้าเรียนน้อยสุดขึ้นก่อน · "มา+สาย" = ครั้งที่เข้าเรียน / คาบที่ปิดแล้ว · "ขาดได้อีก" = จำนวนครั้งที่ยังขาดได้โดยยังถึงเกณฑ์ · ไม่ผ่านเกณฑ์ = ต่อให้มาครบทุกคาบที่เหลือก็ไม่ถึงเกณฑ์</p>
          </section>

          <section className="card">
            <h3>การกระจายของ % เข้าเรียนตามคาบทั้งเทอม{hasLab ? ' (บรรยาย + แล็บรวมกัน)' : ''}</h3>
            {hist.map(h => (
              <div key={h.label} className="histrow">
                <span className="histlabel">{h.label}</span>
                <div className="histbar"><div style={{ width: `${(h.n / maxBin) * 100}%` }} /></div>
                <span className="histn">{h.n} คน</span>
              </div>
            ))}
          </section>
        </>
      )}

      {stats && tab === 'students' && (
        <section className="card">
          {stats.closedCount === 0 && <p className="muted">ยังไม่มีคาบที่ปิดแล้ว (เปิดคาบเช็คชื่อแล้วกด "ปิดคาบ" ผลจึงจะนับ)</p>}
          <label className="check"><input type="checkbox" checked={lowFirst} onChange={e => setLowFirst(e.target.checked)} /> เรียงคนเข้าเรียนน้อยก่อน</label>
          <div className="tablewrap">
            <table className="restable">
              <thead>
                <tr>
                  <th className="sticky c1">รหัส</th>
                  <th className="sticky c2">ชื่อ-สกุล</th>
                  {data.sessions.map(s => (
                    <th key={s.id} title={s.closed_at ? '' : 'คาบที่ยังเปิดอยู่'}>
                      {when(s.opened_at)}{!s.closed_at && ' •'}<br />
                      <span className={'kindtag ' + kindOf(s)}>{KIND_LABEL[kindOf(s)]}{s.combined ? ' รวม' : ''}</span>
                    </th>
                  ))}
                  <th>มา</th><th>สาย</th><th>ลา</th><th>ขาด</th><th>%</th>
                </tr>
              </thead>
              <tbody>
                {(lowFirst ? [...stats.perStudent].sort((a, b) => (a.pct ?? 2) - (b.pct ?? 2)) : stats.perStudent).map(r => {
                  const warn = r.status === 'risk' || r.status === 'fail'
                  return (
                    <tr key={r.code} className={warn ? 'warnrow' : ''}>
                      <td className="sticky c1">{r.code}</td>
                      <td className="sticky c2">{r.name}</td>
                      {r.cells.map((c, i) => <td key={i} className={'cell ' + (c ?? 'none')}>{c ? LABEL[c] : ''}</td>)}
                      <td>{r.counts.present}</td><td>{r.counts.late}</td><td>{r.counts.leave}</td><td>{r.counts.absent}</td>
                      <td className={'pct' + (warn ? ' low' : '')}>{pctText(r.pct)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="muted">% ในตารางนี้ = (มา + สาย) ÷ คาบที่ปิดแล้ว (รวมบรรยายและแล็บ) · แถบแดง = เสี่ยง/ไม่ผ่านเกณฑ์ตลอดเทอม · ไม่มีรายการเช็คชื่อในคาบที่ปิดแล้ว นับเป็นขาด</p>
        </section>
      )}

      {stats && tab === 'sessions' && (
        <section className="card">
          {stats.perSession.length === 0 && <p className="muted">ยังไม่มีคาบ</p>}
          {[...stats.perSession].reverse().map(s => (
            <div key={s.id} className="sessrow">
              <button className="link sesshead" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                <b>{when(s.opened_at)}</b>
                <span className={'kindtag ' + kindOf(s)}>{KIND_LABEL[kindOf(s)]}{s.combined ? ' รวมทุกหมู่' : ''}</span>
                <span>{s.closed_at ? 'ปิดแล้ว' : 'กำลังเปิดอยู่'}</span>
                <span className="muted">มา {s.counts.present} · สาย {s.counts.late} · ลา {s.counts.leave} · ขาด {s.counts.absent}{s.counts.pending ? ` · รอตรวจ ${s.counts.pending}` : ''}</span>
              </button>
              {openId === s.id && <Roster session={s} />}
            </div>
          ))}
        </section>
      )}
    </>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { supabase, errMsg } from './supabase.js'
import { loadSectionData, exportAttendance } from './exportAttendance.js'
import { computeStats, LABEL, STATUS_LABEL, DEFAULT_PLAN } from './attendanceStats.js'
import { Roster } from './Teacher.jsx'
import Icon from './Icon.jsx'

const COLS = 'id, term, group_no, planned_sessions, min_attendance_pct, courses(code, name)'
const when = d => new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const pctText = p => (p == null ? '–' : `${Math.round(p * 100)}%`)
const read = (k, d) => { try { return sessionStorage.getItem(k) ?? d } catch { return d } }
const BINS = [['ต่ำกว่า 60%', 0, 60], ['60–69%', 60, 70], ['70–79%', 70, 80], ['80–89%', 80, 90], ['90–100%', 90, 101]]

// หน้า "ผลการเช็คชื่อ": สรุปตลอดเทอม / สรุปรายคน / รายคาบ ของแต่ละวิชา
export default function Results({ isAdmin }) {
  const [sections, setSections] = useState(null)
  const [sid, setSid] = useState(() => read('resultsSection', ''))
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('term')
  const [plan, setPlan] = useState({ planned: DEFAULT_PLAN.planned, minPct: DEFAULT_PLAN.minPct })
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
    // ถ้ายังไม่ได้ติดตั้ง SQL นโยบาย (คอลัมน์ planned_sessions) ให้ถอยไปใช้คอลัมน์พื้นฐานแทน แสดงค่าเริ่มต้น 16 คาบ / 80%
    let res = await fetchList(COLS)
    if (res.error) res = await fetchList('id, term, group_no, courses(code, name)')
    const list = isAdmin ? (res.data ?? []) : (res.data ?? []).map(r => r.sections).filter(Boolean)
    setSections(list)
    setSid(cur => (list.some(s => s.id === cur) ? cur : list[0]?.id ?? ''))
    return list
  }
  useEffect(() => { loadSections() }, [isAdmin])

  const section = sections?.find(s => s.id === sid)

  // เปลี่ยนวิชา -> ใช้นโยบายที่บันทึกไว้ของวิชานั้น
  useEffect(() => {
    if (!section) return
    setPlan({ planned: section.planned_sessions ?? DEFAULT_PLAN.planned, minPct: section.min_attendance_pct ?? DEFAULT_PLAN.minPct })
  }, [section?.id, section?.planned_sessions, section?.min_attendance_pct])

  async function reload() {
    if (!section) return
    setErr('')
    try { setData(await loadSectionData(section)) } catch (e) { setErr(errMsg(e)) }
  }
  useEffect(() => { setData(null); setOpenId(null); setNote(''); reload() }, [section?.id])
  useEffect(() => { if (tab !== 'sessions') reload() }, [tab])      // กลับมาแท็บสรุป โหลดใหม่ (เผื่อมีการแก้รายคาบ)

  function pick(id) { setSid(id); try { sessionStorage.setItem('resultsSection', id) } catch { /* ignore */ } }

  const stats = useMemo(
    () => (data ? computeStats({ ...data, planned: plan.planned, minPct: plan.minPct }) : null),
    [data, plan.planned, plan.minPct])
  const dirty = section && (plan.planned !== (section.planned_sessions ?? DEFAULT_PLAN.planned) ||
                            plan.minPct !== (section.min_attendance_pct ?? DEFAULT_PLAN.minPct))

  async function savePlan() {
    setErr(''); setNote('')
    const { error } = await supabase.rpc('set_section_policy', { p_section: section.id, p_planned: plan.planned, p_min: plan.minPct })
    if (error) return setErr(errMsg(error))
    await loadSections()
    setNote('บันทึกนโยบายแล้ว นักศึกษาจะเห็นสถานะตามค่านี้')
  }

  async function doExport() {
    setExporting(true); setErr('')
    try { await exportAttendance({ ...section, planned_sessions: plan.planned, min_attendance_pct: plan.minPct }) }
    catch (e) { setErr('ส่งออกไม่สำเร็จ: ' + errMsg(e)) }
    setExporting(false)
  }

  if (sections === null) return <p className="muted">กำลังโหลด…</p>
  if (sections.length === 0) return <p className="card muted">ยังไม่มีวิชาให้ดูผล ไปที่เมนู "เพิ่มรายวิชา" หรือ "จัดการวิชา" เพื่อเพิ่มวิชาก่อน</p>

  const rowsLow = stats ? [...stats.perStudent].sort((a, b) => (a.term.pct ?? 2) - (b.term.pct ?? 2)) : []
  const lowStudents = stats ? stats.perStudent.filter(s => s.term.status === 'risk' || s.term.status === 'fail') : []
  const hist = stats ? BINS.map(([label, lo, hi]) => ({
    label, n: stats.perStudent.filter(s => s.term.pct != null && s.term.pct * 100 >= lo && s.term.pct * 100 < hi).length })) : []
  const maxBin = Math.max(1, ...hist.map(h => h.n))

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
            <div className="stat plain"><span className="n">{stats.closedCount}<small>/{stats.perStudent[0]?.term.total ?? plan.planned}</small></span><span className="l">คาบที่ปิดแล้ว / ทั้งเทอม</span></div>
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
            <div className="res-opts">
              <label className="inline">จำนวนคาบทั้งเทอม
                <input type="number" min="1" max="200" value={plan.planned}
                  onChange={e => setPlan(p => ({ ...p, planned: Math.max(1, +e.target.value || 1) }))} />
              </label>
              <label className="inline">เกณฑ์เข้าเรียนขั้นต่ำ (%)
                <input type="number" min="0" max="100" value={plan.minPct}
                  onChange={e => setPlan(p => ({ ...p, minPct: Math.min(100, Math.max(0, +e.target.value || 0)) }))} />
              </label>
              <button className="secondary smallbtn" disabled={!dirty} onClick={savePlan}>{dirty ? 'บันทึก' : 'บันทึกแล้ว'}</button>
            </div>
            <p className="muted">
              ต้องเข้าเรียนอย่างน้อย <b>{stats.perStudent[0]?.term.required ?? '–'}</b> ครั้งจาก {stats.perStudent[0]?.term.total ?? plan.planned} คาบ
              (มา + สาย นับเป็นเข้าเรียน, ลาไม่นับ){dirty ? ' · ยังไม่ได้บันทึก (นักศึกษายังเห็นค่าเดิม)' : ''}
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
                    <th className="sticky c1">รหัส</th><th className="sticky c2">ชื่อ-สกุล</th>
                    <th>มา</th><th>สาย</th><th>ลา</th><th>ขาด</th><th>% ตามคาบทั้งเทอม</th><th>ขาดได้อีก</th><th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsLow.map(r => (
                    <tr key={r.code} className={r.term.status === 'fail' ? 'warnrow' : ''}>
                      <td className="sticky c1">{r.code}</td><td className="sticky c2">{r.name}</td>
                      <td>{r.counts.present}</td><td>{r.counts.late}</td><td>{r.counts.leave}</td><td>{r.counts.absent}</td>
                      <td className="pct">{pctText(r.term.pct)}</td>
                      <td>{r.term.status === 'fail' ? '–' : `${r.term.allowed} ครั้ง`}</td>
                      <td><span className={'badge2 ' + r.term.status}>{STATUS_LABEL[r.term.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">เรียงคนที่เข้าเรียนน้อยสุดขึ้นก่อน · "ขาดได้อีก" = จำนวนครั้งที่ยังขาดได้โดยยังถึงเกณฑ์ · ไม่ผ่านเกณฑ์ = ต่อให้มาครบทุกคาบที่เหลือก็ไม่ถึงเกณฑ์</p>
          </section>

          <section className="card">
            <h3>การกระจายของ % เข้าเรียนตามคาบทั้งเทอม</h3>
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
                  {data.sessions.map(s => <th key={s.id} title={s.closed_at ? '' : 'คาบที่ยังเปิดอยู่'}>{when(s.opened_at)}{!s.closed_at && ' •'}</th>)}
                  <th>มา</th><th>สาย</th><th>ลา</th><th>ขาด</th><th>%</th>
                </tr>
              </thead>
              <tbody>
                {(lowFirst ? [...stats.perStudent].sort((a, b) => (a.pct ?? 2) - (b.pct ?? 2)) : stats.perStudent).map(r => {
                  const warn = r.term.status === 'risk' || r.term.status === 'fail'
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
          <p className="muted">% ในตารางนี้ = (มา + สาย) ÷ คาบที่ปิดแล้ว · แถบแดง = เสี่ยง/ไม่ผ่านเกณฑ์ตลอดเทอม · ไม่มีรายการเช็คชื่อในคาบที่ปิดแล้ว นับเป็นขาด</p>
        </section>
      )}

      {stats && tab === 'sessions' && (
        <section className="card">
          {stats.perSession.length === 0 && <p className="muted">ยังไม่มีคาบ</p>}
          {[...stats.perSession].reverse().map(s => (
            <div key={s.id} className="sessrow">
              <button className="link sesshead" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                <b>{when(s.opened_at)}</b>
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

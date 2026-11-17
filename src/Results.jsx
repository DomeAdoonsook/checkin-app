import { useEffect, useMemo, useState } from 'react'
import { supabase, errMsg } from './supabase.js'
import { loadSectionData, exportAttendance } from './exportAttendance.js'
import { computeStats, LABEL } from './attendanceStats.js'
import { Roster } from './Teacher.jsx'
import Icon from './Icon.jsx'

const when = d => new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const pctText = p => (p == null ? '–' : `${Math.round(p * 100)}%`)
const read = (k, d) => { try { return sessionStorage.getItem(k) ?? d } catch { return d } }

// หน้า "ผลการเช็คชื่อ": สรุปรายคน / รายคาบ ของแต่ละวิชา
export default function Results({ isAdmin }) {
  const [sections, setSections] = useState(null)
  const [sid, setSid] = useState(() => read('resultsSection', ''))
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('students')
  const [threshold, setThreshold] = useState(() => Number(localStorage.getItem('att_threshold')) || 80)
  const [lowFirst, setLowFirst] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [err, setErr] = useState('')
  const [exporting, setExporting] = useState(false)

  // รายการวิชา: แอดมินเห็นทุกวิชา, อาจารย์เห็นเฉพาะวิชาที่ตัวเองสอน
  useEffect(() => {
    (async () => {
      let list
      if (isAdmin) {
        const { data } = await supabase.from('sections')
          .select('id, term, group_no, courses(code, name)').order('term', { ascending: false })
        list = data ?? []
      } else {
        const { data: { session } } = await supabase.auth.getSession()
        const { data } = await supabase.from('section_teachers')
          .select('sections(id, term, group_no, courses(code, name))').eq('teacher_id', session.user.id)
        list = (data ?? []).map(r => r.sections).filter(Boolean)
      }
      setSections(list)
      setSid(cur => (list.some(s => s.id === cur) ? cur : list[0]?.id ?? ''))
    })()
  }, [isAdmin])

  const section = sections?.find(s => s.id === sid)

  async function reload() {
    if (!section) return
    setErr('')
    try { setData(await loadSectionData(section)) } catch (e) { setErr(errMsg(e)) }
  }
  useEffect(() => { setData(null); setOpenId(null); reload() }, [sid, section?.id])
  useEffect(() => { if (tab === 'students') reload() }, [tab])          // กลับมาแท็บสรุป โหลดใหม่ (เผื่อมีการแก้รายคาบ)

  function pick(id) { setSid(id); try { sessionStorage.setItem('resultsSection', id) } catch { /* ignore */ } }
  function changeThreshold(v) {
    setThreshold(v)
    try { localStorage.setItem('att_threshold', String(v)) } catch { /* ignore */ }
  }

  const stats = useMemo(() => (data ? computeStats(data) : null), [data])
  const low = stats ? stats.perStudent.filter(s => s.pct != null && s.pct * 100 < threshold) : []
  const rows = stats ? (lowFirst
    ? [...stats.perStudent].sort((a, b) => (a.pct ?? 2) - (b.pct ?? 2))
    : stats.perStudent) : []

  async function doExport() {
    setExporting(true); setErr('')
    try { await exportAttendance(section) } catch (e) { setErr('ส่งออกไม่สำเร็จ: ' + errMsg(e)) }
    setExporting(false)
  }

  if (sections === null) return <p className="muted">กำลังโหลด…</p>
  if (sections.length === 0) return <p className="card muted">ยังไม่มีวิชาให้ดูผล ไปที่เมนู "เพิ่มรายวิชา" หรือ "จัดการวิชา" เพื่อเพิ่มวิชาก่อน</p>

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

        {stats && (
          <div className="stats">
            <div className="stat plain"><span className="n">{stats.closedCount}</span><span className="l">คาบที่ปิดแล้ว (จากทั้งหมด {data.sessions.length})</span></div>
            <div className="stat plain"><span className="n">{pctText(stats.avg)}</span><span className="l">เข้าเรียนเฉลี่ยทั้งห้อง</span></div>
            <div className={'stat plain' + (low.length ? ' hot' : '')}><span className="n">{low.length}</span><span className="l">คนต่ำกว่าเกณฑ์ {threshold}%</span></div>
            <div className="stat plain"><span className="n">{data.students.length}</span><span className="l">นักศึกษาในวิชา</span></div>
          </div>
        )}

        <div className="res-tools">
          <div className="tabs">
            <button type="button" className={'tab' + (tab === 'students' ? ' on' : '')} onClick={() => setTab('students')}>สรุปรายคน</button>
            <button type="button" className={'tab' + (tab === 'sessions' ? ' on' : '')} onClick={() => setTab('sessions')}>รายคาบ</button>
          </div>
          <button className="secondary" disabled={exporting || !section} onClick={doExport}>
            <Icon name="download" size={18} /> {exporting ? 'กำลังสร้างไฟล์…' : 'ส่งออก Excel'}
          </button>
        </div>
      </section>

      {!data && !err && <p className="muted">กำลังโหลดข้อมูล…</p>}

      {stats && tab === 'students' && (
        <section className="card">
          <div className="res-opts">
            <label className="inline">เกณฑ์เตือน (%)
              <input type="number" min="0" max="100" value={threshold} onChange={e => changeThreshold(+e.target.value || 0)} />
            </label>
            <label className="check"><input type="checkbox" checked={lowFirst} onChange={e => setLowFirst(e.target.checked)} /> เรียงคนเข้าเรียนน้อยก่อน</label>
          </div>
          {stats.closedCount === 0 && <p className="muted">ยังไม่มีคาบที่ปิดแล้ว (เปิดคาบเช็คชื่อแล้วกด "ปิดคาบ" ผลจึงจะนับ)</p>}
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
                {rows.map(r => {
                  const warn = r.pct != null && r.pct * 100 < threshold
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
          <p className="muted">% เข้าเรียน = (มา + สาย) ÷ คาบที่ปิดแล้ว · ลาไม่นับเป็นเข้าเรียน · ไม่มีรายการเช็คชื่อในคาบที่ปิดแล้ว นับเป็นขาด</p>
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

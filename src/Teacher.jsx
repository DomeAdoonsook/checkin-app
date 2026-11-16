import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase, statusLabel, errMsg } from './supabase.js'
import Codes from './Codes.jsx'
import { exportAttendance } from './exportAttendance.js'
import Icon from './Icon.jsx'

function QrBox({ sessionId }) {
  const [img, setImg] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    async function tick() {
      const { data, error } = await supabase.rpc('get_qr_token', { p_session: sessionId })
      if (!alive) return
      if (error) { setErr(errMsg(error)); return }
      const url = `${location.origin}${location.pathname}#/c/${sessionId}/${data}`
      setImg(await QRCode.toDataURL(url, { width: 520, margin: 1 }))
    }
    tick()
    const t = setInterval(tick, 5000)   // รอบ token 15 วิ -> รีเฟรชทุก 5 วิ
    return () => { alive = false; clearInterval(t) }
  }, [sessionId])
  return err ? <p className="err">{err}</p> : img ? <img className="qr" src={img} alt="QR เช็คชื่อ" /> : <p>กำลังสร้าง QR…</p>
}

function Roster({ session }) {
  const [rows, setRows] = useState([])
  const [edit, setEdit] = useState(null)   // student_code ที่กำลังเช็คแทน
  const [status, setStatus] = useState('present')
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState('')
  const [resetInfo, setResetInfo] = useState(null)   // { code, name } แสดงครั้งเดียว

  async function load() {
    const [en, at] = await Promise.all([
      supabase.from('enrollments').select('student_code, students(full_name)')
        .eq('section_id', session.section_id).order('student_code'),
      supabase.from('attendance').select('*').eq('session_id', session.id),
    ])
    const map = Object.fromEntries((at.data ?? []).map(a => [a.student_code, a]))
    setRows((en.data ?? []).map(e => ({ code: e.student_code, name: e.students?.full_name, att: map[e.student_code] })))
  }
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t) }, [session.id])

  async function mark(code, st, why) {
    setMsg('')
    const { error } = await supabase.rpc('teacher_mark', {
      p_session: session.id, p_student_code: code, p_status: st, p_reason: why,
    })
    if (error) setMsg(errMsg(error)); else { setEdit(null); setReason(''); load() }
  }

  async function resetAccount(studentCode, name) {
    if (!confirm(`รีเซ็ตบัญชีของ ${name}?\nรหัสผ่านเดิมจะใช้ไม่ได้ และนักศึกษาต้องเปิดใช้งานใหม่ด้วยรหัสที่จะแสดงให้ครั้งเดียว`)) return
    setMsg(''); setResetInfo(null)
    const { data, error } = await supabase.functions.invoke('reset-student', { body: { student_code: studentCode } })
    if (error || !data?.ok) return setMsg('รีเซ็ตบัญชีไม่สำเร็จ (ต้องเป็นอาจารย์ผู้สอนหลักของวิชานี้)')
    setResetInfo({ code: data.code, name })
  }

  const count = s => rows.filter(r => r.att?.status === s).length
  return (
    <>
      <p>มา {count('present')} · สาย {count('late')} · รอตรวจ {count('pending')} · ยังไม่เช็ค {rows.filter(r => !r.att).length} / {rows.length}</p>
      {msg && <p className="err">{msg}</p>}
      {resetInfo && (
        <div className="card reset">
          <b>รหัสเปิดใช้งานใหม่ของ {resetInfo.name}</b>
          <p className="code">{resetInfo.code}</p>
          <p className="muted">แสดงครั้งเดียว มีอายุ 14 วัน ให้นักศึกษากรอกที่หน้า "ครั้งแรก? เปิดใช้งานบัญชี" แล้วตั้งรหัสผ่านเอง</p>
          <button className="secondary" onClick={() => navigator.clipboard?.writeText(resetInfo.code)}>คัดลอกรหัส</button>
          <button className="link" onClick={() => setResetInfo(null)}>ปิด</button>
        </div>
      )}
      <ul className="roster">
        {rows.map(r => (
          <li key={r.code} className={r.att ? r.att.status : 'none'}>
            <div className="row">
              <span><b>{r.code.slice(-3)}</b> {r.name}</span>
              <span>
                {r.att ? statusLabel[r.att.status] : '—'}
                {r.att?.method === 'teacher_manual' && <Icon name="edit" size={14} />}
                {r.att?.flagged && <Icon name="flag" size={14} />}
              </span>
            </div>
            {r.att?.status === 'pending' && (
              <div className="row">
                <button onClick={() => mark(r.code, 'present', 'อนุมัติรายการที่ติดธง')}>อนุมัติ</button>
                <button className="secondary" onClick={() => mark(r.code, 'absent', 'ปฏิเสธรายการที่ติดธง')}>ปฏิเสธ</button>
              </div>
            )}
            {edit === r.code
              ? <div className="edit">
                  <select value={status} onChange={e => setStatus(e.target.value)}>
                    {['present', 'late', 'absent', 'leave'].map(s => <option key={s} value={s}>{statusLabel[s]}</option>)}
                  </select>
                  <input placeholder="เหตุผล เช่น ลืมมือถือ" value={reason} onChange={e => setReason(e.target.value)} />
                  <button onClick={() => mark(r.code, status, reason)}>บันทึก</button>
                  <button className="link" onClick={() => setEdit(null)}>ยกเลิก</button>
                </div>
              : <>
                  <button className="link" onClick={() => { setEdit(r.code); setStatus('present') }}>เช็คแทน/แก้ไข</button>
                  <button className="link" onClick={() => resetAccount(r.code, r.name)}>รีเซ็ตบัญชี</button>
                </>}
          </li>
        ))}
      </ul>
    </>
  )
}

// ตำแหน่งเริ่มต้นของระบบ (ใช้เมื่อวิชายังไม่ได้บันทึกตำแหน่งประจำวิชา) รัศมีเริ่มต้น 25 เมตร
const DEFAULT_GEO = { lat: '18.897152', lng: '99.017858', radius: 25 }

export default function Teacher() {
  const [sections, setSections] = useState([])
  const [sessions, setSessions] = useState([])
  const [active, setActive] = useState(null)
  const [codesFor, setCodesFor] = useState(null)   // section id ที่เปิดแผงออกรหัส
  const [exporting, setExporting] = useState(null) // section id ที่กำลังส่งออก Excel
  const [geos, setGeos] = useState({})            // ค่าที่กำลังแก้ต่อกลุ่มเรียน (ยังไม่บันทึก)
  const [msg, setMsg] = useState('')
  const [note, setNote] = useState('')

  // ตำแหน่งที่ใช้เปิดคาบ = ที่กำลังแก้ ถ้าไม่มีใช้ "ตำแหน่งประจำวิชา" ที่บันทึกไว้
  const geoOf = sec => ({
    lat: sec.default_lat ?? DEFAULT_GEO.lat, lng: sec.default_lng ?? DEFAULT_GEO.lng,
    radius: sec.default_radius_m ?? DEFAULT_GEO.radius, ...(geos[sec.id] ?? {}),
  })
  const setGeoOf = (sec, patch) => setGeos(p => ({ ...p, [sec.id]: { ...geoOf(sec), ...patch } }))

  async function load() {
    // เฉพาะวิชาที่ตัวเองเป็นผู้สอน (แอดมินจะไม่เห็นวิชาของคนอื่นปนในหน้านี้)
    const { data: { session } } = await supabase.auth.getSession()
    const [s0, c] = await Promise.all([
      supabase.from('section_teachers')
        .select('sections(id, term, group_no, default_lat, default_lng, default_radius_m, courses(code, name))')
        .eq('teacher_id', session.user.id),
      supabase.from('class_sessions').select('*').is('closed_at', null).order('opened_at', { ascending: false }),
    ])
    setSections((s0.data ?? []).map(r => r.sections).filter(Boolean)); setSessions(c.data ?? [])
  }
  useEffect(() => { load() }, [])

  async function doExport(sec) {
    setMsg(''); setExporting(sec.id)
    try { await exportAttendance(sec) } catch (e) { setMsg('ส่งออกไม่สำเร็จ: ' + errMsg(e)) }
    setExporting(null)
  }

  function useHere(sec) {
    setMsg(''); setNote('')
    navigator.geolocation.getCurrentPosition(
      p => setGeoOf(sec, { lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }),
      () => setMsg('อ่านตำแหน่งไม่ได้ (ตรวจสอบว่าอนุญาตตำแหน่งให้เว็บนี้แล้ว)'), { enableHighAccuracy: true })
  }

  // บันทึก (หรือล้าง) ตำแหน่งประจำวิชา ให้คาบถัดไปใช้อัตโนมัติ
  async function saveLocation(sec, clear = false) {
    setMsg(''); setNote('')
    const g = geoOf(sec)
    const lat = clear ? null : parseFloat(g.lat)
    const lng = clear ? null : parseFloat(g.lng)
    if (!clear && (!isFinite(lat) || !isFinite(lng))) return setMsg('กรุณาใส่ละติจูด/ลองจิจูดให้ถูกต้อง หรือกด "ใช้ตำแหน่งปัจจุบัน"')
    const { error } = await supabase.rpc('set_section_location', {
      p_section: sec.id, p_lat: lat, p_lng: lng, p_radius: clear ? null : (parseInt(g.radius, 10) || 25),
    })
    if (error) return setMsg(errMsg(error))
    setGeos(p => { const n = { ...p }; delete n[sec.id]; return n })
    await load()
    setNote(clear ? 'ล้างตำแหน่งประจำวิชาแล้ว (คาบถัดไปจะไม่ตรวจระยะ)' : 'บันทึกตำแหน่งประจำวิชาแล้ว คาบถัดไปจะใช้ค่านี้อัตโนมัติ')
  }

  async function openSession(sec) {
    setMsg('')
    const g = geoOf(sec)
    const hasGeo = g.lat !== '' && g.lng !== '' && g.lat != null
    if (hasGeo && (!isFinite(+g.lat) || !isFinite(+g.lng))) return setMsg('ละติจูด/ลองจิจูดไม่ถูกต้อง')
    const { data, error } = await supabase.from('class_sessions').insert({
      section_id: sec.id, opened_by: (await supabase.auth.getUser()).data.user.id,
      late_after: new Date(Date.now() + 15 * 60000).toISOString(),   // เกิน 15 นาที = สาย
      lat: hasGeo ? +g.lat : null, lng: hasGeo ? +g.lng : null,
      radius_m: +g.radius || 25,
    }).select().single()
    if (error) return setMsg(errMsg(error))
    await load(); setActive(data)
  }

  async function close(s) {
    await supabase.from('class_sessions').update({ closed_at: new Date().toISOString() }).eq('id', s.id)
    setActive(null); load()
  }

  const cur = active && sessions.find(s => s.id === active.id)
  if (cur) {
    const sec = sections.find(s => s.id === cur.section_id)
    return (
      <>
        <section className="card center">
          <h2>{sec?.courses.code} {sec?.courses.name ?? ''}</h2>
          <QrBox sessionId={cur.id} />
          <p className="muted">QR เปลี่ยนทุก 15 วินาที — ฉายหน้าห้อง</p>
          <button className="danger" onClick={() => close(cur)}>ปิดคาบ</button>
          <button className="link" onClick={() => setActive(null)}>กลับ (คาบยังเปิดอยู่)</button>
        </section>
        <section className="card"><Roster session={cur} /></section>
      </>
    )
  }

  return (
    <>
      {msg && <p className="err">{msg}</p>}
      {note && <p className="ok">{note}</p>}
      {sections.length === 0 && <p className="card muted">ยังไม่มีวิชาที่คุณสอน ไปที่เมนู "เพิ่มรายวิชา" (หรือ "จัดการวิชา") เพื่อเพิ่มวิชาและนำเข้ารายชื่อนักศึกษา</p>}
      {sections.map(sec => {
        const open = sessions.find(s => s.section_id === sec.id)
        return (
          <section className="card" key={sec.id}>
            <h2>{sec.courses.code} {sec.courses.name ?? ''}</h2>
            <p className="muted">ภาค {sec.term} · กลุ่ม {sec.group_no}</p>
            <button className="secondary" onClick={() => setCodesFor(codesFor === sec.id ? null : sec.id)}>
              <Icon name="key" size={18} /> รหัสเปิดใช้งานนักศึกษา
            </button>
            {codesFor === sec.id && <Codes section={sec} />}
            <button className="secondary" disabled={exporting === sec.id} onClick={() => doExport(sec)}>
              {exporting === sec.id ? 'กำลังสร้างไฟล์…' : <><Icon name="download" size={18} /> ส่งออกการเข้าเรียน (Excel)</>}
            </button>
            {open
              ? <button onClick={() => setActive(open)}>เปิดหน้าคาบที่กำลังเช็ค</button>
              : <>
                  <details open={sec.default_lat == null}>
                    <summary>
                      ตำแหน่งเช็คชื่อ: {sec.default_lat != null
                        ? `ตั้งไว้แล้ว (รัศมี ${sec.default_radius_m} ม.)`
                        : 'ใช้ตำแหน่งเริ่มต้นของระบบ (รัศมี 25 ม.)'}
                    </summary>
                    {(() => { const g = geoOf(sec); return (<>
                      <label>ละติจูด (เช่น 13.7563)<input placeholder="13.7563" value={g.lat} onChange={e => setGeoOf(sec, { lat: e.target.value })} /></label>
                      <label>ลองจิจูด (เช่น 100.5018)<input placeholder="100.5018" value={g.lng} onChange={e => setGeoOf(sec, { lng: e.target.value })} /></label>
                      <label>รัศมีที่อนุญาต (เมตร) — นักศึกษาต้องอยู่ห่างจากจุดนี้ไม่เกินระยะนี้ (ค่าเริ่มต้น 25 — GPS ในอาคารมักคลาดเคลื่อน 20–50 ม. ควรทดสอบก่อน)<input placeholder="25" type="number" min="10" value={g.radius} onChange={e => setGeoOf(sec, { radius: e.target.value })} /></label>
                    </>) })()}
                    <button className="secondary" onClick={() => useHere(sec)}><Icon name="pin" size={18} /> ใช้ตำแหน่งปัจจุบัน</button>
                    <button className="link" onClick={() => setGeoOf(sec, DEFAULT_GEO)}>ใช้ตำแหน่งเริ่มต้นของระบบ</button>
                    <button onClick={() => saveLocation(sec)}>บันทึกเป็นตำแหน่งประจำวิชา</button>
                    {sec.default_lat != null && <button className="link" onClick={() => saveLocation(sec, true)}>ล้างตำแหน่งประจำวิชา</button>}
                    <p className="muted">กดบันทึกครั้งเดียว คาบถัดไปจะใช้ตำแหน่งและรัศมีนี้อัตโนมัติ (ถ้าแก้ค่าโดยไม่กดบันทึก จะใช้เฉพาะคาบที่เปิดตอนนี้)</p>
                  </details>
                  <button onClick={() => openSession(sec)}><Icon name="play" size={16} /> เปิดคาบเช็คชื่อ</button>
                </>}
          </section>
        )
      })}
    </>
  )
}

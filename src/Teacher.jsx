import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase, statusLabel, errMsg } from './supabase.js'

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

  const count = s => rows.filter(r => r.att?.status === s).length
  return (
    <>
      <p>มา {count('present')} · สาย {count('late')} · รอตรวจ {count('pending')} · ยังไม่เช็ค {rows.filter(r => !r.att).length} / {rows.length}</p>
      {msg && <p className="err">{msg}</p>}
      <ul className="roster">
        {rows.map(r => (
          <li key={r.code} className={r.att ? r.att.status : 'none'}>
            <div className="row">
              <span><b>{r.code.slice(-3)}</b> {r.name}</span>
              <span>
                {r.att ? statusLabel[r.att.status] : '—'}
                {r.att?.method === 'teacher_manual' && ' ✎'}
                {r.att?.flagged && ' 🚩'}
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
              : <button className="link" onClick={() => { setEdit(r.code); setStatus('present') }}>เช็คแทน/แก้ไข</button>}
          </li>
        ))}
      </ul>
    </>
  )
}

export default function Teacher() {
  const [sections, setSections] = useState([])
  const [sessions, setSessions] = useState([])
  const [active, setActive] = useState(null)
  const [geo, setGeo] = useState({ lat: '', lng: '', radius: 100 })
  const [msg, setMsg] = useState('')

  async function load() {
    const [s, c] = await Promise.all([
      supabase.from('sections').select('id, term, group_no, default_lat, default_lng, default_radius_m, courses(code, name)'),
      supabase.from('class_sessions').select('*').is('closed_at', null).order('opened_at', { ascending: false }),
    ])
    setSections(s.data ?? []); setSessions(c.data ?? [])
  }
  useEffect(() => { load() }, [])

  function useHere() {
    navigator.geolocation.getCurrentPosition(
      p => setGeo(g => ({ ...g, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })),
      () => setMsg('อ่านตำแหน่งไม่ได้'), { enableHighAccuracy: true })
  }

  async function openSession(sec) {
    setMsg('')
    const hasGeo = geo.lat !== '' && geo.lng !== ''
    const { data, error } = await supabase.from('class_sessions').insert({
      section_id: sec.id, opened_by: (await supabase.auth.getUser()).data.user.id,
      late_after: new Date(Date.now() + 15 * 60000).toISOString(),   // เกิน 15 นาที = สาย
      lat: hasGeo ? +geo.lat : sec.default_lat, lng: hasGeo ? +geo.lng : sec.default_lng,
      radius_m: +geo.radius || sec.default_radius_m || 100,
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
      {sections.length === 0 && <p className="card muted">ยังไม่มีวิชาที่คุณสอน (ให้แอดมินเพิ่มใน section_teachers)</p>}
      {sections.map(sec => {
        const open = sessions.find(s => s.section_id === sec.id)
        return (
          <section className="card" key={sec.id}>
            <h2>{sec.courses.code} {sec.courses.name ?? ''}</h2>
            <p className="muted">ภาค {sec.term} · กลุ่ม {sec.group_no}</p>
            {open
              ? <button onClick={() => setActive(open)}>เปิดหน้าคาบที่กำลังเช็ค</button>
              : <>
                  <details>
                    <summary>ตั้งค่าตำแหน่ง (ไม่บังคับ)</summary>
                    <input placeholder="ละติจูด เช่น 13.7563" value={geo.lat} onChange={e => setGeo({ ...geo, lat: e.target.value })} />
                    <input placeholder="ลองจิจูด เช่น 100.5018" value={geo.lng} onChange={e => setGeo({ ...geo, lng: e.target.value })} />
                    <input placeholder="รัศมี (เมตร)" type="number" value={geo.radius} onChange={e => setGeo({ ...geo, radius: e.target.value })} />
                    <button className="secondary" onClick={useHere}>ใช้ตำแหน่งปัจจุบัน</button>
                  </details>
                  <button onClick={() => openSession(sec)}>▶ เปิดคาบเช็คชื่อ</button>
                </>}
          </section>
        )
      })}
    </>
  )
}

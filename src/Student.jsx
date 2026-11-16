import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase, deviceId, statusLabel, errMsg } from './supabase.js'

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('LOCATION_REQUIRED'))
    navigator.geolocation.getCurrentPosition(
      p => resolve(p.coords),
      () => reject(new Error('LOCATION_REQUIRED')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    )
  })
}

async function doCheckIn(sessionId, token) {
  const pos = await getPosition()
  const { data, error } = await supabase.rpc('check_in', {
    p_session: sessionId, p_token: token,
    p_lat: pos.latitude, p_lng: pos.longitude, p_accuracy: pos.accuracy,
    p_device: deviceId(),
  })
  if (error) throw error
  return data
}

function Result({ r, onDone }) {
  const text = {
    present: ['✅ เช็คชื่อสำเร็จ', 'ok'], late: ['⚠️ เช็คชื่อแล้ว (สาย)', 'warn'],
    pending: ['⏳ รออาจารย์ตรวจสอบ', 'warn'], duplicate: ['เช็คชื่อไปแล้ว', 'ok'],
  }[r.status] ?? [r.status, 'ok']
  return (
    <div className={`card result ${text[1]}`}>
      <h2>{text[0]}</h2>
      <button onClick={onDone}>กลับหน้าหลัก</button>
    </div>
  )
}

export default function Student({ profile, scan }) {
  const [openSessions, setOpen] = useState([])
  const [records, setRecords] = useState([])
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const handled = useRef(false)

  async function load() {
    const [s, h] = await Promise.all([
      supabase.from('class_sessions')
        .select('id, opened_at, sections(term, group_no, courses(code, name))')
        .is('closed_at', null).order('opened_at', { ascending: false }),
      supabase.from('attendance')
        .select('status, method, checked_at, class_sessions(opened_at, sections(courses(code, name)))')
        .order('checked_at', { ascending: false }).limit(60),
    ])
    setOpen(s.data ?? []); setRecords(h.data ?? [])
  }
  useEffect(() => { load() }, [])

  async function submit(sessionId, token) {
    setBusy(true); setError('')
    try { setResult(await doCheckIn(sessionId, token)); load() }
    catch (e) { setError(errMsg(e)) }
    setBusy(false)
  }

  // เปิดจากลิงก์ QR (สแกนด้วยกล้องมือถือปกติ)
  useEffect(() => {
    if (scan && !handled.current) {
      handled.current = true
      history.replaceState(null, '', location.pathname)
      submit(scan.session, scan.token)
    }
  }, [scan])

  // สแกนในแอป: QR เป็น URL ที่มี #/c/<session>/<token>
  useEffect(() => {
    if (!scanning) return
    const qr = new Html5Qrcode('reader')
    let stopped = false
    qr.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 }, text => {
      const m = text.match(/#\/c\/([0-9a-f-]{36})\/(.+)$/)
      if (!m || stopped) return
      stopped = true
      qr.stop().catch(() => {}).finally(() => { setScanning(false); submit(m[1], m[2]) })
    }, () => {}).catch(() => { setError('เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้อง'); setScanning(false) })
    return () => { if (!stopped) qr.stop().catch(() => {}) }
  }, [scanning])

  if (result) return <Result r={result} onDone={() => { setResult(null); load() }} />

  // สรุปต่อวิชา
  const byCourse = {}
  for (const a of records) {
    const c = a.class_sessions?.sections?.courses
    const k = c ? `${c.code} ${c.name ?? ''}` : '—'
    ;(byCourse[k] ??= []).push(a)
  }

  return (
    <>
      <section className="card">
        <h2>เช็คชื่อ</h2>
        {openSessions.length === 0
          ? <p className="muted">ตอนนี้ไม่มีคาบที่เปิดเช็คชื่อ</p>
          : openSessions.map(s => (
            <p key={s.id}>🟢 {s.sections.courses.code} {s.sections.courses.name ?? ''} (กลุ่ม {s.sections.group_no})</p>
          ))}
        {error && <p className="err">{error}</p>}
        {scanning
          ? <><div id="reader" /><button className="secondary" onClick={() => setScanning(false)}>ยกเลิก</button></>
          : <button disabled={busy || openSessions.length === 0} onClick={() => { setError(''); setScanning(true) }}>
              {busy ? 'กำลังเช็คชื่อ…' : '📷 สแกน QR เพื่อเช็คชื่อ'}
            </button>}
      </section>

      <section className="card">
        <h2>การมาเรียนของฉัน</h2>
        {Object.keys(byCourse).length === 0 && <p className="muted">ยังไม่มีข้อมูล</p>}
        {Object.entries(byCourse).map(([k, rows]) => {
          const n = s => rows.filter(r => r.status === s).length
          return (
            <details key={k}>
              <summary>{k} — มา {n('present')} · สาย {n('late')} · ขาด {n('absent')} · ลา {n('leave')}</summary>
              <ul>{rows.map((r, i) => (
                <li key={i}>
                  {new Date(r.class_sessions.opened_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                  {' '}— {statusLabel[r.status]}{r.method === 'teacher_manual' ? ' (อาจารย์บันทึก)' : ''}
                </li>))}</ul>
            </details>
          )
        })}
      </section>
    </>
  )
}

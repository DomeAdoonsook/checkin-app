import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase, deviceId, statusLabel, errMsg } from './supabase.js'
import Icon from './Icon.jsx'
import { termStatus, combineStatus, planOf, kindOf, STATUS_LABEL, KIND_LABEL } from './attendanceStats.js'

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

// ใช้ตำแหน่งที่เตรียมไว้ล่วงหน้า (ไม่เก่าเกิน 60 วินาที) เพื่อให้หลังสแกนส่งได้ทันที ไม่ต้องรอ GPS
async function doCheckIn(sessionId, token, cached) {
  const fresh = cached && Date.now() - cached.t < 60000
  const pos = fresh ? cached.coords : await getPosition()
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
    present: ['check', 'เช็คชื่อสำเร็จ', 'ok'], late: ['alert', 'เช็คชื่อแล้ว (สาย)', 'warn'],
    pending: ['clock', 'รออาจารย์ตรวจสอบ', 'warn'], duplicate: ['check', 'เช็คชื่อไปแล้ว', 'ok'],
  }[r.status] ?? ['check', r.status, 'ok']
  return (
    <div className={`card result ${text[2]}`}>
      <h2><Icon name={text[0]} size={26} /> {text[1]}</h2>
      <button onClick={onDone}>กลับหน้าหลัก</button>
    </div>
  )
}

export default function Student({ profile, scan, view = 'checkin', onScanDone }) {
  const [openSessions, setOpen] = useState([])
  const [records, setRecords] = useState([])
  const [terms, setTerms] = useState([])   // สรุปตลอดเทอมต่อวิชา
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const handled = useRef(false)
  const posRef = useRef(null)                 // ตำแหน่งล่าสุดที่เตรียมไว้
  const [gps, setGps] = useState(null)        // { acc } เมื่อพร้อม | 'denied' เมื่อไม่ได้รับอนุญาต

  // เปิดหน้าเช็คชื่อแล้วเริ่มหาตำแหน่งทันที (ก่อนสแกน) ปิดเมื่อออกจากหน้า
  useEffect(() => {
    if (view !== 'checkin' || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      p => { posRef.current = { coords: p.coords, t: Date.now() }; setGps({ acc: Math.round(p.coords.accuracy) }) },
      e => { if (e.code === 1) setGps('denied') },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [view])

  async function load() {
    const openQ = cols => supabase.from('class_sessions').select(cols)
      .is('closed_at', null).order('opened_at', { ascending: false })
    const [s0, h] = await Promise.all([
      openQ('id, opened_at, kind, combined, course_id, sections(term, group_no, courses(code, name))'),
      supabase.from('attendance')
        .select('status, method, checked_at, class_sessions(opened_at, sections(courses(code, name)))')
        .order('checked_at', { ascending: false }).limit(60),
    ])
    const s = s0.error ? await openQ('id, opened_at, sections(term, group_no, courses(code, name))') : s0   // ฐานข้อมูลเก่า
    setOpen(s.data ?? []); setRecords(h.data ?? [])

    // สรุปตลอดเทอมต่อวิชาที่ลงทะเบียน (บรรยาย/แล็บแยกกัน เทียบกับจำนวนคาบทั้งเทอมและเกณฑ์ขั้นต่ำ)
    try {
      const secCols = 'id, term, group_no, planned_sessions, min_attendance_pct, courses(code, name)'
      const enrQ = extra => supabase.from('enrollments').select(`section_id, sections(${secCols}${extra})`)
      const csQ = cols => supabase.from('class_sessions').select(cols).not('closed_at', 'is', null)
      let [en, cs] = await Promise.all([
        enrQ(', course_id, planned_lab_sessions, min_lab_pct'), csQ('id, section_id, kind, combined, course_id, term')])
      if (en.error || cs.error) [en, cs] = await Promise.all([enrQ(''), csQ('id, section_id')])   // ฐานข้อมูลเก่า
      const my = await supabase.from('attendance').select('session_id, status').limit(5000)
      if (en.error) throw en.error
      const got = new Map((my.data ?? []).map(r => [r.session_id, r.status]))
      setTerms((en.data ?? []).map(e => e.sections).filter(Boolean).map(sec => {
        // คาบที่เกี่ยวกับกลุ่มนี้: คาบของกลุ่มเอง + บรรยายรวมของวิชา+ภาคเรียนเดียวกัน
        const mine = (cs.data ?? []).filter(c => c.section_id === sec.id || (c.combined && c.course_id === sec.course_id && c.term === sec.term))
        const plan = planOf(sec)
        const part = kind => {
          const ids = mine.filter(c => kindOf(c) === kind).map(c => c.id)
          const counts = { present: 0, late: 0, leave: 0, absent: 0, pending: 0 }
          for (const id of ids) counts[got.get(id) ?? 'absent']++
          return { counts, closed: ids.length,
            t: termStatus({ attended: counts.present + counts.late, closed: ids.length, planned: plan[kind].planned, minPct: plan[kind].minPct }) }
        }
        const lec = part('lecture'), lab = part('lab')
        const hasLab = plan.lab.planned > 0 || lab.closed > 0
        return { sec, lec, lab, hasLab, status: combineStatus([lec.t.status, hasLab ? lab.t.status : null]) }
      }))
    } catch { setTerms([]) }
  }
  useEffect(() => { load() }, [])

  async function submit(sessionId, token) {
    setBusy(true); setError('')
    try { setResult(await doCheckIn(sessionId, token, posRef.current)); load() }
    catch (e) { setError(errMsg(e)) }
    setBusy(false)
  }

  // เปิดจากลิงก์ QR (สแกนด้วยกล้องมือถือปกติ)
  useEffect(() => {
    if (scan && !handled.current) {
      handled.current = true
      history.replaceState(null, '', location.pathname)
      onScanDone?.()
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
      {view === 'checkin' && <section className="card">
        <h2>เช็คชื่อ</h2>
        {openSessions.length === 0
          ? <p className="muted">ตอนนี้ไม่มีคาบที่เปิดเช็คชื่อ</p>
          : openSessions.map(s => (
            <p key={s.id}>
              <span className="dot" />{' '}
              {(() => {
                const c = s.sections?.courses ?? terms.find(x => x.sec.course_id === s.course_id)?.sec.courses
                return <>{c?.code} {c?.name ?? ''}{s.combined ? '' : s.sections ? ` (กลุ่ม ${s.sections.group_no})` : ''}</>
              })()}{' '}
              <span className={'kindtag ' + kindOf(s)}>{KIND_LABEL[kindOf(s)]}{s.combined ? ' รวมทุกหมู่' : ''}</span>
            </p>
          ))}
        {gps === 'denied'
          ? <p className="err"><Icon name="pin" size={16} /> ไม่ได้รับอนุญาตใช้ตำแหน่ง กรุณาเปิดสิทธิ์ตำแหน่งให้เว็บนี้ในการตั้งค่าเบราว์เซอร์</p>
          : gps
            ? <p className="muted"><Icon name="pin" size={16} /> ตำแหน่งพร้อมแล้ว (คลาดเคลื่อนประมาณ {gps.acc} เมตร)</p>
            : <p className="muted"><Icon name="pin" size={16} /> กำลังหาตำแหน่ง… (กด "อนุญาต" เมื่อเบราว์เซอร์ถาม)</p>}
        {error && <p className="err">{error}</p>}
        {scanning
          ? <><div id="reader" /><button className="secondary" onClick={() => setScanning(false)}>ยกเลิก</button></>
          : <button disabled={busy || openSessions.length === 0} onClick={() => { setError(''); setScanning(true) }}>
              {busy ? 'กำลังเช็คชื่อ…' : <><Icon name="camera" size={18} /> สแกน QR เพื่อเช็คชื่อ</>}
            </button>}
      </section>}

      {view === 'history' && terms.map(({ sec, lec, lab, hasLab, status }) => (
        <section className="card termcard" key={sec.id}>
          <div className="termtop">
            <b>{sec.courses.code} {sec.courses.name ?? ''}</b>
            <span className={'badge2 ' + status}>{STATUS_LABEL[status]}</span>
          </div>
          <p className="muted">ภาค {sec.term} · กลุ่ม {sec.group_no}</p>
          {[['lecture', lec, sec.min_attendance_pct ?? 80], ...(hasLab ? [['lab', lab, sec.min_lab_pct ?? 80]] : [])].map(([k, x, min]) => (
            <div key={k} className="kindblock">
              <div className="termtop">
                <span className={'kindtag ' + k}>{KIND_LABEL[k]}</span>
                <span className={'badge2 ' + x.t.status}>{STATUS_LABEL[x.t.status]}</span>
              </div>
              <div className="meter"><div className={'meterfill ' + x.t.status} style={{ width: `${Math.min(100, Math.round((x.t.pct ?? 0) * 100))}%` }} />
                <i className="meterline" style={{ left: `${min}%` }} /></div>
              <p>
                เข้าเรียน <b>{x.counts.present + x.counts.late}</b> ครั้ง จากทั้งเทอม {x.t.total} คาบ
                ({Math.round((x.t.pct ?? 0) * 100)}% · เกณฑ์ {min}% = อย่างน้อย {x.t.required} ครั้ง)
              </p>
              <p className="muted">
                มา {x.counts.present} · สาย {x.counts.late} · ลา {x.counts.leave} · ขาด {x.counts.absent} · เรียนไปแล้ว {x.closed}/{x.t.total} คาบ
              </p>
              <p className={x.t.status === 'fail' ? 'err' : x.t.status === 'risk' ? 'warntext' : 'muted'}>
                {x.t.status === 'pass' ? 'เข้าเรียนครบเกณฑ์แล้ว'
                  : x.t.status === 'fail' ? 'ต่อให้มาครบทุกคาบที่เหลือ ก็ไม่ถึงเกณฑ์แล้ว กรุณาติดต่ออาจารย์ผู้สอน'
                  : `ขาดได้อีกไม่เกิน ${x.t.allowed} ครั้ง จึงจะยังถึงเกณฑ์${x.t.status === 'risk' ? ' (เสี่ยง ระวังอย่าขาดเพิ่ม)' : ''}`}
              </p>
            </div>
          ))}
          {hasLab && <p className="muted">ต้องผ่านเกณฑ์ทั้งบรรยายและแล็บ</p>}
        </section>
      ))}

      {view === 'history' && <section className="card">
        <h2>การมาเรียนของฉัน (รายวัน)</h2>
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
      </section>}
    </>
  )
}

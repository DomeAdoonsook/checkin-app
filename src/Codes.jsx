import { useState } from 'react'
import { supabase, errMsg } from './supabase.js'

// ออกรหัสเปิดใช้งานให้นักศึกษาที่ยังไม่เปิดใช้งานของ section นี้ + ดาวน์โหลด CSV / พิมพ์สลิป
export default function Codes({ section }) {
  const [rows, setRows] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const course = `${section.courses.code} ${section.courses.name ?? ''}`.trim()
  const appUrl = location.origin + location.pathname
  const expire = new Date(Date.now() + 14 * 86400000).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })

  async function generate() {
    if (!confirm('ออกรหัสใหม่ให้นักศึกษาที่ยังไม่เปิดใช้งาน?\nรหัสเดิมที่ยังไม่ได้ใช้ของคนเหล่านี้จะใช้ไม่ได้ (คนที่เปิดใช้งานแล้วไม่ได้รับผลกระทบ)\nรหัสจะแสดงครั้งเดียว กรุณาดาวน์โหลดหรือพิมพ์เก็บไว้')) return
    setBusy(true); setMsg('')
    const { data, error } = await supabase.rpc('teacher_issue_codes', { p_section: section.id })
    setBusy(false)
    if (error) return setMsg(errMsg(error))
    setRows(data ?? [])
  }

  function downloadCsv() {
    const q = s => `"${String(s).replace(/"/g, '""')}"`
    const lines = [['รหัสนักศึกษา', 'ชื่อ', 'รหัสเปิดใช้งาน'].map(q).join(',')]
    for (const r of rows) lines.push([r.student_code, r.full_name, r.code].map(q).join(','))
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `activation-codes-${section.courses.code}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="codes">
      {msg && <p className="err">{msg}</p>}
      {rows === null && (
        <>
          <p className="muted">ออกรหัสเปิดใช้งานให้นักศึกษาที่ยังไม่ได้ลงทะเบียนใช้งาน รหัสมีอายุ 14 วัน ใช้ได้ครั้งเดียว</p>
          <button onClick={generate} disabled={busy}>{busy ? 'กำลังออกรหัส…' : 'ออกรหัสให้ทั้งห้อง'}</button>
        </>
      )}
      {rows !== null && rows.length === 0 && <p className="ok">นักศึกษาทุกคนเปิดใช้งานบัญชีแล้ว ไม่ต้องออกรหัส</p>}
      {rows !== null && rows.length > 0 && (
        <>
          <p className="err"><b>รหัสแสดงครั้งเดียว</b> ปิดหน้านี้แล้วดูย้อนหลังไม่ได้ ({rows.length} คน)</p>
          <button onClick={downloadCsv}>⬇ ดาวน์โหลด CSV</button>
          <button className="secondary" onClick={() => window.print()}>🖨 พิมพ์สลิป</button>
          <table className="codetable">
            <thead><tr><th>รหัส</th><th>ชื่อ</th><th>รหัสเปิดใช้งาน</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.student_code}><td>{r.student_code}</td><td>{r.full_name}</td><td><b>{r.code}</b></td></tr>
              ))}
            </tbody>
          </table>

          <div className="print-area">
            {rows.map(r => (
              <div className="slip" key={r.student_code}>
                <b>{course}</b>
                <div>{r.full_name}</div>
                <div>รหัสนักศึกษา: {r.student_code}</div>
                <div className="slipcode">{r.code}</div>
                <div className="slipnote">ลงทะเบียนที่ {appUrl}<br />เลือก "นักศึกษา: ลงทะเบียนครั้งแรก" · ใช้ได้ถึง {expire}<br />รหัสใช้ได้ครั้งเดียว ห้ามแจกต่อ</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

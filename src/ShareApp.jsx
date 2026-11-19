import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import Logo from './Logo.jsx'
import Icon from './Icon.jsx'

// เมนู "แชร์แอป": QR ใหญ่ + ลิงก์ + วิธีติดตั้ง สำหรับอาจารย์ให้นักศึกษาสแกน (พิมพ์แปะที่ห้องเรียนได้)
export default function ShareApp() {
  const url = location.origin + location.pathname
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    QRCode.toDataURL(url, { width: 900, margin: 1 }).then(setQr).catch(() => {})
  }, [url])

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }

  return (
    <>
      <section className="card center no-print-extra">
        <h2>แชร์แอปให้นักศึกษา</h2>
        <p className="muted">ให้นักศึกษาสแกน QR นี้ด้วยกล้องมือถือ แล้วติดตั้งลงหน้าจอโฮม</p>
        <div className="sharebtns">
          <button onClick={() => window.print()}><Icon name="printer" size={18} /> พิมพ์ QR (แปะที่ห้องเรียน)</button>
          <button className="secondary" onClick={copy}>{copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}</button>
        </div>
      </section>

      <section className="card center print-share">
        <div className="share-logo"><Logo size={40} /></div>
        <p className="share-title">สแกนเพื่อเปิดระบบเช็คชื่อ</p>
        {qr ? <img className="shareqr" src={qr} alt="QR เปิดเว็บ MJU Check" /> : <p className="muted">กำลังสร้าง QR…</p>}
        <p className="shareurl">{url}</p>

        <div className="sharesteps">
          <div>
            <b>iPhone / iPad (Safari)</b>
            <ol>
              <li>สแกน QR แล้วเปิดใน <b>Safari</b> (ไม่ใช่ในแอป LINE หรือ Facebook)</li>
              <li>กดปุ่ม <b>แชร์</b> (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ที่แถบด้านล่าง</li>
              <li>เลือก <b>เพิ่มไปยังหน้าจอโฮม</b> แล้วกด <b>เพิ่ม</b></li>
            </ol>
          </div>
          <div>
            <b>Android (Chrome)</b>
            <ol>
              <li>สแกน QR แล้วเปิดใน <b>Chrome</b></li>
              <li>กดเมนู (จุดสามจุดมุมขวาบน) เลือก <b>ติดตั้งแอป</b> หรือ <b>เพิ่มลงในหน้าจอหลัก</b></li>
            </ol>
          </div>
        </div>
        <p className="muted sharenote">ครั้งแรกให้เลือก "ลงทะเบียนครั้งแรก" แล้วกรอกรหัสนักศึกษาและรหัสเปิดใช้งานที่ได้รับจากอาจารย์</p>
      </section>
    </>
  )
}

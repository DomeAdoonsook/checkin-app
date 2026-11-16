import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// การ์ดติดตั้งแอปลงมือถือ: QR (สแกนจากคอม), ปุ่มติดตั้ง (Android), วิธีติดตั้ง (iPhone/Android)
export default function InstallCard() {
  const url = location.origin + location.pathname
  const [qr, setQr] = useState('')
  const [evt, setEvt] = useState(null)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)

  useEffect(() => {
    QRCode.toDataURL(url, { width: 640, margin: 1 }).then(setQr).catch(() => {})
    const onPrompt = e => { e.preventDefault(); setEvt(e) }
    addEventListener('beforeinstallprompt', onPrompt)
    return () => removeEventListener('beforeinstallprompt', onPrompt)
  }, [url])

  if (standalone) return null   // ติดตั้งแล้ว ไม่ต้องแสดง

  async function install() {
    evt.prompt()
    await evt.userChoice
    setEvt(null)
  }

  return (
    <section className="card install">
      <h3>ติดตั้งแอปลงมือถือ</h3>
      <div className="install-row">
        {qr && <img className="installqr" src={qr} alt="QR สำหรับเปิดเว็บนี้บนมือถือ" />}
        <p className="muted">สแกน QR ด้วยกล้องมือถือเพื่อเปิดเว็บนี้ แล้วทำตามวิธีติดตั้งด้านล่าง เพื่อให้มีไอคอนบนหน้าจอโฮม เปิดได้ทันทีเหมือนแอปทั่วไป</p>
      </div>
      {evt && <button onClick={install}>ติดตั้งแอปบนอุปกรณ์นี้</button>}
      <details open={ios}>
        <summary>iPhone / iPad (Safari)</summary>
        <ol>
          <li>เปิดเว็บนี้ใน <b>Safari</b> (ไม่ใช่ในแอป LINE หรือ Facebook)</li>
          <li>กดปุ่ม <b>แชร์</b> (รูปสี่เหลี่ยมมีลูกศรชี้ขึ้น) ที่แถบด้านล่าง</li>
          <li>เลื่อนลงแล้วเลือก <b>เพิ่มไปยังหน้าจอโฮม</b> จากนั้นกด <b>เพิ่ม</b></li>
        </ol>
      </details>
      <details>
        <summary>Android (Chrome)</summary>
        <ol>
          <li>เปิดเว็บนี้ใน <b>Chrome</b></li>
          <li>กดปุ่ม <b>ติดตั้งแอป</b> ด้านบน หรือกดเมนู (จุดสามจุดมุมขวาบน) แล้วเลือก <b>ติดตั้งแอป</b> / <b>เพิ่มลงในหน้าจอหลัก</b></li>
        </ol>
      </details>
    </section>
  )
}

import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './style.css'

// แสดงข้อความ error บนหน้าจอแทนหน้าขาว (ช่วยไล่ปัญหาบนมือถือ)
class Boundary extends React.Component {
  state = { err: null }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (!this.state.err) return this.props.children
    const e = this.state.err
    return (
      <pre style={{ whiteSpace: 'pre-wrap', padding: 16, color: '#b91c1c', font: '13px monospace' }}>
        {'เกิดข้อผิดพลาด (ส่งภาพนี้ให้ผู้พัฒนา):\n' + (e?.message ?? e) + '\n' + String(e?.stack ?? '').slice(0, 600)}
      </pre>
    )
  }
}

createRoot(document.getElementById('root')).render(<Boundary><App /></Boundary>)

// ลงทะเบียน service worker (ให้ติดตั้งลงหน้าจอโฮมได้) ไม่แคชไฟล์
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}))
}

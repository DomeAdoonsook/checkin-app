import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

// ID เครื่อง (คงที่ต่ออุปกรณ์) ใช้ตรวจว่าเครื่องเดียวเช็คหลายบัญชีหรือไม่
export function deviceId() {
  try {
    let id = localStorage.getItem('device_id')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('device_id', id) }
    return id
  } catch { return null }
}

export const statusLabel = {
  present: 'มาเรียน', late: 'สาย', absent: 'ขาด', leave: 'ลา', pending: 'รอตรวจสอบ',
}

// แปลง error จากฐานข้อมูลเป็นข้อความไทย
export function errMsg(e) {
  const m = e?.message ?? String(e)
  const d = m.match(/OUT_OF_RANGE:(\d+):(\d+)/)
  if (d) return `คุณอยู่ห่างจากห้องเรียน ${d[1]} เมตร (รัศมีที่อนุญาต ${d[2]} เมตร)`
  if (m.includes('INVALID_TOKEN')) return 'QR หมดอายุ กรุณาสแกนใหม่จากหน้าจอ'
  if (m.includes('SESSION_CLOSED')) return 'คาบนี้ปิดแล้ว'
  if (m.includes('NOT_ENROLLED')) return 'คุณไม่ได้ลงทะเบียนวิชานี้'
  if (m.includes('LOCATION_REQUIRED')) return 'ต้องอนุญาตการเข้าถึงตำแหน่งเพื่อเช็คชื่อ'
  if (m.includes('SECTION_EXISTS')) return 'กลุ่มเรียนนี้ (รหัสวิชา ภาคเรียน และกลุ่ม) มีอยู่แล้วและเป็นของอาจารย์ท่านอื่น กรุณาเปลี่ยนกลุ่มหรือติดต่อแอดมิน'
  if (m.includes('FORBIDDEN')) return 'ไม่มีสิทธิ์ดำเนินการ'
  if (m.includes('REASON_REQUIRED')) return 'กรุณากรอกเหตุผล'
  return m
}

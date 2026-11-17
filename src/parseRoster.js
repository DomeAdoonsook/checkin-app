// อ่านไฟล์รายชื่อนักศึกษา: ไฟล์ .doc จากทะเบียน (จริงๆ เป็น RTF รหัสภาษาไทย cp874), CSV/TSV, หรือข้อความที่วาง
//   ไฟล์ทะเบียน: เลขที่ | รหัสประจำตัว | ชื่อ | เอก | กลุ่ม | สถานภาพ | จาก (0 ลงทะเบียน, 1 เพิ่ม, 2 ถอน, 3 เปลี่ยนกลุ่ม, 4 โอนย้ายออก)

const BS = String.fromCharCode(92)
const SKIP = /^(fonttbl|colortbl|stylesheet|info|listtable|listoverridetable|pict)/   // ไม่ข้าม header: ชื่อวิชา/ภาคเรียนอยู่ในส่วนหัวกระดาษ

function decode(label, bytes) {
  try { return new TextDecoder(label).decode(bytes) } catch { return new TextDecoder('utf-8').decode(bytes) }
}

// แปลง RTF เป็นข้อความธรรมดา (ตัวอักษรไทยแบบ \'xx และไบต์ตรงใน cp874)
export function rtfToText(buf) {
  const raw = decode('windows-874', buf)
  const td = (arr) => decode('windows-874', Uint8Array.from(arr))
  let out = '', i = 0, depth = 0, skipDepth = -1, bytes = []
  const flush = () => { if (bytes.length) { out += td(bytes); bytes = [] } }
  while (i < raw.length) {
    const c = raw[i]
    if (c === '{') {
      depth++; i++
      if (skipDepth < 0 && raw[i] === BS && (raw[i + 1] === '*' || SKIP.test(raw.slice(i + 1, i + 20)))) skipDepth = depth
      continue
    }
    if (c === '}') { if (depth === skipDepth) skipDepth = -1; depth--; i++; continue }
    if (c === BS) {
      const m = /^.'([0-9a-fA-F]{2})/.exec(raw.slice(i, i + 4))
      if (m) { if (skipDepth < 0) bytes.push(parseInt(m[1], 16)); i += 4; continue }
      flush()
      const w = /^.([a-z]+)(-?\d+)? ?/.exec(raw.slice(i, i + 40))
      if (w) {
        if (skipDepth < 0) {
          if (w[1] === 'par' || w[1] === 'row') out += '\n'
          else if (w[1] === 'cell') out += '\t'
          else if (w[1] === 'u') { out += String.fromCharCode((+w[2] + 65536) % 65536); i += w[0].length; if (raw[i] === '?') i++; continue }
        }
        i += w[0].length; continue
      }
      i += 2; continue
    }
    if (c === '\r' || c === '\n') { i++; continue }
    if (skipDepth < 0) { flush(); out += c }
    i++
  }
  flush()
  return out
}

// อ่านไฟล์ -> ข้อความ (รองรับ RTF/.doc จากทะเบียน และไฟล์ข้อความ UTF-8 หรือ cp874)
export async function fileToText(file) {
  const buf = new Uint8Array(await file.arrayBuffer())
  const head = String.fromCharCode(...buf.slice(0, 6))
  if (head.startsWith('{' + BS + 'rtf')) return rtfToText(buf)
  if (buf[0] === 0xd0 && buf[1] === 0xcf) throw new Error('ไฟล์ .doc แบบ Word ไบนารีอ่านไม่ได้ กรุณาบันทึกเป็น CSV หรือคัดลอกตารางมาวาง')
  if (buf[0] === 0x50 && buf[1] === 0x4b) throw new Error('ไฟล์ Word/Excel (.docx/.xlsx) อ่านไม่ได้ กรุณาบันทึกเป็น CSV หรือคัดลอกตารางมาวาง')
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { return decode('windows-874', buf) }
}

// ข้อมูลวิชาจากส่วนหัวของไฟล์ทะเบียน: "รายวิชา 10901106 วิศวกรรมการประมง ... หน่วยกิต" และ "ปีการศึกษา 2/2569"
export function parseMeta(text) {
  const flat = text.replace(/\s+/g, ' ')
  const c = /รายวิชา\s*(\d{6,10})\s+(.+?)\s*(?:หน่วยกิต|$)/.exec(flat)
  const t = /ปีการศึกษา\s*(\d)\s*\/\s*(\d{4})/.exec(flat)
  return {
    code: c ? c[1] : '',
    name: c ? c[2].trim() : '',
    term: t ? `${t[1]}/${t[2]}` : '',
  }
}

// แยกแถวรายชื่อ: หาช่อง 10 หลัก (รหัสนักศึกษา) แล้วถัดไปคือชื่อ
//  - แถวจากไฟล์ทะเบียน (คั่นด้วยแท็บ): อ่านกลุ่มจากคอลัมน์ "กลุ่ม" และข้ามคนที่ "ถอน"/"โอนย้ายออก"
//  - ข้อความที่วาง: รหัส, ชื่อ [, กลุ่ม]
// คืน rows: [{ code, name, group }] (group เป็นตัวเลขหรือ null)
export function parseRows(text) {
  const rows = [], seen = new Set()
  let skipped = 0, withdrawn = 0
  let off = { name: 1, group: 3, from: 5 }     // ตำแหน่งคอลัมน์เทียบกับช่องรหัสนักศึกษา (ค่าตั้งต้นตามไฟล์ทะเบียน)
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const cells = line.split('\t').map(s => s.trim())

    // หัวตาราง: อ่านตำแหน่งคอลัมน์จริงของไฟล์
    const hc = cells.indexOf('รหัสประจำตัว')
    if (hc >= 0) {
      const g = cells.indexOf('กลุ่ม'), n = cells.indexOf('ชื่อ'), f = cells.indexOf('จาก')
      off = { name: n >= 0 ? n - hc : off.name, group: g >= 0 ? g - hc : off.group, from: f >= 0 ? f - hc : off.from }
      continue
    }

    let code, name, group = null
    const ti = cells.findIndex(x => /^\d{10}$/.test(x))
    if (line.includes('\t') && ti >= 0) {
      code = cells[ti]
      name = cells[ti + off.name] ?? ''
      let g = cells[ti + off.group]
      // "รหัส<แท็บ>ชื่อ<แท็บ>กลุ่ม" (รูปแบบที่ระบบแสดงในช่องวาง)
      if (g === undefined && cells.length === ti + 3 && /^\d{1,2}$/.test(cells[ti + 2])) g = cells[ti + 2]
      if (g && /^\d{1,2}$/.test(g)) group = +g
      const from = cells[ti + off.from]
      if (from === '2' || from === '4') { withdrawn++; continue }      // ถอน / โอนย้ายออก
    } else {
      let f = line.split(/,|;|\t/).map(s => s.trim()).filter(Boolean)
      if (f.length < 2) f = line.trim().split(/\s{2,}|\s+/)             // กรณีคั่นด้วยช่องว่าง
      const i = f.findIndex(x => /^\d{10}$/.test(x))
      if (i < 0) continue
      code = f[i]
      const hasSep = /,|;/.test(line)
      name = hasSep ? (f[i + 1] ?? '') : f.slice(i + 1).join(' ')      // ไม่มีตัวคั่น: รวมคำที่เหลือเป็นชื่อ
      if (hasSep && f[i + 2] && /^\d{1,2}$/.test(f[i + 2])) group = +f[i + 2]
    }
    if (!name || /^\d+$/.test(name)) { skipped++; continue }
    if (seen.has(code)) { skipped++; continue }
    seen.add(code)
    rows.push({ code, name, group })
  }
  return { rows, skipped, withdrawn }
}

// ชื่อไฟล์แบบ 10901106_1_Year_2_2569.doc -> { course, group, term }
export function parseFileName(name) {
  const m = /^(\d{6,10})_(\d+)_Year_(\d)_(\d{4})/i.exec(name)
  return m ? { course: m[1], group: m[2], term: `${m[3]}/${m[4]}` } : null
}

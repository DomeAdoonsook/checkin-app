// อ่านไฟล์รายชื่อนักศึกษา: ไฟล์ .doc จากทะเบียน (จริงๆ เป็น RTF รหัสภาษาไทย cp874), CSV/TSV, หรือข้อความที่วาง

const BS = String.fromCharCode(92)
const SKIP = /^(fonttbl|colortbl|stylesheet|info|listtable|listoverridetable|pict|header|footer)/

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

// แยกแถวรายชื่อ: หาช่อง 10 หลัก (รหัสนักศึกษา) แล้วถัดไปคือชื่อ และสาขา/หลักสูตร
export function parseRows(text) {
  const rows = [], seen = new Set()
  let skipped = 0
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    let f = line.split(/\t|,|;/).map(s => s.trim()).filter(Boolean)
    if (f.length < 2) f = line.trim().split(/\s{2,}|\s+/)             // กรณีคั่นด้วยช่องว่าง
    const i = f.findIndex(x => /^\d{10}$/.test(x))
    if (i < 0) continue
    let name = f[i + 1] ?? ''
    // ถ้าไม่มีตัวคั่นเลย (ชื่อ-นามสกุลถูกแยกด้วยช่องว่าง) ให้รวมคำที่เหลือเป็นชื่อ
    if (line.indexOf('\t') < 0 && !/[,;]/.test(line)) { name = f.slice(i + 1).join(' ') }
    if (!name || /^\d+$/.test(name)) { skipped++; continue }
    if (seen.has(f[i])) { skipped++; continue }
    seen.add(f[i])
    rows.push({ code: f[i], name })   // เอาเฉพาะรหัสนักศึกษากับชื่อ-สกุล (คอลัมน์อื่นในไฟล์ทะเบียนไม่ใช้)
  }
  return { rows, skipped }
}

// ชื่อไฟล์แบบ 10901106_1_Year_2_2569.doc -> { course, group, term }
export function parseFileName(name) {
  const m = /^(\d{6,10})_(\d+)_Year_(\d)_(\d{4})/i.exec(name)
  return m ? { course: m[1], group: m[2], term: `${m[3]}/${m[4]}` } : null
}

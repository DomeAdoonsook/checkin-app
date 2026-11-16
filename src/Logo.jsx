import { useId } from 'react'

// โลโก้ MJU Check: กล่องมน 3 กล่อง (M เขียว / J ขาว / U เหลือง) พื้นฟ้าไล่เฉด ตามด้วยคำว่า Check
// สไตล์เดียวกับ MJU Workspace
export default function Logo({ size = 24, text = true }) {
  const gid = useId().replace(/:/g, '')
  return (
    <span className="logo-wrap" style={{ gap: Math.round(size * 0.1), flexDirection: 'column', alignItems: 'center' }}>
      <svg height={size} width={(size * 104) / 32} viewBox="0 0 104 32" role="img" aria-label="MJU">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4f8cff" />
            <stop offset="1" stopColor="#2456d6" />
          </linearGradient>
        </defs>
        <rect x="0" width="32" height="32" rx="9" fill={`url(#${gid})`} />
        <rect x="36" width="32" height="32" rx="9" fill={`url(#${gid})`} />
        <rect x="72" width="32" height="32" rx="9" fill={`url(#${gid})`} />
        <path d="M8 23V10.5l8 7.5 8-7.5V23" fill="none" stroke="#6ff0a0" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M56 8.5v10a5 5 0 0 1-10 0" fill="none" stroke="#fff" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M81 9v9a7 7 0 0 0 14 0V9" fill="none" stroke="#ffd43b" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {text && <span className="logo-text" style={{ fontSize: Math.round(size * 0.9) }}>Check</span>}
    </span>
  )
}

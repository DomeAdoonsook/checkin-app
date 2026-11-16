import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// base './' ให้ใช้ได้ทั้งที่ราก (localhost) และใต้ path ย่อยของ GitHub Pages
export default defineConfig({ base: './', plugins: [react()], server: { host: true } })

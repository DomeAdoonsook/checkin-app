// Service worker แบบน้อยที่สุด: ทำให้ติดตั้งเป็นแอปได้ ไม่แคชไฟล์ใดๆ (กันปัญหาหน้าเก่าค้างหลัง deploy)
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})

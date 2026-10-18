# ส่งงาน · บันทึกคะแนน (CMRUScoreSaver)

ระบบส่งงานและบันทึกคะแนนสำหรับรายวิชา ARTD2303 / ARTD3314 มหาวิทยาลัยราชภัฏเชียงใหม่

- **นักศึกษา**: ล็อกอินด้วยบัญชี Google มหาวิทยาลัย → ส่งไฟล์งาน (ไฟล์ใหญ่ได้ ไม่จำกัด 50MB) หรือแปะลิงก์ → ดูคะแนน ความเห็น การเข้าเรียน และเกรด
- **อาจารย์**: นำเข้ารายชื่อจากไฟล์ .xls ของระบบทะเบียน → สร้างงาน → ตรวจ/ให้คะแนน → เช็คชื่อ 16 สัปดาห์ → คะแนนสอบ → สมุดคะแนนคำนวณเกรด A–F → ดาวน์โหลด Excel
- ไฟล์งานเก็บใน **Google Drive ของอาจารย์** แชร์ให้เฉพาะเจ้าของงาน · ข้อมูลทั้งหมดเก็บใน **Google Sheet**

👉 วิธีติดตั้ง: [SETUP.md](SETUP.md) · ลองเล่น: เปิดเว็บแล้วเติม `?demo` ท้าย URL

## โครงสร้าง

```
index.html, css/, js/          หน้าเว็บ (GitHub Pages, ไม่ต้อง build)
  js/grade.js                  สูตรคำนวณคะแนน/เกรด (ใช้ทั้งเว็บและ backend)
  js/roster.js                 อ่านไฟล์รายชื่อ .xls ของระบบทะเบียน
  js/views/student.js|teacher.js
  js/mock/memory-backend.js    แทน Google Sheet/Drive ด้วยหน่วยความจำ (โหมดทดลอง + tests)
server/                        โค้ด Google Apps Script (ต้นฉบับ)
dist/Code.gs                   ไฟล์รวม — คัดลอกไปวางใน Apps Script (สร้างด้วย npm run build)
test/                          node --test
```

## พัฒนา

```bash
npm test          # ทดสอบ backend + สูตรเกรด + ตัวอ่านรายชื่อ
npm run build     # รวม server/*.js → dist/Code.gs (ต้องรันทุกครั้งที่แก้ server/ หรือ js/grade.js)
npm run serve     # เปิด http://localhost:8080/?demo
```

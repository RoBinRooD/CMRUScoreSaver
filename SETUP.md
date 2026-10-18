# วิธีติดตั้ง (ทำครั้งเดียว ประมาณ 20 นาที)

ระบบมี 3 ส่วน ทั้งหมดฟรีและอยู่ในบัญชีของอาจารย์เอง

| ส่วน | ทำหน้าที่ | อยู่ที่ |
|---|---|---|
| หน้าเว็บ | หน้าจอที่อาจารย์และนักศึกษาใช้ | GitHub Pages (repo นี้) |
| Backend | ตรวจการล็อกอิน, อ่าน/เขียนข้อมูล, เปิดการอัปโหลดไฟล์ | Google Apps Script |
| ข้อมูล | ฐานข้อมูล = Google Sheet, ไฟล์งาน = Google Drive | Google Drive ของอาจารย์ |

> ลองใช้ก่อนติดตั้งได้ที่ `https://robinrood.github.io/CMRUScoreSaver/?demo` (โหมดทดลอง ข้อมูลอยู่ในเบราว์เซอร์เท่านั้น)

---

## 1. สร้าง Google Sheet และวางโค้ด backend

1. เปิด <https://sheets.new> ตั้งชื่อเช่น `CMRUScoreSaver ฐานข้อมูล`
2. เมนู **ส่วนขยาย (Extensions) → Apps Script**
3. ลบโค้ดเดิมในไฟล์ `Code.gs` ทั้งหมด แล้ววางเนื้อหาจากไฟล์ [`dist/Code.gs`](dist/Code.gs) ของ repo นี้
4. คลิก ⚙️ **Project Settings** → ติ๊ก **Show "appsscript.json" manifest file in editor**
   แล้วกลับไปที่ Editor เปิด `appsscript.json` วางเนื้อหาจาก [`dist/appsscript.json`](dist/appsscript.json) ทับ
5. กด 💾 บันทึก
6. เลือกฟังก์ชัน **`setup`** ในแถบด้านบน แล้วกด **Run**
   - Google จะขออนุญาต → เลือกบัญชีของอาจารย์ → *Advanced* → *Go to … (unsafe)* → *Allow*
     (ขึ้นคำว่า unsafe เพราะเป็นสคริปต์ที่เราเขียนเอง ยังไม่ผ่านการรีวิวของ Google — ปกติ)
   - เสร็จแล้ว Sheet จะมีแท็บ `Settings, Courses, Students, Assignments, Submissions, Attendance, Exams`
     และใน Drive จะมีโฟลเดอร์ **CMRUScoreSaver งานนักศึกษา** (ไฟล์ที่นักศึกษาส่งจะอยู่ในนี้)

## 2. สร้าง OAuth Client ID (สำหรับปุ่ม "เข้าสู่ระบบด้วย Google")

1. เปิด <https://console.cloud.google.com/> → สร้าง Project ใหม่ เช่น `cmru-scoresaver`
2. **APIs & Services → OAuth consent screen** (หรือ *Google Auth Platform → Branding*)
   - User type: **External**
   - App name: `ส่งงาน · บันทึกคะแนน`, ใส่อีเมลอาจารย์ในช่อง support / developer contact
   - ไม่ต้องเพิ่ม scope ใดๆ (ใช้แค่ชื่อและอีเมล)
   - ที่ **Audience / Publishing status** กด **Publish app** (In production) — ไม่ต้องรอ Google ตรวจ เพราะไม่ได้ขอ scope พิเศษ
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: เพิ่ม
     - `https://robinrood.github.io`
     - `http://localhost:8080` (ไว้ทดสอบในเครื่อง — ไม่ใส่ก็ได้)
   - ไม่ต้องใส่ Redirect URI
4. คัดลอก **Client ID** (ลงท้ายด้วย `.apps.googleusercontent.com`)

> Client ID ไม่ใช่ความลับ ใส่ในไฟล์สาธารณะได้ — **ไม่ต้อง** สร้าง API key หรือ client secret

## 3. ตั้งค่าในแท็บ `Settings` ของ Google Sheet

| key | ใส่ค่า |
|---|---|
| `clientId` | Client ID จากข้อ 2 |
| `allowedDomains` | โดเมนอีเมลนักศึกษา เช่น `g.cmru.ac.th` (คั่นด้วย `,` ได้หลายโดเมน · เว้นว่าง = บัญชี Google ใดก็ได้) |
| `teacherEmails` | อีเมลอาจารย์ (ตั้งเป็นอีเมลของคุณให้แล้ว) — เพิ่มผู้ช่วยสอนได้ คั่นด้วย `,` |
| `allowedOrigins` | `https://robinrood.github.io` (ตั้งให้แล้ว) |
| `uploadMaxMB` | ขนาดไฟล์สูงสุดต่อไฟล์ (ค่าเริ่มต้น 2048 MB) |

ค่าอื่นๆ (เกณฑ์เกรด, คะแนนเช็คชื่อ) แก้ได้จากหน้าเว็บแท็บ **ตั้งค่า**

## 4. Deploy backend เป็น Web app

1. ใน Apps Script กด **Deploy → New deployment** → ⚙️ เลือก **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
     (จำเป็นเพื่อให้หน้าเว็บเรียกได้ — ความปลอดภัยมาจากการตรวจ Google ID token ทุกครั้ง ไม่ใช่จากการซ่อน URL)
2. กด Deploy → คัดลอก **Web app URL** (ลงท้ายด้วย `/exec`)

## 5. ใส่ค่าในหน้าเว็บ แล้วเปิด GitHub Pages

1. แก้ไฟล์ [`js/config.js`](js/config.js) บน GitHub (กดรูปดินสอ):
   ```js
   apiUrl: 'https://script.google.com/macros/s/XXXX/exec',
   googleClientId: 'XXXX.apps.googleusercontent.com'
   ```
   แล้ว Commit
2. ที่ repo → **Settings → Pages** → Source: **Deploy from a branch** → เลือก branch หลัก และโฟลเดอร์ `/ (root)` → Save
3. รอ 1–2 นาที เว็บจะอยู่ที่ **https://robinrood.github.io/CMRUScoreSaver/**

> GitHub Pages แบบฟรีต้องเป็น repo สาธารณะ — โค้ดเห็นได้ แต่ **ไม่มีข้อมูลนักศึกษาอยู่ใน repo**
> (รายชื่อ คะแนน และไฟล์งานอยู่ใน Google Sheet/Drive ของอาจารย์เท่านั้น และ `.gitignore` กันไฟล์ .xls ไว้แล้ว)

## 6. เริ่มใช้งาน

1. เปิดเว็บ ล็อกอินด้วยบัญชีอาจารย์ → แท็บ **นักศึกษา** → เลือกไฟล์ `.xls` รายชื่อจากระบบทะเบียน → **นำเข้า**
   ทำทีละวิชา (ARTD2303 แล้ว ARTD3314) — วิชาจะถูกสร้างอัตโนมัติ
2. แท็บ **งาน** → สร้างงาน กำหนดคะแนนเต็มและวันส่ง
3. ส่งลิงก์เว็บให้นักศึกษา — นักศึกษาล็อกอินด้วยบัญชีมหาวิทยาลัย
   - ถ้าอีเมลขึ้นต้นด้วยรหัสนักศึกษา (เช่น `67152901@…`) ระบบผูกให้อัตโนมัติ
   - ถ้าไม่ใช่ นักศึกษากรอกรหัสเองครั้งแรก (ผูกได้ครั้งเดียว) — อาจารย์ดู/แก้/รีเซ็ตได้ในแท็บ **นักศึกษา**

## ✅ เช็คลิสต์ทดสอบหลังติดตั้ง

- [ ] เปิด Web app URL ตรงๆ ในเบราว์เซอร์ → เห็น `{"ok":true,…}`
- [ ] ล็อกอินบัญชีอาจารย์ → เห็นแท็บของอาจารย์
- [ ] ล็อกอินด้วยบัญชีนักศึกษาทดสอบ (หรือเพิ่มอีเมลส่วนตัวของอาจารย์ให้นักศึกษาสมมติในแท็บนักศึกษา)
- [ ] ส่งไฟล์ใหญ่ (เช่น 200 MB) → แถบความคืบหน้าวิ่งจนจบ → ไฟล์อยู่ใน Drive ที่ `CMRUScoreSaver งานนักศึกษา/<วิชา>/<งาน>/<รหัส ชื่อ>/`
- [ ] นักศึกษาคลิกชื่อไฟล์ของตัวเองแล้วเปิดดูได้ · ลองเปิดลิงก์เดียวกันด้วยบัญชีอื่น → ต้องเข้าไม่ได้
- [ ] อาจารย์ให้คะแนน → นักศึกษาเห็นคะแนนและความเห็น

## เมื่อมีการอัปเดตโค้ด backend

วาง `dist/Code.gs` ใหม่ทับ → **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**
(URL เดิมใช้ต่อได้ ไม่ต้องแก้ `config.js`)

## แก้ปัญหา

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| "ยังไม่ได้ตั้งค่า apiUrl / googleClientId" | แก้ `js/config.js` (ข้อ 5) |
| ปุ่ม Google ไม่ขึ้น / ขึ้น `origin_mismatch` | ใส่ `https://robinrood.github.io` ใน Authorized JavaScript origins (ข้อ 2.3) |
| "โทเคนไม่ได้ออกให้เว็บนี้" | `clientId` ในแท็บ Settings ไม่ตรงกับใน `config.js` |
| "บัญชีนี้ใช้ไม่ได้ กรุณาเข้าสู่ระบบด้วยบัญชี @…" | นักศึกษาใช้บัญชีส่วนตัว หรือ `allowedDomains` ไม่ถูก |
| "เว็บไซต์ … ไม่ได้รับอนุญาตให้อัปโหลด" | เพิ่ม origin นั้นใน `allowedOrigins` |
| "เปิดการอัปโหลดไม่สำเร็จ (403)" | ตรวจว่า `appsscript.json` มี Drive API (ข้อ 1.4) แล้ว Run `setup` อีกครั้งเพื่ออนุญาตสิทธิ์ใหม่ |
| แก้โค้ดแล้วเว็บยังเป็นแบบเดิม | ต้อง Deploy *New version* (ดูหัวข้อด้านบน) |

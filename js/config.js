// ตั้งค่าเว็บ — แก้ 2 ค่านี้หลัง Deploy Apps Script และสร้าง OAuth Client ID (ดู SETUP.md)
// ทั้งสองค่าไม่ใช่ความลับ ใส่ในไฟล์สาธารณะได้
window.APP_CONFIG = {
  // URL ของ Apps Script Web app (ลงท้ายด้วย /exec)
  apiUrl: '',
  // OAuth 2.0 Client ID (ชนิด Web application) จาก Google Cloud Console
  googleClientId: ''
};

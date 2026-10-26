// เรียก backend (Apps Script) — โหมดทดลองจะรันโค้ด backend ตัวเดียวกันในเบราว์เซอร์กับข้อมูลจำลอง
import { DEMO, getToken, signOut } from './auth.js';

let reauth = null; // ตั้งโดย app.js: ฟังก์ชันที่ให้ผู้ใช้ล็อกอินใหม่แล้วคืน token

export function onReauth(fn) {
  reauth = fn;
}

let demoReady;
function loadDemoBackend() {
  const files = ['server/Code.js', 'server/Db.js', 'server/Auth.js', 'server/Api.js', 'server/Upload.js', 'server/Groups.js', 'server/Syllabus.js', 'server/Board.js', 'server/Dashboard.js', 'server/Leave.js',
    'server/Setup.js', 'js/mock/memory-backend.js'];
  demoReady ??= files.reduce((p, src) => p.then(() => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src + '?v=' + (window.ASSET_VERSION?.[src] || '');
    s.onload = resolve;
    s.onerror = () => reject(new Error('โหลด ' + src + ' ไม่ได้'));
    document.head.append(s);
  })), Promise.resolve());
  return demoReady;
}

export async function call(action, payload = {}, retried = false) {
  let token = getToken();
  if (!token) token = await reauth();
  let res;
  if (DEMO) {
    await loadDemoBackend();
    await new Promise((r) => setTimeout(r, 120)); // จำลองความหน่วงของเครือข่าย
    res = JSON.parse(JSON.stringify(window.handleRequest_({ action, payload, idToken: token })));
  } else {
    const r = await fetch(window.APP_CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // text/plain = ไม่ต้องมี CORS preflight
      body: JSON.stringify({ action, payload, idToken: token })
    });
    if (!r.ok) throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (' + r.status + ')');
    res = await r.json();
  }
  if (res.ok) return res.data;
  if (/^AUTH: /.test(res.error) && !retried) {
    signOut();
    await reauth(res.error.replace(/^AUTH: /, ''));
    return call(action, payload, true);
  }
  throw new Error(res.error.replace(/^AUTH(_DOMAIN)?: /, ''));
}

export function resetDemo() {
  window.memoryReset_?.();
}

/**
 * ส่งคำสั่งตอนปิด/ซ่อนหน้า (navigator.sendBeacon) — ไม่รอผล คืน true ถ้าส่งออกไปได้
 * ใช้เป็นด่านสุดท้ายเท่านั้น: ผู้เรียกต้องเก็บข้อมูลสำรองไว้เองจนกว่า call() ปกติจะยืนยันว่าบันทึกแล้ว
 */
export function beacon(action, payload) {
  const token = getToken();
  if (!token) return false;
  const body = JSON.stringify({ action, payload, idToken: token });
  if (DEMO) {
    if (!window.handleRequest_) return false;
    window.handleRequest_(JSON.parse(body));
    return true;
  }
  try {
    return navigator.sendBeacon(window.APP_CONFIG.apiUrl, new Blob([body], { type: 'text/plain;charset=utf-8' }));
  } catch {
    return false;
  }
}

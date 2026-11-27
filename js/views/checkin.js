// เช็คชื่อด้วย QR — จอของอาจารย์ (ขึ้นโปรเจกเตอร์) และหน้าผลลัพธ์หลังนักศึกษาสแกน
import { h, mount, loading, toast, modal, actionButton, MARK_LABEL } from '../ui.js';
import { call } from '../api.js';
import { DEMO } from '../auth.js';

const CI_KEY = 'cmruscoresaver_checkin';
const CI_MAX_AGE = 3 * 60000; // ค้างจากการสแกนได้ไม่เกิน 3 นาที (รหัสหมดอายุราว 2 นาทีอยู่แล้ว)
const IN_APP = /Line\/|FBAN|FBAV|FB_IAB|Instagram|MicroMessenger/i;

/* ---------- ลิงก์ใน QR ---------- */

function checkInUrl(courseCode, slot, code) {
  // openExternalBrowser=1: ให้แอป LINE เปิดในเบราว์เซอร์จริง (ล็อกอิน Google ในแอป LINE ไม่ได้)
  return `${location.origin}${location.pathname}?ci=${encodeURIComponent(courseCode)}_${slot}_${code}&openExternalBrowser=1${DEMO ? '&demo' : ''}`;
}

/** อ่าน ?ci= จาก URL (แล้วลบออก) หรือที่เก็บไว้ระหว่างล็อกอิน */
export function takeCheckInParam() {
  const params = new URLSearchParams(location.search);
  const raw = params.get('ci');
  if (raw !== null) {
    const q = location.search.slice(1).split('&').filter((x) => x && !/^(ci|openExternalBrowser)=/.test(x)).join('&');
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
    const m = /^([A-Za-z0-9-]{1,20})_(\d{1,13})_([0-9a-f]{6,20})$/.exec(raw);
    if (!m) return { invalid: true };
    const ci = { courseCode: m[1], slot: Number(m[2]), code: m[3], at: Date.now() };
    try { sessionStorage.setItem(CI_KEY, JSON.stringify(ci)); } catch { /* ไม่เป็นไร */ }
    return ci;
  }
  try {
    const ci = JSON.parse(sessionStorage.getItem(CI_KEY) || 'null');
    if (ci && Date.now() - ci.at < CI_MAX_AGE) return ci;
  } catch { /* ไม่เป็นไร */ }
  clearCheckInParam();
  return null;
}

export function clearCheckInParam() {
  try { sessionStorage.removeItem(CI_KEY); } catch { /* ไม่เป็นไร */ }
}

/** เปิดจากในแอปแชท (ล็อกอิน Google ไม่ได้) → บอกให้เปิดในเบราว์เซอร์ */
export function inAppBrowserNotice(root, ci) {
  if (!ci || ci.invalid || !IN_APP.test(navigator.userAgent)) return false;
  const url = checkInUrl(ci.courseCode, ci.slot, ci.code);
  mount(root, h('div', { class: 'signin' }, h('div', { class: 'card form checkin-result' },
    h('div', { class: 'checkin-icon warn' }, '!'),
    h('h1', {}, 'เปิดในเบราว์เซอร์ก่อน'),
    h('p', {}, 'แอปนี้ล็อกอิน Google ไม่ได้ — กดเมนู ⋮ หรือ ··· แล้วเลือก "เปิดในเบราว์เซอร์" (Chrome / Safari)'),
    h('p', { class: 'muted small' }, 'ครั้งหน้าสแกนด้วยแอปกล้องของมือถือโดยตรงจะเร็วกว่า'),
    actionButton('คัดลอกลิงก์', async () => {
      await navigator.clipboard.writeText(url);
      toast('คัดลอกแล้ว — วางในเบราว์เซอร์');
    }, { class: 'primary' }))));
  return true;
}

/* ---------- นักศึกษา: หลังสแกน ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function renderCheckIn(root, ctx, ci, done) {
  const course = ctx.me.courses.find((c) => c.courseCode === ci.courseCode);
  const back = () => { if (course) ctx.selectCourse(course.courseCode); else done(); };
  const card = (...kids) => mount(root, h('div', { class: 'signin' }, h('div', { class: 'card form checkin-result' }, ...kids,
    h('button', { class: 'primary', onclick: back }, 'ไปหน้าหลัก'))));
  if (ci.invalid) {
    return card(h('div', { class: 'checkin-icon bad' }, '✕'), h('h1', {}, 'QR ไม่ถูกต้อง'),
      h('p', {}, 'สแกน QR บนจอของอาจารย์อีกครั้ง'));
  }
  mount(root, loading('กำลังเช็คชื่อ…'));
  let res;
  for (let i = 0; ; i++) {
    try {
      res = await call('checkIn', { courseCode: ci.courseCode, slot: ci.slot, code: ci.code });
      break;
    } catch (e) {
      // หลายคนสแกนพร้อมกัน → ระบบกำลังยุ่ง: รอแล้วลองใหม่ (รหัสยังใช้ได้อีกราว 2 นาที)
      if (i < 4 && /ยุ่ง/.test(e.message)) { await sleep(1500 + Math.random() * 2000); continue; }
      return card(h('div', { class: 'checkin-icon bad' }, '✕'), h('h1', {}, 'เช็คชื่อไม่สำเร็จ'),
        h('p', {}, e.message),
        course ? h('p', { class: 'muted small' }, `${course.courseCode} ${course.title}`) : null);
    }
  }
  const time = new Date(res.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  card(
    h('div', { class: 'checkin-icon ' + (res.mark === 'L' ? 'warn' : 'ok') }, '✓'),
    h('h1', {}, res.already ? 'เช็คชื่อไว้แล้ว' : 'เช็คชื่อแล้ว'),
    h('div', { class: 'checkin-mark ' + res.mark }, MARK_LABEL[res.mark]),
    h('p', {}, `${course ? course.courseCode + ' ' + course.title : ci.courseCode} · สัปดาห์ ${res.week}`),
    h('p', { class: 'muted small' }, `เวลา ${time} น. · ${ctx.me.studentId} ${ctx.me.studentName || ''}`));
}

/* ---------- อาจารย์: เปิดรอบ ---------- */

/** สัปดาห์ถัดจากสัปดาห์ล่าสุดที่เช็คชื่อแล้ว */
function nextWeek(rows) {
  let last = 0;
  rows.forEach((r) => r.marks.forEach((m, i) => { if (m && m !== 'E' && i + 1 > last) last = i + 1; }));
  return Math.min(last + 1, 16);
}

export async function startCheckIn(ctx, rows, onClose) {
  const week = h('select', {}, Array.from({ length: 16 }, (_, i) =>
    h('option', { value: i + 1, selected: i + 1 === nextWeek(rows) }, `สัปดาห์ ${i + 1}`)));
  const late = h('input', { type: 'number', min: 0, max: 240, step: 1, value: 15, style: 'width:6em' });
  const v = await modal('เปิดเช็คชื่อด้วย QR', h('div', { class: 'form' },
    h('label', { class: 'field' }, h('span', {}, 'สัปดาห์'), week),
    h('label', { class: 'field' }, h('span', {}, 'สแกนหลังเปิดกี่นาที = สาย (0 = ไม่นับสาย)'), late),
    h('p', { class: 'muted small' }, 'ขึ้น QR บนจอ นักศึกษาสแกนด้วยกล้องมือถือแล้วล็อกอิน ระบบลงชื่อให้เอง · QR เปลี่ยนทุก 15 วินาที ถ่ายรูปส่งต่อให้เพื่อนใช้ได้ไม่นาน · ปิดรอบแล้วคนที่ยังว่าง = ขาด')),
  [{ label: 'เปิดเช็คชื่อ', run: () => call('openCheckIn', { courseCode: ctx.course.courseCode, week: Number(week.value), lateAfterMin: Number(late.value) }) }]);
  if (v) projector(ctx, v, onClose);
}

export async function resumeCheckIn(ctx, onClose) {
  const v = await call('checkInStatus', { courseCode: ctx.course.courseCode });
  if (!v.open) { toast('รอบเช็คชื่อถูกปิดไปแล้ว'); return onClose(true); }
  projector(ctx, v, onClose);
}

/* ---------- อาจารย์: จอ QR ---------- */

let qrLoading;
function loadQr() {
  qrLoading ??= new Promise((resolve, reject) => {
    if (window.qrcode) return resolve(window.qrcode);
    const s = document.createElement('script');
    s.src = new URL('../vendor/qrcode-generator-1.4.4.js', import.meta.url).href;
    s.integrity = 'sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k';
    s.onload = () => resolve(window.qrcode);
    s.onerror = () => { qrLoading = null; reject(new Error('โหลดตัวสร้าง QR ไม่ได้')); };
    document.head.append(s);
  });
  return qrLoading;
}

function drawQr(qrcode, canvas, text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const quiet = 4;
  const cell = Math.max(4, Math.floor(1000 / (n + quiet * 2)));
  const size = cell * (n + quiet * 2);
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  }
}

async function projector(ctx, view, onClose) {
  const code = ctx.course.courseCode;
  const qrcode = await loadQr();
  let v = view;
  let offset = Date.parse(v.serverNow) - Date.now();
  let shownSlot = null;
  let showNames = true;
  let lastError = '';
  let refreshing = null;
  let wakeLock = null;

  const canvas = h('canvas', { class: 'qr', role: 'img', 'aria-label': 'QR สำหรับเช็คชื่อ' });
  const bar = h('div', { class: 'qr-bar' }, h('div'));
  const stats = h('div', { class: 'proj-stats' });
  const list = h('ol', { class: 'proj-list' });
  const warn = h('div', { class: 'small danger', role: 'status' });
  const qrBox = h('div', { class: 'qr-box' }, canvas, bar);

  const drawStats = () => {
    const late = v.scans.filter((s) => s.mark === 'L').length;
    const opened = new Date(v.openedAt);
    const lateAt = v.lateAfterMin ? new Date(opened.getTime() + v.lateAfterMin * 60000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : null;
    mount(stats,
      h('div', { class: 'proj-count' }, h('strong', {}, String(v.scans.length)), ` / ${v.roster} คน`),
      h('div', { class: 'muted' }, late ? `สาย ${late} คน` : 'ยังไม่มีคนสาย'),
      h('div', { class: 'muted small' }, lateAt ? `สแกนหลัง ${lateAt} น. = สาย` : 'ไม่นับสาย'));
    mount(list, showNames ? v.scans.slice(0, 12).map((s) =>
      h('li', {}, h('span', { class: 'mark ' + s.mark }, s.mark), ' ', s.name || s.studentId)) : null);
    mount(warn, v.expired ? 'รอบนี้เปิดเกิน 4 ชั่วโมงแล้ว สแกนไม่ได้ — กด "ปิดเช็คชื่อ"' : lastError);
    qrBox.hidden = !!v.expired;
  };

  const refresh = () => {
    refreshing ??= call('checkInStatus', { courseCode: code }).then((nv) => {
      if (!nv.open) { toast('รอบเช็คชื่อถูกปิดแล้ว'); finish(true); return; }
      v = nv;
      offset = Date.parse(v.serverNow) - Date.now();
      lastError = '';
      drawStats();
    }).catch((e) => { lastError = 'เชื่อมต่อไม่ได้: ' + e.message + ' (QR ยังใช้ได้อีกครู่)'; drawStats(); })
      .finally(() => { refreshing = null; });
    return refreshing;
  };

  const tick = () => {
    const now = Date.now() + offset;
    const slot = Math.floor(now / v.slotMs);
    bar.firstChild.style.width = `${100 - ((now % v.slotMs) / v.slotMs) * 100}%`;
    if (slot === shownSlot) return;
    const c = v.codes.find((x) => x.slot === slot);
    if (!c) { refresh(); return; }
    shownSlot = slot;
    drawQr(qrcode, canvas, checkInUrl(code, c.slot, c.code));
    // ใกล้หมดรหัสที่มีอยู่ → ขอชุดใหม่
    if (v.codes[v.codes.length - 1].slot - slot < 3) refresh();
  };

  const timers = [setInterval(tick, 250), setInterval(refresh, 8000)];
  const finish = (closed) => {
    timers.forEach(clearInterval);
    wakeLock?.release().catch(() => {});
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    overlay.remove();
    onClose(closed);
  };

  const closeRound = async () => {
    const absent = h('input', { type: 'checkbox', checked: true });
    const res = await modal('ปิดเช็คชื่อ', h('div', { class: 'form' },
      h('p', {}, `สัปดาห์ ${v.week}: เช็คชื่อแล้ว ${v.scans.length} จาก ${v.roster} คน`),
      h('label', { class: 'check' }, absent, `คนที่ยังว่างในสัปดาห์ ${v.week} = ขาด`),
      h('p', { class: 'muted small' }, 'คนที่มีใบลาอนุมัติแล้ว หรือที่อาจารย์ลงไว้เองแล้ว ไม่ถูกเปลี่ยน · แก้ทีหลังได้ในตาราง')),
    [{ label: 'ปิดเช็คชื่อ', class: 'danger', run: () => call('closeCheckIn', { courseCode: code, markAbsent: absent.checked }) }]);
    if (!res) return;
    toast(`ปิดแล้ว — เช็คชื่อ ${res.checkedIn} คน${absent.checked ? ` · ขาด ${res.absent} คน` : ''}`);
    finish(true);
  };

  const overlay = h('div', { class: 'projector', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'เช็คชื่อด้วย QR' },
    h('div', { class: 'proj-head' },
      h('div', {}, h('div', { class: 'proj-title' }, `${ctx.course.courseCode} ${ctx.course.title}`),
        h('div', { class: 'muted' }, `เช็คชื่อ สัปดาห์ ${v.week}`)),
      h('span', { class: 'spacer' }),
      h('button', { class: 'sm', onclick: () => overlay.requestFullscreen?.().catch(() => {}) }, 'เต็มจอ'),
      h('button', { class: 'sm', onclick: (e) => { showNames = !showNames; e.target.textContent = showNames ? 'ซ่อนรายชื่อ' : 'แสดงรายชื่อ'; drawStats(); } }, 'ซ่อนรายชื่อ'),
      h('button', { class: 'sm', title: 'กลับไปที่ตาราง รอบเช็คชื่อยังเปิดอยู่', onclick: () => finish(false) }, 'ย่อ'),
      h('button', { class: 'sm danger', onclick: closeRound }, 'ปิดเช็คชื่อ')),
    h('div', { class: 'proj-body' },
      h('div', { class: 'proj-qr' }, qrBox,
        h('p', { class: 'proj-hint' }, 'สแกนด้วยกล้องมือถือ แล้วล็อกอินด้วยบัญชีมหาวิทยาลัย'),
        warn),
      h('div', { class: 'proj-side' }, stats, list)));
  document.body.append(overlay);
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* จอดับเองได้ ไม่เป็นไร */ }
  drawStats();
  tick();
}

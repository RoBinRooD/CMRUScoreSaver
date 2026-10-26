// ตัวช่วยสร้าง DOM และองค์ประกอบ UI เล็กๆ
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  append(el, kids);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  return el;
}

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function mount(target, ...kids) {
  target.replaceChildren();
  append(target, kids);
}

export function toast(msg, kind = '') {
  const t = h('div', { class: 'toast ' + kind, role: kind === 'bad' ? 'alert' : 'status' }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 7000 : 3500);
}

export function loading(text = 'กำลังโหลด…') {
  return h('p', { class: 'muted center pad' }, text);
}

export function errorBox(err) {
  return h('div', { class: 'banner' }, 'เกิดข้อผิดพลาด: ' + (err?.message || err));
}

/** ปุ่มที่ disable ตัวเองระหว่างทำงาน และแสดง error เป็น toast */
export function actionButton(label, fn, attrs = {}) {
  const b = h('button', { type: 'button', ...attrs }, label);
  b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await fn(b);
    } catch (e) {
      toast(e.message || String(e), 'bad');
    } finally {
      if (b.isConnected) b.disabled = false;
    }
  });
  return b;
}

export function modal(title, body, actions = []) {
  return new Promise((resolve) => {
    const close = (v) => { back.remove(); resolve(v); };
    const back = h('div', { class: 'modal-back', onclick: (e) => e.target === back && close(null) },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', {}, title),
        body,
        h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:1rem' },
          h('button', { type: 'button', onclick: () => close(null) }, 'ยกเลิก'),
          actions.map((a) => actionButton(a.label, async () => {
            const v = await a.run();
            if (v !== false) close(v ?? true);
          }, { class: a.class || 'primary' })))));
    document.body.append(back);
    back.querySelector('input, textarea, select')?.focus();
  });
}

export function confirmBox(text, label = 'ยืนยัน', cls = 'primary') {
  return modal('ยืนยัน', h('p', {}, text), [{ label, class: cls, run: () => true }]);
}

const dateFmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
export function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d) ? '-' : dateFmt.format(d);
}

export function fmtSize(n) {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(i ? 1 : 0) + ' ' + u[i];
}

export function fmtNum(n, digits = 2) {
  return n === null || n === undefined || n === '' ? '-' : String(Math.round(n * 10 ** digits) / 10 ** digits);
}

/** ISO → ค่าสำหรับ <input type="datetime-local"> ตามเวลาเครื่อง */
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function driveUrl(fileId) {
  return 'https://drive.google.com/file/d/' + encodeURIComponent(fileId) + '/view';
}

export function tabs(list, current, onPick) {
  return h('div', { class: 'tabs', role: 'tablist' },
    list.map(([key, label]) => h('button', {
      type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(key === current), onclick: () => onPick(key)
    }, label)));
}

export const MARK_LABEL = { P: 'มา', L: 'สาย', A: 'ขาด', E: 'ลา', '': '·' };

const dayFmt = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' });
export function fmtDay(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d) ? '-' : dayFmt.format(d);
}

/** "อีก 3 วัน" / "เลยมา 2 วัน" / "วันนี้" */
export function fmtLeft(iso, now = Date.now()) {
  if (!iso) return 'ไม่มีกำหนด';
  const ms = new Date(iso) - now;
  const days = Math.round(Math.abs(ms) / 86400000);
  if (ms >= 0 && ms < 86400000) return 'ภายใน 24 ชม.';
  if (days === 0) return 'วันนี้';
  return ms > 0 ? `อีก ${days} วัน` : `เลยมา ${days} วัน`;
}

/** ข้อความหลายบรรทัด + ทำลิงก์ https:// ให้คลิกได้ (ไม่ใช้ innerHTML) */
export function richText(text, cls = 'desc') {
  const el = h('div', { class: cls, style: 'white-space:pre-wrap' });
  String(text || '').split(/(https:\/\/[^\s]+)/g).forEach((part, i) => {
    el.append(i % 2 ? h('a', { href: part, target: '_blank', rel: 'noopener' }, part) : document.createTextNode(part));
  });
  return el;
}

/** tooltip ที่ตามเมาส์ / โฟกัสคีย์บอร์ด — content เป็นฟังก์ชันที่คืน Node หรือข้อความ */
let tipEl = null;
export function tip(el, content) {
  const show = (x, y) => {
    tipEl ??= document.body.appendChild(h('div', { class: 'tooltip', role: 'tooltip' }));
    mount(tipEl, content());
    tipEl.hidden = false;
    const r = tipEl.getBoundingClientRect();
    tipEl.style.left = Math.min(Math.max(8, x + 12), window.innerWidth - r.width - 8) + 'px';
    tipEl.style.top = (y + 16 + r.height > window.innerHeight ? y - r.height - 12 : y + 16) + 'px';
  };
  const hide = () => { if (tipEl) tipEl.hidden = true; };
  el.addEventListener('mousemove', (e) => show(e.clientX, e.clientY));
  el.addEventListener('mouseleave', hide);
  el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); show(r.left, r.bottom - 8); });
  el.addEventListener('blur', hide);
  return el;
}

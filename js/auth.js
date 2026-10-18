// การเข้าสู่ระบบด้วย Google (Google Identity Services) — เก็บ ID token ไว้ในเครื่องจนกว่าจะหมดอายุ (~1 ชม.)
import { h, mount } from './ui.js';

const KEY = 'cmruscoresaver_token';
export const DEMO = new URLSearchParams(location.search).has('demo');

function store() {
  try { return window.localStorage; } catch { return null; }
}

function expOf(token) {
  if (token.startsWith('demo:')) return Infinity;
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64)).exp * 1000;
  } catch {
    return 0;
  }
}

export function getToken() {
  const t = store()?.getItem(KEY);
  if (!t || expOf(t) < Date.now() + 60_000) return null;
  return t;
}

export function setToken(t) {
  try { store()?.setItem(KEY, t); } catch { /* ไม่เป็นไร */ }
}

export function signOut() {
  try { store()?.removeItem(KEY); } catch { /* ไม่เป็นไร */ }
  if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
}

let gsiLoading;
function loadGsi() {
  gsiLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('โหลด Google Sign-In ไม่ได้'));
    document.head.append(s);
  });
  return gsiLoading;
}

/** แสดงหน้าล็อกอินใน container แล้วรอจนได้ token */
export function signIn(container, message) {
  return new Promise(async (resolve) => {
    const done = (t) => { setToken(t); resolve(t); };
    const btn = h('div', { id: 'gsi-button' });
    const card = h('div', { class: 'card' },
      h('h1', {}, 'เข้าสู่ระบบ'),
      h('p', { class: 'muted' }, message || 'ใช้บัญชี Google ของมหาวิทยาลัยเพื่อส่งงานและดูคะแนน'),
      btn);
    mount(container, h('div', { class: 'signin' }, card));

    if (DEMO) {
      mount(btn);
      card.append(h('div', { class: 'demo-roles' },
        h('p', { class: 'small muted' }, 'โหมดทดลอง — เลือกบทบาท (ข้อมูลอยู่ในเบราว์เซอร์นี้เท่านั้น)'),
        h('button', { class: 'primary', onclick: () => done('demo:teacher@demo.ac.th') }, 'อาจารย์'),
        h('button', { onclick: () => done('demo:69000101@demo.ac.th') }, 'นักศึกษา 69000101 (ผูกบัญชีอัตโนมัติ)'),
        h('button', { onclick: () => done('demo:68000102@demo.ac.th') }, 'นักศึกษา 68000102 (วิชา 3D)'),
        h('button', { onclick: () => done('demo:newstudent@demo.ac.th') }, 'นักศึกษาที่ยังไม่ยืนยันรหัส')));
      return;
    }

    const cfg = window.APP_CONFIG || {};
    if (!cfg.googleClientId || !cfg.apiUrl) {
      mount(btn, h('div', { class: 'banner' }, 'ยังไม่ได้ตั้งค่า apiUrl / googleClientId ใน js/config.js (ดู SETUP.md) — ',
        h('a', { href: '?demo' }, 'ลองโหมดทดลอง')));
      return;
    }
    try {
      await loadGsi();
      google.accounts.id.initialize({
        client_id: cfg.googleClientId,
        callback: (r) => done(r.credential),
        auto_select: true,
        use_fedcm_for_prompt: true
      });
      google.accounts.id.renderButton(btn, { theme: 'outline', size: 'large', shape: 'pill', locale: 'th', text: 'signin_with' });
      google.accounts.id.prompt();
    } catch (e) {
      mount(btn, h('div', { class: 'banner' }, e.message));
    }
  });
}

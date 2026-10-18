import { h, mount, loading, errorBox } from './ui.js';
import { DEMO, getToken, signIn, signOut } from './auth.js';
import { call, onReauth, resetDemo } from './api.js';
import { renderStudent } from './views/student.js';
import { renderTeacher } from './views/teacher.js';

const app = document.getElementById('app');
const topRight = document.getElementById('topbar-right');

const state = {
  me: null,
  course: null,
  tab: null
};

// ถ้า token หมดอายุระหว่างใช้งาน ให้ล็อกอินใหม่ในหน้าต่างซ้อน แล้วทำคำสั่งเดิมต่อ
let reauthPromise = null;
onReauth((message) => {
  reauthPromise ??= (async () => {
    const back = h('div', { class: 'modal-back' });
    const box = h('div', { class: 'modal' });
    back.append(box);
    document.body.append(back);
    const t = await signIn(box, message || 'กรุณาเข้าสู่ระบบอีกครั้ง');
    back.remove();
    reauthPromise = null;
    return t;
  })();
  return reauthPromise;
});

function rememberCourse(code) {
  try { localStorage.setItem('cmruscoresaver_course', code); } catch { /* ไม่เป็นไร */ }
}

function savedCourse() {
  try { return localStorage.getItem('cmruscoresaver_course'); } catch { return null; }
}

function renderTop() {
  const me = state.me;
  if (!me) return mount(topRight);
  const courseSelect = me.courses.length
    ? h('select', {
      'aria-label': 'เลือกวิชา',
      onchange: (e) => { state.course = e.target.value; rememberCourse(state.course); render(); }
    }, me.courses.map((c) => h('option', { value: c.courseCode, selected: c.courseCode === state.course },
      `${c.courseCode} ${c.title}`.slice(0, 60))))
    : null;
  mount(topRight,
    courseSelect,
    DEMO ? h('span', { class: 'chip warn' }, 'โหมดทดลอง') : null,
    h('span', { class: 'who', title: me.email }, me.role === 'teacher' ? 'อาจารย์ · ' + me.email : (me.studentId || '') + ' ' + (me.studentName || me.email)),
    DEMO ? h('button', { class: 'sm ghost', onclick: () => { resetDemo(); location.reload(); }, title: 'ล้างข้อมูลทดลอง' }, 'รีเซ็ต') : null,
    h('button', { class: 'sm', onclick: () => { signOut(); location.reload(); } }, 'ออกจากระบบ'));
}

export async function refreshMe() {
  state.me = await call('me');
  const codes = state.me.courses.map((c) => c.courseCode);
  if (!codes.includes(state.course)) state.course = codes.includes(savedCourse()) ? savedCourse() : codes[0] || null;
  renderTop();
  return state.me;
}

function ctx() {
  return {
    me: state.me,
    course: state.me.courses.find((c) => c.courseCode === state.course) || null,
    tab: state.tab,
    setTab: (t) => { state.tab = t; history.replaceState(null, '', '#' + t); render(); },
    refreshMe: async () => { await refreshMe(); render(); },
    selectCourse: (code) => { state.course = code; rememberCourse(code); renderTop(); render(); }
  };
}

function render() {
  const c = ctx();
  if (state.me.role === 'teacher') renderTeacher(app, c);
  else renderStudent(app, c);
}

async function start() {
  state.tab = location.hash.slice(1) || null;
  if (!getToken()) await signIn(app);
  mount(app, loading());
  try {
    await refreshMe();
    render();
  } catch (e) {
    mount(app, errorBox(e), h('p', { class: 'center' }, h('button', { onclick: () => { signOut(); location.reload(); } }, 'เข้าสู่ระบบด้วยบัญชีอื่น')));
  }
}

start();

// Timeline (Gantt) — งานในวิชา จากวันที่สร้างงานถึงกำหนดส่ง · นักศึกษาเห็นสถานะของตัวเอง + งานย่อยในบอร์ดกลุ่ม
import { h, mount, loading, errorBox, fmtDate, fmtDay, fmtNum, tip } from '../ui.js';
import { call } from '../api.js';

const DAY = 86400000;
const STATUS = {
  graded: ['ok', 'ตรวจแล้ว'],
  submitted: ['info', 'ส่งแล้ว'],
  late: ['warn', 'ส่งช้า'],
  missing: ['bad', 'ไม่ได้ส่ง'],
  open: ['open', 'ยังไม่ส่ง']
};
const TASK = { todo: ['todo', 'ต้องทำ'], doing: ['info', 'กำลังทำ'], done: ['ok', 'เสร็จ'] };
const monthFmt = new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' });

let view = 'chart'; // จำไว้ระหว่างสลับแท็บ

export async function renderTimeline(body, ctx) {
  mount(body, loading());
  let data;
  try {
    data = await call('timeline', { courseCode: ctx.course.courseCode });
  } catch (e) {
    return mount(body, errorBox(e));
  }
  const teacher = ctx.me.role === 'teacher';
  const holder = h('div');
  const toggle = (k, label) => h('button', {
    class: 'tab', role: 'tab', 'aria-selected': String(view === k), onclick: () => { view = k; draw(); }
  }, label);
  const bar = h('div', { class: 'row' });
  const draw = () => {
    mount(bar, legend(teacher, data.tasks.length > 0), h('span', { class: 'spacer' }),
      h('div', { class: 'tabs', role: 'tablist', style: 'margin:0;border:0' }, toggle('chart', 'ไทม์ไลน์'), toggle('list', 'รายการ')));
    mount(holder, view === 'chart' ? chart(data, teacher) : list(data, teacher));
    if (view === 'chart') holder.querySelector('.gantt-today')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  };
  if (!data.items.length && !data.tasks.length) return mount(body, h('p', { class: 'muted center pad' }, 'ยังไม่มีงานในวิชานี้'));
  mount(body, h('div', { class: 'stack' }, bar, holder,
    h('p', { class: 'muted small' }, 'แถบเริ่มที่วันที่อาจารย์สร้างงาน และสิ้นสุดที่กำหนดส่ง' + (teacher ? ' · สีเข้ม = สัดส่วนที่ส่งแล้ว' : ' · งานย่อยมาจากบอร์ดกลุ่ม (เฉพาะที่มีวันกำหนด)'))));
  draw();
}

function legend(teacher, hasTasks) {
  const item = (cls, label) => h('span', {}, h('span', { class: 'swatch g-' + cls }), ' ', label);
  if (teacher) return h('div', { class: 'legend' }, item('progress', 'ส่งแล้ว'), item('track', 'ยังไม่ส่ง'), item('hidden', 'ซ่อนอยู่'));
  return h('div', { class: 'legend' }, Object.values(STATUS).map(([c, l]) => item(c, l)),
    hasTasks ? [h('span', { class: 'muted' }, '· งานย่อย:'), Object.values(TASK).map(([c, l]) => item(c, l))] : null);
}

function statusOf(it, teacher) {
  if (it.kind === 'task') return TASK[it.status] || TASK.todo;
  if (teacher) return it.published ? ['progress', ''] : ['hidden', 'ซ่อนอยู่'];
  return STATUS[it.status] || STATUS.open;
}

function rowsOf(data, teacher) {
  const rows = data.items.map((it) => ({ ...it, section: 'งาน' }));
  data.tasks
    .slice()
    .sort((a, b) => (a.groupName + a.end < b.groupName + b.end ? -1 : 1))
    .forEach((t) => rows.push({ ...t, section: `บอร์ดกลุ่ม ${t.groupName} · ${t.assignmentTitle}` }));
  return rows;
}

function detail(it, teacher) {
  const [, label] = statusOf(it, teacher);
  return h('div', {},
    h('strong', {}, it.title),
    h('div', {}, `${fmtDay(it.start)} → ${it.end ? fmtDate(it.end) : 'ไม่มีกำหนดส่ง'}`),
    it.kind === 'task' ? h('div', {}, `${label}${it.mine ? ' · ฉันรับผิดชอบ' : ''}`) : null,
    it.kind === 'assignment' && teacher && it.counts ? h('div', {}, `ส่งแล้ว ${it.counts.submitted}/${it.counts.roster} · ตรวจแล้ว ${it.counts.graded}`) : null,
    it.kind === 'assignment' && !teacher ? h('div', {}, label) : null,
    it.groupMax ? h('div', {}, 'งานกลุ่ม') : null);
}

function chart(data, teacher) {
  const now = new Date(data.now).getTime();
  const rows = rowsOf(data, teacher);
  const t = (iso) => new Date(iso).getTime();
  const starts = rows.map((r) => t(r.start)).filter(isFinite);
  const ends = rows.map((r) => (r.end ? t(r.end) : NaN)).filter(isFinite);
  const day0 = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  let from = day0(Math.min(now, ...starts) - 2 * DAY);
  let to = day0(Math.max(now, ...ends, ...starts) + 4 * DAY);
  if ((to - from) / DAY < 21) to = from + 21 * DAY;
  const days = Math.round((to - from) / DAY);
  const ppd = days <= 45 ? 28 : days <= 120 ? 14 : 8;
  const width = days * ppd;
  const x = (ms) => ((ms - from) / DAY) * ppd;

  // หัวตาราง: เดือน + วันที่ (หรือเฉพาะวันจันทร์เมื่อแคบ)
  const months = [];
  const ticks = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from + i * DAY);
    if (i === 0 || d.getDate() === 1) months.push(h('div', { class: 'gantt-month', style: `left:${i * ppd}px` }, monthFmt.format(d)));
    const monday = d.getDay() === 1;
    if (ppd >= 20 || monday) ticks.push(h('div', { class: 'gantt-tick' + (monday ? ' week' : ''), style: `left:${i * ppd}px;width:${ppd >= 20 ? ppd : ppd * 7}px` }, String(d.getDate())));
  }
  const grid = [];
  for (let i = 0; i < days; i++) {
    if (new Date(from + i * DAY).getDay() === 1) grid.push(h('div', { class: 'gantt-grid', style: `left:${i * ppd}px` }));
  }

  let lastSection = null;
  const body = [];
  rows.forEach((r) => {
    if (r.section !== lastSection) {
      lastSection = r.section;
      body.push(h('div', { class: 'gantt-row gantt-section' }, h('div', { class: 'gantt-label' }, r.section), h('div', { class: 'gantt-track', style: `width:${width}px` })));
    }
    const [cls, label] = statusOf(r, teacher);
    const s = Math.max(from, t(r.start));
    const e = r.end ? Math.max(t(r.end), s + DAY / 2) : to;
    const left = x(s);
    const w = Math.max(6, x(e) - left);
    const barEl = h('div', {
      class: `gantt-bar g-${cls}${r.end ? '' : ' open-ended'}`, tabindex: 0,
      style: `left:${left}px;width:${w}px`, 'aria-label': `${r.title} ${label}`
    });
    if (teacher && r.kind === 'assignment' && r.counts && r.counts.roster) {
      barEl.append(h('div', { class: 'gantt-fill', style: `width:${Math.min(100, (r.counts.submitted / r.counts.roster) * 100)}%` }));
    }
    tip(barEl, () => detail(r, teacher));
    const tag = teacher
      ? (r.counts ? `${r.counts.submitted}/${r.counts.roster}` : '')
      : r.kind === 'task' ? label + (r.mine ? ' · ฉัน' : '') : label;
    body.push(h('div', { class: 'gantt-row' },
      h('div', { class: 'gantt-label', title: r.title },
        h('span', { class: 'gantt-title' }, r.title),
        h('span', { class: 'muted small nowrap' }, tag, r.groupMax ? ' · กลุ่ม' : '', r.published === false ? ' · ซ่อน' : '')),
      h('div', { class: 'gantt-track', style: `width:${width}px` }, barEl)));
  });

  return h('div', { class: 'gantt table-wrap' },
    h('div', { class: 'gantt-inner', style: `--w:${width}px` },
      h('div', { class: 'gantt-row gantt-head' },
        h('div', { class: 'gantt-label' }, ''),
        h('div', { class: 'gantt-track', style: `width:${width}px` }, months, ticks)),
      h('div', { class: 'gantt-body' },
        h('div', { class: 'gantt-layer', style: `width:${width}px` }, grid,
          now >= from && now <= to ? h('div', { class: 'gantt-today', style: `left:${x(now)}px` }, h('span', {}, 'วันนี้')) : null),
        body)));
}

function list(data, teacher) {
  const rows = rowsOf(data, teacher);
  return h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'งาน'), h('th', {}, 'เริ่ม'), h('th', {}, 'กำหนดส่ง'), h('th', {}, teacher ? 'ส่งแล้ว' : 'สถานะ'))),
    h('tbody', {}, rows.map((r) => {
      const [cls, label] = statusOf(r, teacher);
      return h('tr', {},
        h('td', {}, r.title, h('div', { class: 'muted small' }, r.section)),
        h('td', { class: 'nowrap' }, fmtDay(r.start)),
        h('td', { class: 'nowrap' }, r.end ? fmtDate(r.end) : 'ไม่มีกำหนด'),
        h('td', { class: 'nowrap' }, teacher && r.counts
          ? `${r.counts.submitted}/${r.counts.roster} (${fmtNum(r.counts.roster ? (r.counts.submitted / r.counts.roster) * 100 : 0, 0)}%)${r.published ? '' : ' · ซ่อน'}`
          : h('span', {}, h('span', { class: 'swatch g-' + cls }), ' ', label, r.mine ? ' · ฉัน' : '')));
    }))));
}

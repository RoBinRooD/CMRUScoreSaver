// ภาพรวม (Dashboard) — อาจารย์และนักศึกษา
import { h, mount, loading, errorBox, fmtDay, fmtDate, fmtLeft, fmtNum, tip, MARK_LABEL } from '../ui.js';
import { call } from '../api.js';

const TASK_LABEL = { todo: 'ต้องทำ', doing: 'กำลังทำ', done: 'เสร็จ' };

function tile(label, value, sub, extra) {
  return h('div', { class: 'stat' },
    h('div', { class: 'label' }, label),
    h('div', { class: 'value' }, value),
    sub ? h('div', { class: 'muted small' }, sub) : null,
    extra || null);
}

/** แถบความคืบหน้า 1 ค่า — ราง = สีอ่อนของสีเดียวกัน */
function meter(value, max, label) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return h('div', { class: 'meter', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': value, 'aria-label': label },
    h('div', { style: `width:${pct}%` }));
}

function section(title, action, ...kids) {
  return h('section', { class: 'card stack' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, title), h('span', { class: 'spacer' }), action), ...kids);
}

/* ---------- นักศึกษา ---------- */

export async function studentDashboard(body, ctx) {
  mount(body, loading());
  let d;
  try {
    d = await call('studentDashboard', { courseCode: ctx.course.courseCode });
  } catch (e) {
    return mount(body, errorBox(e));
  }
  const p = d.parts;
  const go = (tab) => h('button', { class: 'sm ghost', onclick: () => ctx.setTab(tab) }, 'ดูทั้งหมด →');
  const att = d.attendance;
  const ab = att.absence;

  mount(body, h('div', { class: 'stack' },
    ab.fail ? h('div', { class: 'banner bad' }, `⚠️ ขาดเรียน ${absenceText(ab)} เกิน ${ab.failAbove} ครั้ง — ตามเกณฑ์ของวิชาจะได้เกรด F กรุณาติดต่ออาจารย์`)
      : ab.warn ? h('div', { class: 'banner' }, `ขาดเรียนแล้ว ${absenceText(ab)} — ขาดเกิน ${ab.failAbove} ครั้งจะได้เกรด F (สาย ${ab.latePerAbsence} ครั้ง = ขาด 1 · ลาไม่นับ)`) : null,
    d.missing.length ? h('div', { class: 'banner bad' }, '⚠️ ยังไม่ได้ส่ง ', d.missing.length, ' งานที่เลยกำหนด: ',
      d.missing.map((m) => m.title + (m.allowLate ? ' (ยังส่งได้)' : '')).join(', ')) : null,
    h('div', { class: 'stats' },
      tile('ส่งงานแล้ว', `${d.counts.submitted}/${d.counts.total}`, `ตรวจแล้ว ${d.counts.graded} งาน`, meter(d.counts.submitted, d.counts.total, 'ส่งงานแล้ว')),
      tile('คะแนนงาน', p.assignments.pct === null ? '-' : `${fmtNum(p.assignments.pct, 0)}%`, p.assignments.counted ? `จาก ${p.assignments.counted} งานที่นับแล้ว` : 'ยังไม่มีงานที่นับคะแนน'),
      tile('การเข้าเรียน', p.attendance.pct === null ? '-' : `${fmtNum(p.attendance.pct, 0)}%`, att.held ? `เช็คชื่อแล้ว ${att.held} สัปดาห์` : 'ยังไม่มีการเช็คชื่อ'),
      tile('เกรด', d.grade || '-', d.grade ? `รวม ${fmtNum(d.total)} คะแนน` : 'อาจารย์ยังไม่ประกาศ')),

    section('ต้องส่งเร็วๆ นี้', go('work'),
      d.todo.length ? h('ul', { class: 'list' }, d.todo.map((a) => h('li', {},
        h('div', { class: 'grow' },
          h('div', {}, a.title, a.groupMax ? h('span', { class: 'chip accent', style: 'margin-left:.4rem' }, 'งานกลุ่ม') : null),
          h('div', { class: 'muted small' }, 'กำหนดส่ง ' + fmtDate(a.dueAt))),
        h('span', { class: 'chip ' + (a.status === 'missing' ? 'bad' : new Date(a.dueAt) - Date.now() < 3 * 86400000 ? 'warn' : 'info') },
          a.status === 'missing' ? 'เลยกำหนด · ยังส่งได้' : fmtLeft(a.dueAt)))))
        : h('p', { class: 'muted' }, 'ไม่มีงานค้าง 🎉')),

    d.tasks.length ? section('งานย่อยของฉันในบอร์ดกลุ่ม', go('board'),
      h('ul', { class: 'list' }, d.tasks.map((t) => h('li', {},
        h('div', { class: 'grow' },
          h('div', {}, t.title, t.mine ? null : h('span', { class: 'muted small' }, ' · ยังไม่มีคนรับ')),
          h('div', { class: 'muted small' }, `กลุ่ม ${t.groupName} · ${t.assignmentTitle}`)),
        h('span', { class: 'chip' }, TASK_LABEL[t.status]),
        h('span', { class: 'muted small nowrap' }, t.dueAt ? fmtLeft(t.dueAt) : ''))))) : null,

    d.feedback.length ? section('ความเห็นล่าสุดจากอาจารย์', go('grades'),
      d.feedback.map((f) => h('div', { class: 'feedback' },
        h('div', { class: 'row' }, h('strong', {}, f.title), h('span', { class: 'spacer' }), h('span', { class: 'chip ok' }, `${fmtNum(f.score)}/${f.maxScore}`)),
        f.feedback ? h('div', { class: 'small' }, f.feedback) : h('div', { class: 'muted small' }, 'ไม่มีความเห็น')))) : null,

    att.held ? section('การเข้าเรียน', go('grades'),
      h('div', { class: 'legend' }, ['P', 'L', 'E', 'A'].map((k) => h('span', {}, h('span', { class: 'mark btn ' + k }, k), ` ${MARK_LABEL[k]} ${att.tally[k]} ครั้ง`))),
      h('div', { class: 'row' }, h('span', {}, 'ขาดเรียน (นับ): ', h('strong', {}, absenceText(ab)), ` จากที่ขาดได้ ${ab.failAbove} ครั้ง`), absenceChip(ab)),
      severityMeter(meter(Math.min(ab.effective, ab.failAbove + 1), ab.failAbove + 1, 'ขาดเรียนที่นับ'), ab),
      h('p', { class: 'muted small' }, `สาย ${ab.latePerAbsence} ครั้ง = ขาด 1 ครั้ง · ลาไม่นับ · ขาดเกิน ${ab.failAbove} ครั้ง = เกรด F`)) : null));
}

/* ---------- อาจารย์ ---------- */

export async function teacherDashboard(body, ctx) {
  mount(body, loading());
  let d;
  try {
    d = await call('teacherDashboard', { courseCode: ctx.course.courseCode });
  } catch (e) {
    return mount(body, errorBox(e));
  }
  const c = d.counts;
  mount(body, h('div', { class: 'stack' },
    c.pendingLeaves ? h('div', { class: 'banner' }, `มีใบลารออนุมัติ ${c.pendingLeaves} ใบ `,
      h('button', { class: 'sm', onclick: () => ctx.setTab('leaves') }, 'ไปที่ใบลา →')) : null,
    h('div', { class: 'stats' },
      tile('นักศึกษาสมัครแล้ว', `${c.registered}/${c.students}`, c.students - c.registered ? `ยังไม่สมัคร ${c.students - c.registered} คน` : 'ครบทุกคน', meter(c.registered, c.students, 'นักศึกษาสมัครแล้ว')),
      tile('งานที่เปิด', String(c.assignments), c.hidden ? `ซ่อนอยู่ ${c.hidden} งาน` : null),
      h('button', { class: 'stat stat-link', onclick: () => ctx.setTab('grading') },
        h('div', { class: 'label' }, 'รอตรวจ'), h('div', { class: 'value' }, String(c.toGrade)), h('div', { class: 'muted small' }, c.toGrade ? 'ไปที่ตรวจงาน →' : 'ตรวจครบแล้ว')),
      tile('เข้าเรียนเฉลี่ย', d.attendanceAvg === null ? '-' : `${fmtNum(d.attendanceAvg, 0)}%`, c.heldWeeks ? `เช็คชื่อแล้ว ${c.heldWeeks}/16 สัปดาห์` : 'ยังไม่มีการเช็คชื่อ')),
    section('ความคืบหน้าแต่ละงาน', h('button', { class: 'sm ghost', onclick: () => ctx.setTab('assignments') }, 'จัดการงาน →'),
      d.assignments.length ? [progressLegend(), d.assignments.map((a) => progressRow(a, ctx))] : h('p', { class: 'muted' }, 'ยังไม่มีงานที่เปิดให้นักศึกษาเห็น')),
    section('นักศึกษาที่ควรติดตาม', null,
      d.atRisk.failedByAbsence ? h('div', { class: 'banner bad' }, `⚠️ ขาดเรียนเกิน ${d.atRisk.rules.failAbove} ครั้ง ${d.atRisk.failedByAbsence} คน — เกรด F`) : null,
      h('p', { class: 'muted small' }, `ขาดเรียน (นับ) ตั้งแต่ ${d.atRisk.rules.warnAt} ครั้ง · ขาดส่งตั้งแต่ ${d.atRisk.missingLimit} งาน · หรือเข้าเรียนต่ำกว่า ${d.atRisk.attendanceLimit}%` +
        ` — ขาดเกิน ${d.atRisk.rules.failAbove} = F · สาย ${d.atRisk.rules.latePerAbsence} = ขาด 1 · ลาไม่นับ` + (d.atRisk.total > d.atRisk.list.length ? ` · แสดง ${d.atRisk.list.length} จาก ${d.atRisk.total} คน` : '')),
      d.atRisk.list.length ? h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'รหัส'), h('th', {}, 'ชื่อ'), h('th', { class: 'num' }, 'ขาดเรียน (นับ)'), h('th', { class: 'num' }, 'ขาดส่ง'), h('th', { class: 'num' }, 'เข้าเรียน'), h('th', {}, 'สถานะ'))),
        h('tbody', {}, d.atRisk.list.map((s) => h('tr', {},
          h('td', { class: 'nowrap' }, s.studentId), h('td', {}, s.name),
          h('td', { class: 'num nowrap' }, absenceText(s.absence)),
          h('td', { class: 'num' }, s.missing ? `${s.missing} งาน` : '-'),
          h('td', { class: 'num' }, s.attendance === null ? '-' : `${fmtNum(s.attendance, 0)}%`),
          h('td', {}, absenceChip(s.absence), s.registered ? null : h('span', { class: 'chip' }, 'ยังไม่สมัคร')))))))
        : h('p', { class: 'muted' }, 'ไม่มีนักศึกษาที่น่าเป็นห่วงตอนนี้')),
    section('การกระจายเกรด (คาดการณ์จากคะแนนตอนนี้)', h('button', { class: 'sm ghost', onclick: () => ctx.setTab('gradebook') }, 'สมุดคะแนน →'),
      h('p', { class: 'muted small' }, 'คำนวณจากคะแนนที่มีอยู่ — ส่วนที่ยังไม่มีคะแนนนับเป็น 0 จึงต่ำกว่าจริงในช่วงต้นเทอม'),
      columns(d.grades.map((g) => ({ label: g.grade, value: g.count })), 'คน'))));
}

/** แถบสีตามความรุนแรง: ปกติ → ติดตาม → เกินเกณฑ์ */
function severityMeter(el, a) {
  if (a.fail || a.warn) el.classList.add(a.fail ? 'bad' : 'warn');
  return el;
}

/** "3 ครั้ง (ขาด 2 · สาย 2)" */
export function absenceText(a) {
  const detail = [a.absent && `ขาด ${a.absent}`, a.late && `สาย ${a.late}`].filter(Boolean).join(' · ');
  return `${a.effective} ครั้ง` + (detail ? ` (${detail})` : '');
}

export function absenceChip(a) {
  if (a.fail) return h('span', { class: 'chip bad' }, `ขาดเกิน ${a.failAbove} = F`);
  if (a.warn) return h('span', { class: 'chip warn' }, `ขาด ${a.effective}/${a.failAbove} ติดตาม`);
  return null;
}

const PROGRESS = [['graded', 'ตรวจแล้ว'], ['waiting', 'ส่งแล้ว รอตรวจ'], ['none', 'ยังไม่ส่ง']];

function progressLegend() {
  return h('div', { class: 'legend' }, PROGRESS.map(([k, label]) => h('span', {}, h('span', { class: 'swatch seg-' + k }), ' ', label)));
}

function progressRow(a, ctx) {
  const n = a.counts.roster || 0;
  const graded = Math.min(a.counts.graded, n);
  const waiting = Math.min(a.toGrade, n - graded);
  const parts = { graded, waiting, none: Math.max(0, n - graded - waiting) };
  const bar = h('div', { class: 'stack-bar' }, PROGRESS.map(([k, label]) => parts[k] ? tip(h('div', {
    class: 'seg-' + k, style: `flex:${parts[k]}`, tabindex: 0, 'aria-label': `${label} ${parts[k]} คน`
  }), () => h('div', {}, h('strong', {}, a.title), h('div', {}, `${label}: ${parts[k]} คน (${fmtNum((parts[k] / n) * 100, 0)}%)`))) : null));
  return h('div', { class: 'progress-row' },
    h('div', { class: 'row' },
      h('strong', {}, a.title),
      a.groupMax ? h('span', { class: 'chip accent' }, 'งานกลุ่ม') : null,
      h('span', { class: 'muted small' }, a.dueAt ? `ส่ง ${fmtDay(a.dueAt)} · ${fmtLeft(a.dueAt)}` : 'ไม่มีกำหนดส่ง'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'small' }, `ส่ง ${a.counts.submitted}/${n} · ตรวจ ${graded}`),
      a.toGrade ? h('button', { class: 'sm primary', onclick: () => ctx.openGrading(a.id) }, `ตรวจ ${a.toGrade}`) : null),
    n ? bar : h('div', { class: 'muted small' }, 'ยังไม่มีรายชื่อนักศึกษา'));
}

/** กราฟแท่งแนวตั้ง 1 ชุดข้อมูล — ค่าบนหัวแท่ง, hover ดูรายละเอียด */
function columns(items, unit) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((n, i) => n + i.value, 0);
  return h('div', { class: 'columns', role: 'img', 'aria-label': items.map((i) => `${i.label} ${i.value} ${unit}`).join(', ') },
    items.map((i) => tip(h('div', { class: 'col', tabindex: 0 },
      h('div', { class: 'col-value' }, i.value ? String(i.value) : ''),
      h('div', { class: 'col-track' }, h('div', { class: 'col-bar', style: `height:${(i.value / max) * 100}%` })),
      h('div', { class: 'col-label' }, i.label)),
    () => `${i.label}: ${i.value} ${unit}${total ? ` (${fmtNum((i.value / total) * 100, 0)}%)` : ''}`)));
}

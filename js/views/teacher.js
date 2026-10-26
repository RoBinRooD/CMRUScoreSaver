import { h, mount, loading, errorBox, toast, actionButton, confirmBox, modal, fmtDate, fmtSize, fmtNum, toLocalInput, driveUrl, tabs, MARK_LABEL } from '../ui.js';
import { call, beacon } from '../api.js';
import { teacherDashboard } from './dashboard.js';
import { renderSyllabus } from './syllabus.js';
import { renderTimeline } from './timeline.js';
import { renderBoard } from './board.js';
import { teacherLeaves } from './leave.js';

const TABS = [
  ['overview', 'ภาพรวม'],
  ['syllabus', 'Syllabus'],
  ['assignments', 'งาน'],
  ['grading', 'ตรวจงาน'],
  ['timeline', 'Timeline'],
  ['board', 'บอร์ดกลุ่ม'],
  ['attendance', 'เช็คชื่อ'],
  ['leaves', 'ใบลา'],
  ['exams', 'สอบ'],
  ['gradebook', 'สมุดคะแนน'],
  ['students', 'นักศึกษา'],
  ['settings', 'ตั้งค่า']
];

let gradingAssignment = null; // งานที่เลือกไว้ในแท็บตรวจงาน

export function renderTeacher(root, ctx) {
  const { course } = ctx;
  let tab = TABS.some(([k]) => k === ctx.tab) ? ctx.tab : 'overview';
  ctx.openGrading = (id) => { gradingAssignment = id; ctx.setTab('grading'); };
  if (!course && tab !== 'settings') tab = 'students';
  const body = h('div');
  mount(root,
    (ctx.me.warnings || []).map((w) => h('div', { class: 'banner' }, '⚠️ ', w)),
    course
      ? h('div', { style: 'margin-bottom:.5rem' },
        h('h1', {}, course.title),
        h('div', { class: 'muted small' }, `${course.courseCode} · Sec ${course.section} · ภาค ${course.term} · ${course.schedule}`))
      : h('h1', {}, 'เริ่มต้น: นำเข้ารายชื่อนักศึกษา'),
    tabs(course ? TABS : [['students', 'นักศึกษา'], ['settings', 'ตั้งค่า']], tab, ctx.setTab),
    body);
  const views = {
    overview: teacherDashboard, syllabus: renderSyllabus, timeline: renderTimeline, board: renderBoard, leaves: teacherLeaves,
    assignments, grading, attendance, exams, gradebook, students, settings
  };
  views[tab](body, ctx).catch((e) => mount(body, errorBox(e)));
}

/* ---------- งาน ---------- */

async function assignments(body, ctx) {
  mount(body, loading());
  const list = await call('listAssignments', { courseCode: ctx.course.courseCode });
  const edit = async (a) => {
    const saved = await assignmentForm(ctx.course, a, list);
    if (saved) assignments(body, ctx);
  };
  mount(body, h('div', { class: 'stack' },
    h('div', { class: 'row' },
      h('span', { class: 'muted' }, `${list.length} งาน`),
      h('span', { class: 'spacer' }),
      h('button', { class: 'primary', onclick: () => edit(null) }, '+ สร้างงาน')),
    list.length ? h('div', { class: 'grid' }, list.map((a) => h('article', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h3', {}, a.title),
        h('span', { class: 'spacer' }),
        a.published ? null : h('span', { class: 'chip' }, 'ซ่อนอยู่'),
        a.overdue ? h('span', { class: 'chip warn' }, 'เลยกำหนด') : h('span', { class: 'chip info' }, 'เปิดรับ')),
      h('div', { class: 'muted small' }, `กำหนดส่ง ${fmtDate(a.dueAt)} · เต็ม ${a.maxScore} · ${a.allowLate ? 'รับงานช้า' : 'ไม่รับงานช้า'} · คะแนนเก็บ${a.half === 2 ? 'ครึ่งหลัง' : 'ครึ่งแรก'}`),
      a.description ? h('p', { class: 'desc' }, a.description) : null,
      h('div', { class: 'row small', style: 'margin:.5rem 0' },
        a.groupMax ? h('span', { class: 'chip' }, `งานกลุ่ม ≤${a.groupMax} คน · ${a.counts.groups} กลุ่ม`) : null,
        h('span', { class: 'chip accent' }, `ส่งแล้ว ${a.counts.submitted}/${a.counts.roster}`),
        h('span', { class: 'chip ok' }, `ตรวจแล้ว ${a.counts.graded}`)),
      h('div', { class: 'row' },
        h('button', { class: 'primary sm', onclick: () => { gradingAssignment = a.id; ctx.setTab('grading'); } }, 'ตรวจงาน'),
        h('button', { class: 'sm', onclick: () => edit(a) }, 'แก้ไข'),
        actionButton('ลบ', async () => {
          if (!(await confirmBox(`ลบงาน "${a.title}"?`, 'ลบ', 'danger'))) return;
          await call('deleteAssignment', { id: a.id });
          toast('ลบแล้ว');
          assignments(body, ctx);
        }, { class: 'sm ghost danger' })))))
      : h('p', { class: 'muted center pad' }, 'ยังไม่มีงาน — กด "สร้างงาน"')));
}

function assignmentForm(course, a, list = []) {
  // งานใหม่: ใช้ครึ่งเทอมเดียวกับงานที่กำหนดส่งล่าสุด
  const latest = list.filter((x) => x.dueAt).sort((x, y) => (x.dueAt < y.dueAt ? 1 : -1))[0];
  const half = a ? a.half : latest?.half || 1;
  const f = {
    title: h('input', { value: a?.title || '', required: true, maxlength: 200 }),
    description: h('textarea', { value: a?.description || '', placeholder: 'รายละเอียด / ไฟล์ที่ต้องส่ง' }),
    maxScore: h('input', { type: 'number', min: 1, step: 'any', value: a?.maxScore ?? 10 }),
    dueAt: h('input', { type: 'datetime-local', value: toLocalInput(a?.dueAt) }),
    allowLate: h('input', { type: 'checkbox', checked: a ? a.allowLate : true }),
    published: h('input', { type: 'checkbox', checked: a ? a.published : true }),
    isGroup: h('input', { type: 'checkbox', checked: !!a?.groupMax }),
    groupMax: h('input', { type: 'number', min: 2, max: 50, step: 1, value: a?.groupMax || 4, style: 'width:5em' }),
    half: h('select', {},
      h('option', { value: '1', selected: half !== 2 }, 'คะแนนเก็บครึ่งเทอมแรก'),
      h('option', { value: '2', selected: half === 2 }, 'คะแนนเก็บครึ่งเทอมหลัง'))
  };
  const groupMaxField = h('label', { class: 'check' }, 'สมาชิกสูงสุด', f.groupMax, 'คน');
  const syncGroup = () => { groupMaxField.hidden = !f.isGroup.checked; };
  f.isGroup.addEventListener('change', syncGroup);
  syncGroup();
  const body = h('div', { class: 'form' },
    h('label', { class: 'field' }, h('span', {}, 'ชื่องาน'), f.title),
    h('label', { class: 'field' }, h('span', {}, 'รายละเอียด'), f.description),
    h('div', { class: 'form-2' },
      h('label', { class: 'field' }, h('span', {}, 'คะแนนเต็ม'), f.maxScore),
      h('label', { class: 'field' }, h('span', {}, 'กำหนดส่ง'), f.dueAt)),
    h('label', { class: 'field' }, h('span', {}, 'นับเป็นคะแนน'), f.half),
    h('label', { class: 'check' }, f.allowLate, 'รับงานหลังกำหนด (ทำเครื่องหมายว่าส่งช้า)'),
    h('label', { class: 'check' }, f.published, 'แสดงให้นักศึกษาเห็น'),
    h('div', { class: 'row' }, h('label', { class: 'check' }, f.isGroup, 'งานกลุ่ม (นักศึกษาจับกลุ่มเอง)'), groupMaxField));
  return modal(a ? 'แก้ไขงาน' : 'สร้างงานใหม่', body, [{
    label: 'บันทึก',
    run: async () => {
      await call('upsertAssignment', {
        id: a?.id, courseCode: course.courseCode, title: f.title.value, description: f.description.value,
        maxScore: Number(f.maxScore.value), dueAt: f.dueAt.value ? new Date(f.dueAt.value).toISOString() : '',
        allowLate: f.allowLate.checked, published: f.published.checked,
        groupMax: f.isGroup.checked ? Number(f.groupMax.value) : 0,
        half: Number(f.half.value)
      });
      toast('บันทึกงานแล้ว');
    }
  }]);
}

/* ---------- ตรวจงาน ---------- */

async function grading(body, ctx) {
  mount(body, loading());
  const list = await call('listAssignments', { courseCode: ctx.course.courseCode });
  if (!list.length) return mount(body, h('p', { class: 'muted center pad' }, 'ยังไม่มีงาน'));
  if (!list.some((a) => a.id === gradingAssignment)) gradingAssignment = list[0].id;

  const holder = h('div');
  const filter = h('select', { 'aria-label': 'กรอง' },
    h('option', { value: 'all' }, 'ทั้งหมด'),
    h('option', { value: 'submitted' }, 'ส่งแล้ว'),
    h('option', { value: 'ungraded' }, 'ส่งแล้ว ยังไม่ตรวจ'),
    h('option', { value: 'missing' }, 'ยังไม่ส่ง'));
  const pick = h('select', { 'aria-label': 'เลือกงาน' }, list.map((a) => h('option', { value: a.id, selected: a.id === gradingAssignment }, a.title)));
  let data = null;

  const load = async () => {
    gradingAssignment = pick.value;
    mount(holder, loading());
    data = await call('listSubmissions', { assignmentId: gradingAssignment });
    draw();
  };

  const draw = () => (data.groups ? drawGroups() : drawSingle());

  const drawSingle = () => {
    const a = data.assignment;
    const rows = data.rows.filter((r) => {
      const s = r.submission;
      const sent = !!(s && s.submittedAt);
      if (filter.value === 'submitted') return sent;
      if (filter.value === 'ungraded') return sent && s.score === null;
      if (filter.value === 'missing') return !sent;
      return true;
    });
    const dirty = new Map();
    const save = actionButton('บันทึกคะแนน', async () => {
      if (!dirty.size) return toast('ไม่มีอะไรเปลี่ยน');
      data = await call('saveGrades', { assignmentId: a.id, items: [...dirty.values()] });
      toast(`บันทึก ${dirty.size} รายการแล้ว`);
      draw();
    }, { class: 'primary' });

    mount(holder, h('div', { class: 'stack' },
      h('div', { class: 'muted small' }, `กำหนดส่ง ${fmtDate(a.dueAt)} · คะแนนเต็ม ${a.maxScore} · ส่งแล้ว ${data.rows.filter((r) => r.submission?.submittedAt).length}/${data.rows.length}`),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'รหัส'), h('th', {}, 'ชื่อ'), h('th', {}, 'สถานะ'), h('th', {}, 'ไฟล์ / ลิงก์'),
          h('th', { class: 'num' }, `คะแนน (/${a.maxScore})`), h('th', {}, 'ความเห็น'))),
        h('tbody', {}, rows.map((r) => {
          const s = r.submission;
          const score = h('input', { class: 'score', type: 'number', min: 0, max: a.maxScore, step: 'any', value: s?.score ?? '', 'aria-label': 'คะแนน ' + r.studentId });
          const fb = h('input', { class: 'wide', value: s?.feedback || '', placeholder: 'ความเห็น', 'aria-label': 'ความเห็น ' + r.studentId });
          const tr = h('tr', {},
            h('td', { class: 'nowrap' }, r.studentId),
            h('td', {}, r.name),
            h('td', { class: 'nowrap' }, s?.submittedAt
              ? h('span', { class: 'chip ' + (s.isLate ? 'warn' : 'info'), title: fmtDate(s.submittedAt) }, s.isLate ? 'ส่งช้า' : 'ส่งแล้ว')
              : h('span', { class: 'chip' }, 'ยังไม่ส่ง')),
            h('td', {}, h('ul', { class: 'files' },
              (s?.files || []).map((f) => h('li', {}, h('a', { href: driveUrl(f.id), target: '_blank', rel: 'noopener', title: f.name }, f.name), h('span', { class: 'muted small' }, fmtSize(f.size)))),
              s?.link ? h('li', {}, h('a', { href: s.link, target: '_blank', rel: 'noopener' }, '🔗 ลิงก์')) : null)),
            h('td', { class: 'num' }, score),
            h('td', {}, fb));
          const mark = () => {
            dirty.set(r.studentId, { studentId: r.studentId, score: score.value, feedback: fb.value });
            tr.classList.add('dirty');
          };
          score.addEventListener('input', mark);
          fb.addEventListener('input', mark);
          return tr;
        })))),
      h('div', { class: 'row' }, h('span', { class: 'spacer' }), save)));
  };

  /** งานกลุ่ม: แถวหัวกลุ่ม (ไฟล์ + คะแนนกลุ่มที่เติมให้ทุกคน) ตามด้วยสมาชิกแต่ละคน (ปรับคะแนนรายคนได้) */
  const drawGroups = () => {
    const a = data.assignment;
    const byId = new Map(data.rows.map((r) => [r.studentId, r]));
    const dirty = new Map();
    const save = actionButton('บันทึกคะแนน', async () => {
      if (!dirty.size) return toast('ไม่มีอะไรเปลี่ยน');
      data = await call('saveGrades', { assignmentId: a.id, items: [...dirty.values()] });
      toast(`บันทึก ${dirty.size} รายการแล้ว`);
      draw();
    }, { class: 'primary' });
    const editGroup = async (g) => {
      if (await teacherGroupForm(a, data, g)) await load();
    };

    const memberRow = (r) => {
      const s = r.submission;
      const score = h('input', { class: 'score', type: 'number', min: 0, max: a.maxScore, step: 'any', value: s?.score ?? '', 'aria-label': 'คะแนน ' + r.studentId });
      const fb = h('input', { class: 'wide', value: s?.feedback || '', placeholder: 'ความเห็น', 'aria-label': 'ความเห็น ' + r.studentId });
      const tr = h('tr', {},
        h('td', { class: 'nowrap' }, r.studentId), h('td', {}, r.name), h('td', {}), h('td', {}),
        h('td', { class: 'num' }, score), h('td', {}, fb));
      const mark = () => {
        dirty.set(r.studentId, { studentId: r.studentId, score: score.value, feedback: fb.value });
        tr.classList.add('dirty');
      };
      score.addEventListener('input', mark);
      fb.addEventListener('input', mark);
      return { tr, score, fb, mark };
    };

    const groupRows = (g) => {
      const s = g.submission;
      const members = g.members.map((m) => byId.get(m.studentId)).filter(Boolean).map(memberRow);
      const gScore = h('input', { class: 'score', type: 'number', min: 0, max: a.maxScore, step: 'any', placeholder: 'ทั้งกลุ่ม', 'aria-label': 'คะแนนกลุ่ม ' + g.name });
      const gFb = h('input', { class: 'wide', placeholder: 'ความเห็นถึงทั้งกลุ่ม', 'aria-label': 'ความเห็นกลุ่ม ' + g.name });
      gScore.addEventListener('input', () => members.forEach((m) => { m.score.value = gScore.value; m.mark(); }));
      gFb.addEventListener('input', () => members.forEach((m) => { m.fb.value = gFb.value; m.mark(); }));
      const head = h('tr', { class: 'group-head' },
        h('td', { colspan: 2 },
          h('strong', {}, g.name), ' ', h('span', { class: 'muted small' }, `${g.members.length} คน`), ' ',
          h('button', { class: 'sm ghost', onclick: () => editGroup(g) }, 'แก้กลุ่ม')),
        h('td', { class: 'nowrap' }, s?.submittedAt
          ? h('span', { class: 'chip ' + (s.isLate ? 'warn' : 'info'), title: fmtDate(s.submittedAt) }, s.isLate ? 'ส่งช้า' : 'ส่งแล้ว')
          : h('span', { class: 'chip' }, 'ยังไม่ส่ง')),
        h('td', {}, h('ul', { class: 'files' },
          (s?.files || []).map((f) => h('li', {}, h('a', { href: driveUrl(f.id), target: '_blank', rel: 'noopener', title: f.name }, f.name), h('span', { class: 'muted small' }, fmtSize(f.size)))),
          s?.link ? h('li', {}, h('a', { href: s.link, target: '_blank', rel: 'noopener' }, '🔗 ลิงก์')) : null)),
        h('td', { class: 'num' }, gScore),
        h('td', {}, gFb));
      return [head, members.map((m) => m.tr)];
    };

    const sent = (g) => !!g.submission?.submittedAt;
    const groups = data.groups.filter((g) => {
      if (filter.value === 'submitted') return sent(g);
      if (filter.value === 'ungraded') return sent(g) && g.members.some((m) => byId.get(m.studentId)?.submission?.score == null);
      if (filter.value === 'missing') return !sent(g);
      return true;
    });
    const loners = data.rows.filter((r) => !r.groupId);
    const showLoners = loners.length && (filter.value === 'all' || filter.value === 'missing');

    mount(holder, h('div', { class: 'stack' },
      h('div', { class: 'row' },
        h('span', { class: 'muted small' }, `กำหนดส่ง ${fmtDate(a.dueAt)} · คะแนนเต็ม ${a.maxScore} · งานกลุ่ม ≤${a.groupMax} คน · ${data.groups.length} กลุ่ม (ส่งแล้ว ${data.groups.filter(sent).length}) · ยังไม่มีกลุ่ม ${loners.length} คน`),
        h('span', { class: 'spacer' }),
        h('button', { class: 'sm', onclick: () => editGroup(null) }, '+ สร้างกลุ่ม')),
      h('p', { class: 'muted small' }, 'ใส่คะแนนในแถวกลุ่ม = เติมให้สมาชิกทุกคน แล้วปรับรายคนได้ในแถวของแต่ละคน'),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'รหัส'), h('th', {}, 'ชื่อ'), h('th', {}, 'สถานะ'), h('th', {}, 'ไฟล์ / ลิงก์'),
          h('th', { class: 'num' }, `คะแนน (/${a.maxScore})`), h('th', {}, 'ความเห็น'))),
        h('tbody', {},
          groups.map(groupRows),
          showLoners ? [
            h('tr', { class: 'group-head' }, h('td', { colspan: 6 }, h('strong', {}, 'ยังไม่มีกลุ่ม'), ' ', h('span', { class: 'muted small' }, `${loners.length} คน`))),
            loners.map((r) => memberRow(r).tr)] : null))),
      h('div', { class: 'row' }, h('span', { class: 'spacer' }), save)));
  };

  pick.addEventListener('change', () => load().catch((e) => mount(holder, errorBox(e))));
  filter.addEventListener('change', () => data && draw());
  mount(body, h('div', { class: 'stack' }, h('div', { class: 'row' }, pick, filter), holder));
  await load();
}

/** อาจารย์สร้าง/แก้กลุ่ม: เลือกใครก็ได้ในวิชา (คนที่อยู่กลุ่มอื่นจะถูกย้ายมา) และเกินจำนวนสูงสุดได้ */
function teacherGroupForm(a, data, g) {
  const groupName = new Map(data.groups.map((x) => [x.id, x.name]));
  const name = h('input', { value: g?.name || '', maxlength: 100 });
  const count = h('span', { class: 'muted small' });
  const boxes = data.rows.map((r) => {
    const input = h('input', { type: 'checkbox', checked: !!g && r.groupId === g.id });
    const other = r.groupId && (!g || r.groupId !== g.id) ? groupName.get(r.groupId) : null;
    return { r, input, row: h('label', { class: 'check' }, input, `${r.studentId} ${r.name}`, other ? h('span', { class: 'chip' }, other) : null) };
  });
  const sync = () => {
    const n = boxes.filter((b) => b.input.checked).length;
    count.textContent = `${n} คน${n > a.groupMax ? ` (เกินที่กำหนด ${a.groupMax})` : ''}`;
  };
  boxes.forEach((b) => b.input.addEventListener('change', sync));
  sync();
  const actions = [{
    label: 'บันทึก',
    run: async () => {
      await call('saveGroup', { assignmentId: a.id, groupId: g?.id, name: name.value.trim(), members: boxes.filter((b) => b.input.checked).map((b) => b.r.studentId) });
      toast('บันทึกกลุ่มแล้ว');
    }
  }];
  if (g) {
    actions.unshift({
      label: 'ลบกลุ่ม', class: 'ghost danger',
      run: async () => {
        await call('deleteGroup', { groupId: g.id });
        toast('ลบกลุ่มแล้ว');
      }
    });
  }
  return modal(g ? `แก้กลุ่ม ${g.name}` : 'สร้างกลุ่ม', h('div', { class: 'form' },
    h('label', { class: 'field' }, h('span', {}, 'ชื่อกลุ่ม'), name),
    h('div', { class: 'row' }, h('strong', {}, 'สมาชิก'), h('span', { class: 'spacer' }), count),
    h('div', { class: 'pick-list' }, boxes.map((b) => b.row)),
    h('p', { class: 'muted small' }, 'เลือกคนที่อยู่กลุ่มอื่น = ย้ายมากลุ่มนี้ · คะแนนที่ให้ไว้แล้วเป็นของแต่ละคน ไม่ย้ายตามกลุ่ม')),
  actions);
}

/* ---------- เช็คชื่อ ---------- */

const CYCLE = ['', 'P', 'L', 'A', 'E'];
const SAVE_DELAY = 1000; // บันทึกหลังคลิกล่าสุด
const RETRY = [3, 10, 30, 60]; // วินาที — ลองใหม่เมื่อบันทึกไม่สำเร็จ

/*
 * เช็คชื่อบันทึกอัตโนมัติ — เช็คซ้ำย้อนหลังไม่ได้ จึงกันข้อมูลหาย 3 ชั้น:
 * 1) ทุกคลิกเก็บลง localStorage ทันที (ปิดหน้า/เน็ตหลุด → เปิดใหม่แล้วกู้คืนและส่งต่อให้)
 * 2) ส่งเฉพาะช่องที่เปลี่ยน (setAttendanceMarks) หลังคลิกล่าสุด 1 วินาที — ล้มเหลวลองใหม่เอง
 * 3) ซ่อน/ปิดหน้า → ส่งที่ค้างด้วย sendBeacon
 * ข้อมูลสำรองลบเมื่อเซิร์ฟเวอร์ยืนยันแล้วเท่านั้น
 */
const attSavers = new Map(); // courseCode → saver (ยังทำงานต่อแม้สลับไปแท็บอื่น)

function attKey(code) {
  return 'cmruscoresaver_att_' + code;
}

const STALE_BACKUP = 6 * 3600 * 1000; // สำรองเก่ากว่านี้ ให้อาจารย์ยืนยันก่อนส่ง (อาจถูกแก้จากเครื่องอื่นไปแล้ว)

/** { at, pending } — รองรับรูปแบบเดิมที่เก็บแค่ pending */
function loadBackup(code) {
  try {
    const v = JSON.parse(localStorage.getItem(attKey(code)) || 'null');
    if (!v) return { at: 0, pending: {} };
    return v.pending ? v : { at: 0, pending: v };
  } catch { return { at: 0, pending: {} }; }
}

function attendanceSaver(code) {
  if (attSavers.has(code)) return attSavers.get(code);
  const backup = loadBackup(code);
  const s = {
    pending: backup.pending, // { studentId: { week: mark } }
    backupAt: backup.at,
    saving: false,
    error: null,
    savedAt: null,
    timer: null,
    retry: 0,
    onChange: () => {},
    count() { return Object.values(s.pending).reduce((n, w) => n + Object.keys(w).length, 0); },
    persist() {
      try {
        if (s.count()) localStorage.setItem(attKey(code), JSON.stringify({ at: Date.now(), pending: s.pending }));
        else localStorage.removeItem(attKey(code));
      } catch { /* ส่งเซิร์ฟเวอร์ต่อไป */ }
    },
    set(studentId, week, mark) {
      s.backupAt = Date.now();
      (s.pending[studentId] ??= {})[week] = mark;
      s.persist();
      s.schedule(SAVE_DELAY);
      s.onChange();
    },
    changes() {
      return Object.entries(s.pending).flatMap(([studentId, weeks]) =>
        Object.entries(weeks).map(([week, mark]) => ({ studentId, week: Number(week), mark })));
    },
    schedule(ms) {
      clearTimeout(s.timer);
      s.timer = setTimeout(() => s.flush(), ms);
    },
    async flush() {
      clearTimeout(s.timer);
      if (s.saving || !s.count()) return;
      const sent = s.changes();
      s.saving = true;
      s.onChange();
      try {
        const res = await call('setAttendanceMarks', { courseCode: code, changes: sent });
        // ลบเฉพาะช่องที่ค่ายังเท่ากับที่ส่งไป — ถ้าคลิกเพิ่มระหว่างส่ง จะส่งรอบถัดไป
        sent.forEach(({ studentId, week, mark }) => {
          const w = s.pending[studentId];
          if (w && w[week] === mark) delete w[week];
          if (w && !Object.keys(w).length) delete s.pending[studentId];
        });
        s.persist();
        s.error = null;
        s.retry = 0;
        s.savedAt = res.savedAt;
        s.heldWeeks = res.heldWeeks;
      } catch (e) {
        s.error = e.message || String(e);
        s.schedule(RETRY[Math.min(s.retry++, RETRY.length - 1)] * 1000);
      } finally {
        s.saving = false;
        s.onChange();
        if (!s.error && s.count()) s.schedule(300);
      }
    },
    /** ปิด/ซ่อนหน้า: ส่งด้วย beacon (ข้อมูลสำรองยังเก็บไว้จนกว่าจะยืนยัน) */
    beacon() {
      if (s.count()) beacon('setAttendanceMarks', { courseCode: code, changes: s.changes() });
    }
  };
  attSavers.set(code, s);
  return s;
}

const pendingAttendance = () => [...attSavers.values()].reduce((n, s) => n + s.count(), 0);
window.addEventListener('beforeunload', (e) => {
  attSavers.forEach((s) => s.beacon());
  if (pendingAttendance()) { e.preventDefault(); e.returnValue = ''; }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') attSavers.forEach((s) => s.flush());
});
window.addEventListener('online', () => attSavers.forEach((s) => s.flush()));

async function attendance(body, ctx) {
  mount(body, loading());
  const code = ctx.course.courseCode;
  const saver = attendanceSaver(code);
  const data = await call('getAttendance', { courseCode: code });
  const rows = data.rows.map((r) => ({ ...r, marks: [...r.marks] }));
  // ช่องที่ยังไม่ได้รับการยืนยัน (จากรอบก่อน หรือกำลังส่งอยู่) ทับค่าจากเซิร์ฟเวอร์
  const restored = saver.count();
  const stale = restored && !saver.saving && Date.now() - (saver.backupAt || 0) > STALE_BACKUP;
  rows.forEach((r) => Object.entries(saver.pending[r.studentId] || {}).forEach(([w, m]) => { r.marks[w - 1] = m; }));
  const staleBanner = h('div', { class: 'banner bad' },
    `พบการเช็คชื่อที่ยังไม่ได้บันทึก ${restored} ช่อง จาก${saver.backupAt ? 'วันที่ ' + fmtDate(new Date(saver.backupAt).toISOString()) : 'ครั้งก่อน'} (แสดงเป็นจุดในตาราง) `,
    actionButton('ส่งบันทึก', async () => { staleBanner.remove(); await saver.flush(); }, { class: 'sm primary' }), ' ',
    actionButton('ทิ้ง', async () => {
      if (!(await confirmBox('ทิ้งการเช็คชื่อที่ยังไม่ได้บันทึก? ตารางจะกลับเป็นค่าที่บันทึกในระบบ', 'ทิ้ง', 'danger'))) return;
      saver.pending = {};
      saver.persist();
      attendance(body, ctx);
    }, { class: 'sm ghost danger' }));
  const holder = h('div');
  const status = h('div', { class: 'save-status', role: 'status', 'aria-live': 'polite' });

  const drawStatus = () => {
    const n = saver.count();
    const saveNow = h('button', { class: 'sm', onclick: () => saver.flush() }, 'บันทึกตอนนี้');
    if (saver.saving) mount(status, h('span', { class: 'chip info' }, `⏳ กำลังบันทึก ${n} ช่อง…`));
    else if (saver.error) mount(status, h('span', { class: 'chip bad' }, `⚠️ บันทึกไม่สำเร็จ — ค้าง ${n} ช่อง (เก็บไว้ในเครื่องแล้ว ลองใหม่อัตโนมัติ)`), saveNow);
    else if (n) mount(status, h('span', { class: 'chip warn' }, `● รอบันทึก ${n} ช่อง`));
    else mount(status, h('span', { class: 'chip ok' }, saver.savedAt ? `✓ บันทึกแล้ว ${fmtDate(saver.savedAt)}` : '✓ บันทึกอัตโนมัติ'));
    status.title = saver.error || '';
  };

  const setMark = (r, i, m) => {
    if (r.marks[i] === m) return;
    r.marks[i] = m;
    saver.set(r.studentId, i + 1, m);
  };

  const draw = () => {
    mount(holder, h('div', { class: 'table-wrap' }, h('table', { class: 'att' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'รหัส'), h('th', {}, 'ชื่อ'),
        Array.from({ length: 16 }, (_, i) => h('th', {},
          h('button', {
            class: 'sm ghost', title: `สัปดาห์ ${i + 1}: ทำเครื่องหมาย "มา" ให้ทุกคนที่ยังว่าง`,
            onclick: () => { rows.forEach((r) => { if (!r.marks[i]) setMark(r, i, 'P'); }); draw(); }
          }, String(i + 1)))))),
      h('tbody', {}, rows.map((r) => h('tr', {},
        h('td', { class: 'nowrap' }, r.studentId),
        h('td', { class: 'nowrap' }, r.name),
        r.marks.map((m, i) => {
          const unsaved = saver.pending[r.studentId]?.[i + 1] !== undefined;
          return h('td', {}, h('button', {
            class: 'mark ' + m + (unsaved ? ' unsaved' : ''), title: MARK_LABEL[m] + (unsaved ? ' (ยังไม่บันทึก)' : ''),
            'aria-label': `${r.studentId} สัปดาห์ ${i + 1}: ${MARK_LABEL[m]}`,
            onclick: () => { setMark(r, i, CYCLE[(CYCLE.indexOf(m) + 1) % CYCLE.length]); draw(); }
          }, m || '·'));
        })))))));
  };
  // วาดใหม่เมื่อบันทึกเสร็จ เพื่อเอาจุด "ยังไม่บันทึก" ออก
  saver.onChange = () => { drawStatus(); if (!saver.saving && holder.isConnected) draw(); };

  mount(body, h('div', { class: 'stack' },
    data.pendingLeaves ? h('div', { class: 'banner' }, `มีใบลารออนุมัติ ${data.pendingLeaves} ใบ — อนุมัติแล้วระบบจะเช็คชื่อเป็น "ลา" ให้ `,
      h('button', { class: 'sm', onclick: () => ctx.setTab('leaves') }, 'ไปที่ใบลา')) : null,
    h('div', { class: 'row' },
      h('div', { class: 'legend muted' }, 'คลิกช่องเพื่อเปลี่ยน:', ['P', 'L', 'A', 'E'].map((k) => h('span', {}, h('span', { class: 'mark btn ' + k }, k), ' ', MARK_LABEL[k]))),
      h('span', { class: 'spacer' }),
      status),
    restored && stale ? staleBanner : null,
    h('p', { class: 'muted small' }, 'บันทึกอัตโนมัติทุกครั้งที่คลิก (เก็บสำรองในเครื่องด้วย ถ้าเน็ตหลุดจะส่งให้เมื่อกลับมา) · คลิกเลขสัปดาห์ที่หัวตารางเพื่อให้ทุกคนที่ยังว่าง = มา · สัปดาห์ที่มีการเช็คชื่อแล้ว ช่องว่างจะนับเป็นขาด'),
    holder));
  draw();
  drawStatus();
  if (restored && !stale) {
    toast(`กู้คืนการเช็คชื่อที่ยังไม่ได้บันทึก ${restored} ช่อง — กำลังส่ง`);
    saver.flush();
  }
}

/* ---------- สอบ ---------- */

async function exams(body, ctx) {
  mount(body, loading());
  const data = await call('getExams', { courseCode: ctx.course.courseCode });
  const maxM = h('input', { type: 'number', min: 1, step: 'any', value: data.maxMidterm, style: 'width:6em' });
  const maxF = h('input', { type: 'number', min: 1, step: 'any', value: data.maxFinal, style: 'width:6em' });
  const inputs = data.rows.map((r) => ({
    studentId: r.studentId,
    mid: h('input', { class: 'score', type: 'number', min: 0, step: 'any', value: r.midterm ?? '', 'aria-label': 'กลางภาค ' + r.studentId }),
    fin: h('input', { class: 'score', type: 'number', min: 0, step: 'any', value: r.final ?? '', 'aria-label': 'ปลายภาค ' + r.studentId })
  }));
  mount(body, h('div', { class: 'stack' },
    h('div', { class: 'row' },
      h('label', { class: 'check' }, 'คะแนนเต็มกลางภาค', maxM),
      h('label', { class: 'check' }, 'ปลายภาค', maxF),
      h('span', { class: 'spacer' }),
      actionButton('บันทึกคะแนนสอบ', async () => {
        await call('saveExams', {
          courseCode: ctx.course.courseCode, maxMidterm: Number(maxM.value), maxFinal: Number(maxF.value),
          rows: inputs.map((i) => ({ studentId: i.studentId, midterm: i.mid.value, final: i.fin.value }))
        });
        toast('บันทึกคะแนนสอบแล้ว');
      }, { class: 'primary' })),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'รหัส'), h('th', {}, 'ชื่อ'), h('th', { class: 'num' }, 'กลางภาค'), h('th', { class: 'num' }, 'ปลายภาค'))),
      h('tbody', {}, data.rows.map((r, i) => h('tr', {},
        h('td', {}, r.studentId), h('td', {}, r.name),
        h('td', { class: 'num' }, inputs[i].mid), h('td', { class: 'num' }, inputs[i].fin))))))));
}

/* ---------- สมุดคะแนน ---------- */

let xlsxLoading;
function loadXlsx() {
  xlsxLoading ??= new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => { xlsxLoading = null; reject(new Error('โหลดตัวอ่าน Excel ไม่ได้')); };
    document.head.append(s);
  });
  return xlsxLoading;
}

async function gradebook(body, ctx) {
  mount(body, loading());
  const gb = await call('gradebook', { courseCode: ctx.course.courseCode });
  const weights = { ...gb.course.weights };
  const labels = { attendance: 'เข้าเรียน', assignments: 'งาน', midterm: 'กลางภาค', final: 'ปลายภาค' };
  const visible = h('input', { type: 'checkbox', checked: gb.course.gradesVisible });
  const sumLabel = h('span', { class: 'chip' });
  const holder = h('div');

  const compute = (s) => Grade.compute({
    weights, cutoffs: gb.settings.gradeCutoffs, attendancePoints: gb.settings.attendancePoints,
    heldWeeks: gb.course.heldWeeks, attendance: s.attendance,
    assignments: gb.assignments.map((a) => ({ score: s.scores[a.id], maxScore: a.maxScore, overdue: a.overdue, half: a.half })),
    midterm: s.exams.midterm, maxMidterm: gb.course.maxMidterm, final: s.exams.final, maxFinal: gb.course.maxFinal
  });

  const maxOf = (k) => Grade.compute({ weights }).halves.max[k];

  const draw = () => {
    const sum = Grade.PARTS.reduce((t, k) => t + (Number(weights[k]) || 0), 0);
    sumLabel.textContent = `รวม ${fmtNum(sum)}%`;
    sumLabel.className = 'chip ' + (sum === 100 ? 'ok' : 'warn');
    const results = gb.students.map((s) => ({ s, r: compute(s) }));
    const dist = {};
    results.forEach(({ r }) => { dist[r.grade] = (dist[r.grade] || 0) + 1; });
    mount(holder, h('div', { class: 'stack' },
      h('div', { class: 'dist' }, (gb.settings.gradeCutoffs).map(([g]) => h('span', { class: 'chip accent' }, `${g}: ${dist[g] || 0}`))),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'รหัส'), h('th', {}, 'ชื่อ'),
          gb.assignments.map((a) => h('th', { class: 'num', title: `${a.title} · ครึ่ง${a.half === 2 ? 'หลัง' : 'แรก'}` }, `${a.title.slice(0, 14)} (/${a.maxScore})`, h('div', { class: 'muted small' }, a.half === 2 ? 'ครึ่งหลัง' : 'ครึ่งแรก'))),
          ['attendance', 'assignments'].map((k) => h('th', { class: 'num' }, `${labels[k]} ${weights[k]}%`)),
          REGISTRAR_COLS.map(([k, label]) => h('th', { class: 'num reg' }, label, h('div', { class: 'muted small' }, `/${fmtNum(maxOf(k))}`))),
          h('th', { class: 'num' }, 'รวม'), h('th', {}, 'เกรด'))),
        h('tbody', {}, results.map(({ s, r }) => h('tr', {},
          h('td', { class: 'nowrap' }, s.studentId), h('td', { class: 'nowrap' }, s.name),
          gb.assignments.map((a) => h('td', { class: 'num' }, fmtNum(s.scores[a.id]))),
          ['attendance', 'assignments'].map((k) => h('td', { class: 'num muted' }, fmtNum(r.parts[k].points))),
          REGISTRAR_COLS.map(([k]) => h('td', { class: 'num reg' }, fmtNum(r.halves[k]))),
          h('td', { class: 'num' }, h('strong', {}, fmtNum(r.total))),
          h('td', {}, h('span', { class: 'chip accent' }, r.grade)))))))));
    return results;
  };

  const weightInputs = Grade.PARTS.map((k) => h('label', { class: 'field' }, h('span', {}, labels[k] + ' (%)'),
    h('input', { type: 'number', min: 0, step: 'any', value: weights[k], oninput: (e) => { weights[k] = Number(e.target.value) || 0; draw(); } })));

  const exportXlsx = async () => {
    const XLSX = await loadXlsx();
    const head = ['รหัส', 'ชื่อ', 'หมู่เรียน', ...gb.assignments.map((a) => `${a.title} (/${a.maxScore}) ครึ่ง${a.half === 2 ? 'หลัง' : 'แรก'}`),
      ...['attendance', 'assignments'].map((k) => `${labels[k]} (${weights[k]}%)`),
      ...REGISTRAR_COLS.map(([k, label]) => `${label} (/${maxOf(k)})`), 'รวม', 'เกรด'];
    const rows = gb.students.map((s) => {
      const r = compute(s);
      return [s.studentId, s.name, s.group, ...gb.assignments.map((a) => s.scores[a.id] ?? ''),
        ...['attendance', 'assignments'].map((k) => r.parts[k].points ?? ''),
        ...REGISTRAR_COLS.map(([k]) => r.halves[k]), r.total, r.grade];
    });
    const ws = XLSX.utils.aoa_to_sheet([[`${gb.course.courseCode} ${gb.course.title} ภาค ${gb.course.term}`], [], head, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'คะแนน');
    XLSX.writeFile(wb, `${gb.course.courseCode}-grades.xlsx`);
  };

  mount(body, h('div', { class: 'stack' },
    h('section', { class: 'card stack' },
      h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, 'สัดส่วนคะแนน'), sumLabel),
      h('div', { class: 'form-2' }, weightInputs),
      h('div', { class: 'row' },
        h('label', { class: 'check' }, visible, 'ประกาศคะแนนรวมและเกรดให้นักศึกษาเห็น'),
        h('span', { class: 'spacer' }),
        actionButton('คัดลอกสำหรับระบบทะเบียน', () => registrarExport(gb, compute, maxOf)),
        actionButton('ดาวน์โหลด Excel', exportXlsx),
        actionButton('บันทึกการตั้งค่า', async () => {
          await call('updateCourse', { courseCode: gb.course.courseCode, weights, gradesVisible: visible.checked });
          toast('บันทึกแล้ว');
          await ctx.refreshMe();
        }, { class: 'primary' })),
      h('p', { class: 'muted small' }, 'คะแนนเก็บแต่ละครึ่ง = เข้าเรียน ÷ 2 + งานของครึ่งนั้น (น้ำหนักงาน ÷ 2) · เลือกครึ่งเทอมของแต่ละงานในฟอร์มงาน · รวม = ผลรวม 4 ช่องของระบบทะเบียน'),
      h('p', { class: 'muted small' }, 'งานที่ยังไม่ถึงกำหนดและยังไม่ได้ให้คะแนนจะยังไม่นับ · งานที่เลยกำหนดแต่ไม่ส่ง = 0 · เกณฑ์เกรดแก้ได้ที่แท็บตั้งค่า')),
    holder));
  draw();
}

const REGISTRAR_COLS = [['first', 'เก็บครึ่งแรก'], ['second', 'เก็บครึ่งหลัง'], ['midterm', 'กลางภาค'], ['final', 'ปลายภาค']];

/** ข้อความสำหรับวางในช่องนำเข้าคะแนนของระบบทะเบียน: รหัส⇥เก็บครึ่งแรก⇥เก็บครึ่งหลัง⇥กลางภาค⇥ปลายภาค รหัสละบรรทัด ไม่มีหัวตาราง */
function registrarExport(gb, compute, maxOf) {
  const integer = h('input', { type: 'checkbox', checked: true });
  const out = h('textarea', { readonly: true, rows: 12, style: 'font-family:ui-monospace,monospace;white-space:pre;tab-size:10', 'aria-label': 'ข้อความสำหรับระบบทะเบียน' });
  const fmt = (n) => (integer.checked ? String(Math.round(n)) : String(Grade.round2(n)));
  const fill = () => {
    out.value = gb.students
      .slice().sort((a, b) => (a.studentId < b.studentId ? -1 : 1))
      .map((s) => { const r = compute(s).halves; return [s.studentId, fmt(r.first), fmt(r.second), fmt(r.midterm), fmt(r.final)].join('\t'); })
      .join('\n');
  };
  integer.addEventListener('change', fill);
  fill();
  const maxes = REGISTRAR_COLS.map(([k, label]) => `${label} ${fmtNum(maxOf(k))}`).join(' · ');
  return modal('คัดลอกสำหรับระบบทะเบียน', h('div', { class: 'form' },
    h('p', { class: 'small' }, `${gb.students.length} คน · รหัสละบรรทัด: รหัส ⇥ เก็บครึ่งแรก ⇥ เก็บครึ่งหลัง ⇥ กลางภาค ⇥ ปลายภาค (คั่นด้วยแท็บ ไม่มีหัวตาราง)`),
    h('p', { class: 'muted small' }, `คะแนนเต็มตามน้ำหนักวิชานี้: ${maxes} — ต้องตรงกับที่ตั้งไว้ในระบบทะเบียน`),
    out,
    h('label', { class: 'check' }, integer, 'ปัดเป็นจำนวนเต็ม (ไม่ติ๊ก = ทศนิยม 2 ตำแหน่ง)'),
    h('p', { class: 'muted small' }, 'ใช้คะแนนจากสัดส่วนคะแนนที่แสดงอยู่ตอนนี้ — ถ้าแก้สัดส่วน อย่าลืมกด "บันทึกการตั้งค่า"')),
  [{
    label: 'คัดลอก',
    run: async () => {
      try {
        await navigator.clipboard.writeText(out.value);
      } catch {
        out.select();
        document.execCommand('copy');
      }
      toast('คัดลอกแล้ว — วางในช่องนำเข้าคะแนนของระบบทะเบียน');
      return false;
    }
  }]);
}

/* ---------- นักศึกษา ---------- */

async function students(body, ctx) {
  const importer = rosterImporter(ctx);
  if (!ctx.course) return mount(body, importer);
  mount(body, loading());
  const list = await call('listStudents', { courseCode: ctx.course.courseCode });
  const registered = list.filter((s) => s.email).length;
  const filter = h('select', { 'aria-label': 'กรองสถานะ' },
    h('option', { value: 'all' }, 'ทั้งหมด'),
    h('option', { value: 'no' }, 'ยังไม่สมัคร'),
    h('option', { value: 'yes' }, 'สมัครแล้ว'));
  const tbody = h('tbody');
  const reload = () => students(body, ctx);
  const draw = () => mount(tbody, list
    .filter((s) => filter.value === 'all' || (filter.value === 'yes') === !!s.email)
    .map((s) => h('tr', {},
      h('td', { class: 'nowrap' }, s.studentId),
      h('td', { class: 'nowrap' }, s.name, s.nickname ? h('span', { class: 'muted' }, ` (${s.nickname})`) : null),
      h('td', { class: 'nowrap' }, s.group),
      h('td', { class: 'nowrap' }, s.email
        ? h('span', { class: 'chip ok', title: 'สมัครเมื่อ ' + fmtDate(s.boundAt) }, 'สมัครแล้ว')
        : h('span', { class: 'chip warn' }, 'ยังไม่สมัคร')),
      h('td', {}, s.email || '-', s.phone ? h('div', { class: 'muted small' }, s.phone) : null),
      h('td', { class: 'nowrap' },
        h('button', { class: 'sm', onclick: () => editEmail(s).then((ok) => ok && reload()) }, s.email ? 'แก้/รีเซ็ต' : 'กำหนดอีเมล'),
        actionButton('นำออก', async () => {
          if (!(await confirmBox(`นำ ${s.name} ออกจากรายชื่อวิชานี้? (งานที่ส่งแล้วยังอยู่)`, 'นำออก', 'danger'))) return;
          await call('removeStudent', { courseCode: ctx.course.courseCode, studentId: s.studentId });
          reload();
        }, { class: 'sm ghost danger' })))));
  filter.addEventListener('change', draw);
  draw();
  mount(body, h('div', { class: 'stack' },
    importer,
    h('div', { class: 'row' },
      h('h2', { style: 'margin:0' }, `รายชื่อ ${list.length} คน`),
      h('span', { class: 'chip ' + (registered === list.length ? 'ok' : 'warn') }, `สมัครแล้ว ${registered}/${list.length}`),
      h('span', { class: 'spacer' }),
      filter,
      h('button', { onclick: () => addStudentForm(ctx.course).then((ok) => ok && reload()) }, '+ เพิ่มนักศึกษา')),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'รหัส'), h('th', {}, 'ชื่อ'), h('th', {}, 'หมู่เรียน'), h('th', {}, 'สถานะ'), h('th', {}, 'บัญชี / เบอร์'), h('th', {}, ''))),
      tbody))));
}

function addStudentForm(course) {
  const f = {
    studentId: h('input', { inputmode: 'numeric', maxlength: 13 }),
    name: h('input', { placeholder: 'เช่น นางสาวสมหญิง ใจดี' }),
    group: h('input', { placeholder: 'เช่น ศอ 68.ศป.บ.4.1' })
  };
  return modal(`เพิ่มนักศึกษาใน ${course.courseCode}`, h('div', { class: 'form' },
    h('p', { class: 'muted small' }, 'สำหรับนักศึกษาที่ไม่อยู่ในไฟล์รายชื่อ เพิ่มแล้วนักศึกษาสมัครด้วยรหัสและชื่อนี้ได้'),
    h('label', { class: 'field' }, h('span', {}, 'รหัสนักศึกษา'), f.studentId),
    h('label', { class: 'field' }, h('span', {}, 'ชื่อ-นามสกุล (ตามใบรายชื่อ)'), f.name),
    h('label', { class: 'field' }, h('span', {}, 'หมู่เรียน'), f.group)), [{
    label: 'เพิ่ม',
    run: async () => {
      await call('addStudent', { courseCode: course.courseCode, studentId: f.studentId.value.trim(), name: f.name.value.trim(), group: f.group.value.trim() });
      toast('เพิ่มนักศึกษาแล้ว');
    }
  }]);
}

function editEmail(s) {
  const input = h('input', { type: 'email', value: s.email, placeholder: 'เว้นว่าง = รีเซ็ตให้นักศึกษาสมัครใหม่' });
  return modal(`บัญชีของ ${s.studentId} ${s.name}`,
    h('label', { class: 'field' }, h('span', {}, 'อีเมล Google'), input),
    [{ label: 'บันทึก', run: async () => { await call('setStudentEmail', { studentId: s.studentId, email: input.value.trim() }); toast('บันทึกแล้ว'); } }]);
}

function rosterImporter(ctx) {
  const input = h('input', { type: 'file', accept: '.xls,.xlsx,.csv' });
  const preview = h('div');
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    mount(preview, loading('กำลังอ่านไฟล์…'));
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
      const r = Roster.parse(rows);
      mount(preview, h('div', { class: 'stack' },
        h('p', {}, h('strong', {}, `${r.course.courseCode} ${r.course.title}`), ` · Sec ${r.course.section} · ภาค ${r.course.term} · ${r.students.length} คน`),
        h('div', { class: 'table-wrap', style: 'max-height:240px' }, h('table', {},
          h('tbody', {}, r.students.map((s) => h('tr', {}, h('td', {}, s.no), h('td', {}, s.studentId), h('td', {}, s.name), h('td', {}, s.group)))))),
        actionButton(`นำเข้า ${r.students.length} คน`, async () => {
          const res = await call('importRoster', r);
          toast(`นำเข้าแล้ว: เพิ่ม ${res.added} · อัปเดต ${res.updated}`);
          if (res.missing.length) toast(`มี ${res.missing.length} คนในระบบที่ไม่อยู่ในไฟล์นี้ (อาจถอนวิชา) — ตรวจในแท็บนักศึกษา`, 'bad');
          await ctx.refreshMe();
          ctx.selectCourse(res.course.courseCode);
        }, { class: 'primary' })));
    } catch (e) {
      mount(preview, errorBox(e));
    }
  });
  return h('section', { class: 'card stack' },
    h('h2', {}, 'นำเข้ารายชื่อจากระบบทะเบียน'),
    h('p', { class: 'muted small' }, 'เลือกไฟล์ .xls "รายชื่อนักศึกษาลงทะเบียน" ที่ดาวน์โหลดจากระบบทะเบียน — ระบบจะสร้างวิชาให้อัตโนมัติ นำเข้าซ้ำได้ (อัปเดตชื่อ ไม่ลบข้อมูลเดิม)'),
    input, preview);
}

/* ---------- ตั้งค่า ---------- */

async function settings(body, ctx) {
  mount(body, loading());
  const s = await call('getSettings');
  const text = (v) => h('textarea', { value: v.join('\n'), style: 'min-height:70px' });
  const f = {
    teacherEmails: text(s.teacherEmails),
    allowedDomains: text(s.allowedDomains),
    allowedOrigins: text(s.allowedOrigins),
    uploadMaxMB: h('input', { type: 'number', min: 1, value: s.uploadMaxMB })
  };
  const cutoffs = s.gradeCutoffs.map(([g, min]) => ({ g: h('input', { value: g, style: 'width:4em' }), min: h('input', { type: 'number', step: 'any', value: min, style: 'width:6em' }) }));
  const pts = Object.fromEntries(['P', 'L', 'E', 'A'].map((k) => [k, h('input', { type: 'number', min: 0, max: 1, step: 0.05, value: s.attendancePoints[k] ?? 0, style: 'width:6em' })]));
  const lines = (el) => el.value.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);

  mount(body, h('div', { class: 'stack' },
    h('section', { class: 'card form' },
      h('h2', {}, 'การเข้าถึง'),
      h('label', { class: 'field' }, h('span', {}, 'อีเมลอาจารย์ (บรรทัดละ 1)'), f.teacherEmails),
      h('label', { class: 'field' }, h('span', {}, 'โดเมนอีเมลมหาวิทยาลัยที่นักศึกษาใช้ล็อกอิน เช่น cmru.ac.th (จำเป็น — ว่าง = นักศึกษาเข้าไม่ได้)'), f.allowedDomains),
      h('label', { class: 'field' }, h('span', {}, 'เว็บไซต์ที่อัปโหลดได้ (origin) เช่น https://robinrood.github.io'), f.allowedOrigins),
      h('label', { class: 'field' }, h('span', {}, 'ขนาดไฟล์สูงสุดต่อไฟล์ (MB)'), f.uploadMaxMB)),
    h('section', { class: 'card form' },
      h('h2', {}, 'เกณฑ์เกรด (คะแนนรวมขั้นต่ำ)'),
      h('div', { class: 'row' }, cutoffs.map((c) => h('span', { class: 'row' }, c.g, '≥', c.min)))),
    h('section', { class: 'card form' },
      h('h2', {}, 'คะแนนการเข้าเรียนต่อครั้ง (0–1)'),
      h('div', { class: 'row' }, ['P', 'L', 'E', 'A'].map((k) => h('label', { class: 'check' }, MARK_LABEL[k], pts[k])))),
    h('div', { class: 'row' }, h('span', { class: 'spacer' }), actionButton('บันทึกการตั้งค่า', async () => {
      await call('updateSettings', {
        teacherEmails: lines(f.teacherEmails),
        allowedDomains: lines(f.allowedDomains),
        allowedOrigins: lines(f.allowedOrigins),
        uploadMaxMB: Number(f.uploadMaxMB.value),
        gradeCutoffs: cutoffs.map((c) => [c.g.value.trim(), Number(c.min.value)]),
        attendancePoints: Object.fromEntries(Object.entries(pts).map(([k, el]) => [k, Number(el.value)]))
      });
      toast('บันทึกการตั้งค่าแล้ว');
      await ctx.refreshMe();
    }, { class: 'primary' })),
    pinSection(s, () => settings(body, ctx)),
    ctx.course ? deleteCourseSection(ctx, s) : null));
}

const pinInput = (label) => h('input', {
  type: 'password', inputmode: 'numeric', autocomplete: 'new-password', maxlength: 8, placeholder: '4–8 หลัก', 'aria-label': label, style: 'width:9em'
});

/** PIN ที่ต้องใส่ทุกครั้งก่อนลบวิชา — เปลี่ยนต้องใส่ PIN เดิม */
function pinSection(s, reload) {
  const current = pinInput('PIN เดิม');
  const next = pinInput('PIN ใหม่');
  const again = pinInput('PIN ใหม่อีกครั้ง');
  return h('section', { class: 'card form' },
    h('h2', {}, 'PIN สำหรับลบข้อมูล'),
    h('p', { class: 'muted small' }, s.hasDeletePin
      ? 'ตั้ง PIN แล้ว — ต้องใส่ทุกครั้งที่ลบวิชา · ลืม PIN: ลบค่า deletePinHash ในแท็บ Settings ของ Google Sheet แล้วตั้งใหม่'
      : 'ยังไม่ได้ตั้ง PIN — ต้องตั้งก่อนจึงจะลบวิชาได้ (ตัวเลข 4–8 หลัก ระบบเก็บแบบเข้ารหัส ไม่มีใครเห็น PIN)'),
    h('div', { class: 'row' },
      s.hasDeletePin ? h('label', { class: 'field' }, h('span', {}, 'PIN เดิม'), current) : null,
      h('label', { class: 'field' }, h('span', {}, 'PIN ใหม่'), next),
      h('label', { class: 'field' }, h('span', {}, 'ใส่ PIN ใหม่อีกครั้ง'), again)),
    h('div', {}, actionButton(s.hasDeletePin ? 'เปลี่ยน PIN' : 'ตั้ง PIN', async () => {
      if (!/^\d{4,8}$/.test(next.value)) throw new Error('PIN ต้องเป็นตัวเลข 4–8 หลัก');
      if (next.value !== again.value) throw new Error('PIN ใหม่ทั้งสองช่องไม่ตรงกัน');
      await call('updateSettings', { deletePin: { current: current.value, next: next.value } });
      toast(s.hasDeletePin ? 'เปลี่ยน PIN แล้ว' : 'ตั้ง PIN แล้ว');
      reload();
    })));
}

function deleteCourseSection(ctx, s) {
  const c = ctx.course;
  return h('section', { class: 'card form danger-zone' },
    h('h2', {}, 'ลบวิชา'),
    h('p', { class: 'muted small' }, 'ลบวิชาที่เลือกอยู่และข้อมูลทั้งหมดของวิชานี้ออกจากระบบ — ย้อนกลับไม่ได้ (วิชาอื่นไม่กระทบ)'),
    h('div', {}, actionButton(`ลบวิชา ${c.courseCode}…`, async () => {
      if (!s.hasDeletePin) throw new Error('ตั้ง PIN สำหรับลบข้อมูลด้านบนก่อน');
      if (await deleteCourseForm(c)) await ctx.refreshMe();
    }, { class: 'danger' })));
}

async function deleteCourseForm(c) {
  const n = await call('deleteCourse', { courseCode: c.courseCode, preview: true });
  const pin = pinInput('PIN');
  const trash = h('input', { type: 'checkbox' });
  return modal(`ลบวิชา ${c.courseCode}`, h('div', { class: 'form' },
    h('p', {}, h('strong', {}, `${c.courseCode} ${c.title}`), ` · Sec ${c.section} · ภาค ${c.term}`),
    h('p', {}, 'ข้อมูลที่จะถูกลบถาวร:'),
    h('ul', { style: 'margin:0;padding-left:1.2rem' },
      h('li', {}, `รายชื่อนักศึกษา ${n.students} คน (บัญชีที่สมัครไว้ในวิชาอื่นยังอยู่)`),
      h('li', {}, `งาน ${n.assignments} งาน · งานที่ส่ง/ให้คะแนนแล้ว ${n.submissions} รายการ · กลุ่ม ${n.groups} กลุ่ม`),
      h('li', {}, 'การเช็คชื่อ คะแนนสอบ และสมุดคะแนนของวิชานี้')),
    h('p', { class: 'muted small' }, 'แนะนำ: ดาวน์โหลด Excel จากแท็บสมุดคะแนนเก็บไว้ก่อน'),
    h('label', { class: 'check' }, trash, `ย้ายไฟล์งานของวิชานี้ใน Google Drive ไปถังขยะด้วย (กู้คืนได้ภายใน 30 วัน) — ไม่ติ๊ก = ไฟล์ยังอยู่ใน Drive`),
    h('label', { class: 'field' }, h('span', {}, 'ใส่ PIN เพื่อยืนยัน'), pin)),
  [{
    label: 'ลบถาวร',
    class: 'danger',
    run: async () => {
      if (!pin.value) throw new Error('กรุณาใส่ PIN');
      const res = await call('deleteCourse', { courseCode: c.courseCode, pin: pin.value, trashFiles: trash.checked });
      toast(`ลบวิชา ${c.courseCode} แล้ว${res.filesTrashed ? ' · ย้ายไฟล์ไปถังขยะแล้ว' : ''}`);
    }
  }]);
}

import { h, mount, loading, errorBox, toast, actionButton, confirmBox, modal, fmtDate, fmtSize, fmtNum, toLocalInput, driveUrl, tabs, MARK_LABEL } from '../ui.js';
import { call } from '../api.js';

const TABS = [
  ['assignments', 'งาน'],
  ['grading', 'ตรวจงาน'],
  ['attendance', 'เช็คชื่อ'],
  ['exams', 'สอบ'],
  ['gradebook', 'สมุดคะแนน'],
  ['students', 'นักศึกษา'],
  ['settings', 'ตั้งค่า']
];

let gradingAssignment = null; // งานที่เลือกไว้ในแท็บตรวจงาน

export function renderTeacher(root, ctx) {
  const { course } = ctx;
  let tab = TABS.some(([k]) => k === ctx.tab) ? ctx.tab : 'assignments';
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
  const views = { assignments, grading, attendance, exams, gradebook, students, settings };
  views[tab](body, ctx).catch((e) => mount(body, errorBox(e)));
}

/* ---------- งาน ---------- */

async function assignments(body, ctx) {
  mount(body, loading());
  const list = await call('listAssignments', { courseCode: ctx.course.courseCode });
  const edit = async (a) => {
    const saved = await assignmentForm(ctx.course, a);
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
      h('div', { class: 'muted small' }, `กำหนดส่ง ${fmtDate(a.dueAt)} · เต็ม ${a.maxScore} · ${a.allowLate ? 'รับงานช้า' : 'ไม่รับงานช้า'}`),
      a.description ? h('p', { class: 'desc' }, a.description) : null,
      h('div', { class: 'row small', style: 'margin:.5rem 0' },
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

function assignmentForm(course, a) {
  const f = {
    title: h('input', { value: a?.title || '', required: true, maxlength: 200 }),
    description: h('textarea', { value: a?.description || '', placeholder: 'รายละเอียด / ไฟล์ที่ต้องส่ง' }),
    maxScore: h('input', { type: 'number', min: 1, step: 'any', value: a?.maxScore ?? 10 }),
    dueAt: h('input', { type: 'datetime-local', value: toLocalInput(a?.dueAt) }),
    allowLate: h('input', { type: 'checkbox', checked: a ? a.allowLate : true }),
    published: h('input', { type: 'checkbox', checked: a ? a.published : true })
  };
  const body = h('div', { class: 'form' },
    h('label', { class: 'field' }, h('span', {}, 'ชื่องาน'), f.title),
    h('label', { class: 'field' }, h('span', {}, 'รายละเอียด'), f.description),
    h('div', { class: 'form-2' },
      h('label', { class: 'field' }, h('span', {}, 'คะแนนเต็ม'), f.maxScore),
      h('label', { class: 'field' }, h('span', {}, 'กำหนดส่ง'), f.dueAt)),
    h('label', { class: 'check' }, f.allowLate, 'รับงานหลังกำหนด (ทำเครื่องหมายว่าส่งช้า)'),
    h('label', { class: 'check' }, f.published, 'แสดงให้นักศึกษาเห็น'));
  return modal(a ? 'แก้ไขงาน' : 'สร้างงานใหม่', body, [{
    label: 'บันทึก',
    run: async () => {
      await call('upsertAssignment', {
        id: a?.id, courseCode: course.courseCode, title: f.title.value, description: f.description.value,
        maxScore: Number(f.maxScore.value), dueAt: f.dueAt.value ? new Date(f.dueAt.value).toISOString() : '',
        allowLate: f.allowLate.checked, published: f.published.checked
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

  const draw = () => {
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

  pick.addEventListener('change', () => load().catch((e) => mount(holder, errorBox(e))));
  filter.addEventListener('change', () => data && draw());
  mount(body, h('div', { class: 'stack' }, h('div', { class: 'row' }, pick, filter), holder));
  await load();
}

/* ---------- เช็คชื่อ ---------- */

const CYCLE = ['', 'P', 'L', 'A', 'E'];

async function attendance(body, ctx) {
  mount(body, loading());
  const data = await call('getAttendance', { courseCode: ctx.course.courseCode });
  const rows = data.rows.map((r) => ({ ...r, marks: [...r.marks] }));
  let dirty = false;
  const holder = h('div');

  const draw = () => {
    mount(holder, h('div', { class: 'table-wrap' }, h('table', { class: 'att' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'รหัส'), h('th', {}, 'ชื่อ'),
        Array.from({ length: 16 }, (_, i) => h('th', {},
          h('button', {
            class: 'sm ghost', title: `สัปดาห์ ${i + 1}: ทำเครื่องหมาย "มา" ให้ทุกคนที่ยังว่าง`,
            onclick: () => { rows.forEach((r) => { if (!r.marks[i]) r.marks[i] = 'P'; }); dirty = true; draw(); }
          }, String(i + 1)))))),
      h('tbody', {}, rows.map((r) => h('tr', {},
        h('td', { class: 'nowrap' }, r.studentId),
        h('td', { class: 'nowrap' }, r.name),
        r.marks.map((m, i) => h('td', {}, h('button', {
          class: 'mark ' + m, title: MARK_LABEL[m], 'aria-label': `${r.studentId} สัปดาห์ ${i + 1}: ${MARK_LABEL[m]}`,
          onclick: () => { r.marks[i] = CYCLE[(CYCLE.indexOf(m) + 1) % CYCLE.length]; dirty = true; draw(); }
        }, m || '·')))))))));
  };

  window.onbeforeunload = () => (dirty ? true : undefined);
  mount(body, h('div', { class: 'stack' },
    h('div', { class: 'row' },
      h('div', { class: 'legend muted' }, 'คลิกช่องเพื่อเปลี่ยน:', ['P', 'L', 'A', 'E'].map((k) => h('span', {}, h('span', { class: 'mark btn ' + k }, k), ' ', MARK_LABEL[k]))),
      h('span', { class: 'spacer' }),
      actionButton('บันทึกการเช็คชื่อ', async () => {
        await call('saveAttendance', { courseCode: ctx.course.courseCode, rows: rows.map((r) => ({ studentId: r.studentId, marks: r.marks })) });
        dirty = false;
        toast('บันทึกการเช็คชื่อแล้ว');
      }, { class: 'primary' })),
    h('p', { class: 'muted small' }, 'คลิกเลขสัปดาห์ที่หัวตารางเพื่อให้ทุกคนที่ยังว่าง = มา · สัปดาห์ที่มีการเช็คชื่อแล้ว ช่องว่างจะนับเป็นขาด'),
    holder));
  draw();
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
    assignments: gb.assignments.map((a) => ({ score: s.scores[a.id], maxScore: a.maxScore, overdue: a.overdue })),
    midterm: s.exams.midterm, maxMidterm: gb.course.maxMidterm, final: s.exams.final, maxFinal: gb.course.maxFinal
  });

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
          gb.assignments.map((a) => h('th', { class: 'num', title: a.title }, `${a.title.slice(0, 14)} (/${a.maxScore})`)),
          Grade.PARTS.map((k) => h('th', { class: 'num' }, `${labels[k]} ${weights[k]}%`)),
          h('th', { class: 'num' }, 'รวม'), h('th', {}, 'เกรด'))),
        h('tbody', {}, results.map(({ s, r }) => h('tr', {},
          h('td', { class: 'nowrap' }, s.studentId), h('td', { class: 'nowrap' }, s.name),
          gb.assignments.map((a) => h('td', { class: 'num' }, fmtNum(s.scores[a.id]))),
          Grade.PARTS.map((k) => h('td', { class: 'num' }, fmtNum(r.parts[k].points))),
          h('td', { class: 'num' }, h('strong', {}, fmtNum(r.total))),
          h('td', {}, h('span', { class: 'chip accent' }, r.grade)))))))));
    return results;
  };

  const weightInputs = Grade.PARTS.map((k) => h('label', { class: 'field' }, h('span', {}, labels[k] + ' (%)'),
    h('input', { type: 'number', min: 0, step: 'any', value: weights[k], oninput: (e) => { weights[k] = Number(e.target.value) || 0; draw(); } })));

  const exportXlsx = async () => {
    const XLSX = await loadXlsx();
    const head = ['รหัส', 'ชื่อ', 'หมู่เรียน', ...gb.assignments.map((a) => `${a.title} (/${a.maxScore})`),
      ...Grade.PARTS.map((k) => `${labels[k]} (${weights[k]}%)`), 'รวม', 'เกรด'];
    const rows = gb.students.map((s) => {
      const r = compute(s);
      return [s.studentId, s.name, s.group, ...gb.assignments.map((a) => s.scores[a.id] ?? ''),
        ...Grade.PARTS.map((k) => r.parts[k].points ?? ''), r.total, r.grade];
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
        actionButton('ดาวน์โหลด Excel', exportXlsx),
        actionButton('บันทึกการตั้งค่า', async () => {
          await call('updateCourse', { courseCode: gb.course.courseCode, weights, gradesVisible: visible.checked });
          toast('บันทึกแล้ว');
          await ctx.refreshMe();
        }, { class: 'primary' })),
      h('p', { class: 'muted small' }, 'งานที่ยังไม่ถึงกำหนดและยังไม่ได้ให้คะแนนจะยังไม่นับ · งานที่เลยกำหนดแต่ไม่ส่ง = 0 · เกณฑ์เกรดแก้ได้ที่แท็บตั้งค่า')),
    holder));
  draw();
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
    }, { class: 'primary' }))));
}

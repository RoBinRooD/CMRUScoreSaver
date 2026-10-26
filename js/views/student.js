import { h, mount, loading, errorBox, toast, actionButton, confirmBox, modal, fmtDate, fmtSize, fmtNum, driveUrl, tabs, MARK_LABEL } from '../ui.js';
import { call } from '../api.js';
import { uploadFile } from '../upload.js';
import { studentDashboard } from './dashboard.js';
import { renderSyllabus } from './syllabus.js';
import { renderTimeline } from './timeline.js';
import { renderBoard } from './board.js';
import { studentLeaves } from './leave.js';

const TABS = [
  ['overview', 'ภาพรวม'],
  ['syllabus', 'Syllabus'],
  ['work', 'งานที่ต้องส่ง'],
  ['timeline', 'Timeline'],
  ['board', 'บอร์ดกลุ่ม'],
  ['leave', 'ใบลา'],
  ['grades', 'คะแนนของฉัน']
];

export function renderStudent(root, ctx) {
  const { me, course } = ctx;
  if (me.needsBinding) return renderBind(root, ctx);
  if (!course) {
    return mount(root, h('div', { class: 'card' },
      h('h2', {}, 'ยังไม่มีวิชา'),
      h('p', { class: 'muted' }, `รหัส ${me.studentId} ยังไม่อยู่ในรายชื่อวิชาใด กรุณาติดต่ออาจารย์`)));
  }
  const tab = TABS.some(([k]) => k === ctx.tab) ? ctx.tab : 'overview';
  const body = h('div');
  mount(root,
    h('div', { class: 'row', style: 'margin-bottom:.5rem' },
      h('div', {},
        h('h1', {}, course.title),
        h('div', { class: 'muted small' }, `${course.courseCode} · Sec ${course.section} · ภาค ${course.term} · ${course.schedule}`))),
    tabs(TABS, tab, ctx.setTab),
    body);
  const views = {
    overview: () => studentDashboard(body, ctx),
    syllabus: () => renderSyllabus(body, ctx),
    work: () => renderWork(body, course, me.studentId),
    timeline: () => renderTimeline(body, ctx),
    board: () => renderBoard(body, ctx),
    leave: () => studentLeaves(body, ctx),
    grades: () => renderGrades(body, course)
  };
  Promise.resolve(views[tab]()).catch((e) => mount(body, errorBox(e)));
}

/* ---------- สมัครเข้าใช้งาน ---------- */

function renderBind(root, ctx) {
  const reg = ctx.me.registration;
  if (reg && reg.name) return renderConfirm(root, ctx, reg);
  if (reg && reg.notFound) {
    return mount(root, h('div', { class: 'signin' }, h('div', { class: 'card form' },
      h('h1', {}, 'ยังไม่พบรายชื่อ'),
      h('p', {}, 'รหัส ', h('strong', {}, reg.studentId), ' (', ctx.me.email, ') ยังไม่อยู่ในรายชื่อวิชาใด'),
      h('p', { class: 'muted' }, 'กรุณาแจ้งอาจารย์ให้นำเข้า/เพิ่มรายชื่อ แล้วกลับมาที่หน้านี้อีกครั้ง'),
      actionButton('ลองใหม่', () => ctx.refreshMe(), { class: 'primary' }))));
  }
  const f = {
    studentId: h('input', { inputmode: 'numeric', autocomplete: 'off', placeholder: 'เช่น 67152901', maxlength: 13, required: true }),
    firstName: h('input', { autocomplete: 'given-name', placeholder: 'ไม่ต้องใส่คำนำหน้า', required: true }),
    lastName: h('input', { autocomplete: 'family-name', required: true }),
    nickname: h('input', { maxlength: 50 }),
    phone: h('input', { type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: 15 })
  };
  const field = (label, el) => h('label', { class: 'field' }, h('span', {}, label), el);
  mount(root, h('div', { class: 'signin', style: 'text-align:left' }, h('form', {
    class: 'card form',
    onsubmit: (e) => e.preventDefault()
  },
  h('h1', {}, 'สมัครเข้าใช้งาน'),
  h('p', { class: 'muted' }, 'กรอกรหัสและชื่อ-นามสกุลให้ตรงกับใบรายชื่อลงทะเบียนของมหาวิทยาลัย ระบบจะผูกรหัสนี้กับบัญชี ',
    h('strong', {}, ctx.me.email), ' (สมัครได้ครั้งเดียว)'),
  field('รหัสนักศึกษา *', f.studentId),
  h('div', { class: 'form-2' }, field('ชื่อ *', f.firstName), field('นามสกุล *', f.lastName)),
  h('div', { class: 'form-2' }, field('ชื่อเล่น', f.nickname), field('เบอร์โทร', f.phone)),
  actionButton('สมัคร', async () => {
    const data = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]));
    if (!/^\d{8,13}$/.test(data.studentId)) throw new Error('รหัสนักศึกษาต้องเป็นตัวเลข 8–13 หลัก');
    if (!data.firstName || !data.lastName) throw new Error('กรุณากรอกชื่อและนามสกุล');
    const me = await call('register', data);
    toast(`สมัครสำเร็จ — ${me.courses.map((c) => c.courseCode).join(', ')}`);
    await ctx.refreshMe();
  }, { class: 'primary', type: 'submit' }),
  h('p', { class: 'muted small' }, 'ไม่พบชื่อ? อาจลงทะเบียนเรียนช้าหรือยังไม่อยู่ในรายชื่อ — แจ้งอาจารย์ให้เพิ่มรายชื่อ'))));
}

/** อีเมลเป็น <รหัส>@cmru.ac.th และรหัสอยู่ในรายชื่อ → แค่ยืนยัน */
function renderConfirm(root, ctx, reg) {
  const nickname = h('input', { maxlength: 50 });
  const phone = h('input', { type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: 15 });
  const field = (label, el) => h('label', { class: 'field' }, h('span', {}, label), el);
  mount(root, h('div', { class: 'signin', style: 'text-align:left' }, h('form', {
    class: 'card form',
    onsubmit: (e) => e.preventDefault()
  },
  h('h1', {}, 'ยืนยันการสมัคร'),
  h('p', { class: 'muted' }, 'ระบบพบรหัสของคุณในรายชื่อลงทะเบียน'),
  h('div', { class: 'feedback' },
    h('div', { style: 'font-size:1.1rem;font-weight:600' }, reg.name),
    h('div', { class: 'muted small' }, `รหัส ${reg.studentId} · ${ctx.me.email}`),
    h('ul', { class: 'small', style: 'margin:.5rem 0 0;padding-left:1.2rem' },
      reg.courses.map((c) => h('li', {}, `${c.courseCode} ${c.title}`)))),
  reg.takenByOther ? h('div', { class: 'banner' }, 'รหัสนี้ถูกผูกกับบัญชีอื่นไว้ กรุณาติดต่ออาจารย์ให้รีเซ็ต') : null,
  h('div', { class: 'form-2' }, field('ชื่อเล่น (ไม่บังคับ)', nickname), field('เบอร์โทร (ไม่บังคับ)', phone)),
  actionButton('ยืนยันสมัคร', async () => {
    await call('register', { nickname: nickname.value.trim(), phone: phone.value.trim() });
    toast('สมัครสำเร็จ');
    await ctx.refreshMe();
  }, { class: 'primary', type: 'submit', disabled: reg.takenByOther }),
  h('p', { class: 'muted small' }, 'ถ้าชื่อไม่ใช่คุณ ให้ออกจากระบบแล้วเข้าด้วยบัญชี <รหัสนักศึกษา>@cmru.ac.th ของคุณเอง'))));
}

/* ---------- งาน ---------- */

function statusChip(a) {
  const s = a.submission;
  if (s && s.score !== null) return h('span', { class: 'chip ok' }, `ตรวจแล้ว ${fmtNum(s.score)}/${a.maxScore}`);
  if (s && s.submittedAt) return h('span', { class: 'chip ' + (s.isLate ? 'warn' : 'info') }, s.isLate ? 'ส่งช้า' : 'ส่งแล้ว');
  if (a.overdue) return h('span', { class: 'chip bad' }, a.allowLate ? 'เลยกำหนด (ยังส่งได้)' : 'เลยกำหนด');
  return h('span', { class: 'chip' }, 'ยังไม่ส่ง');
}

async function renderWork(body, course, myId) {
  mount(body, loading());
  let list;
  try {
    list = await call('myAssignments', { courseCode: course.courseCode });
  } catch (e) {
    return mount(body, errorBox(e));
  }
  if (!list.length) return mount(body, h('p', { class: 'muted center pad' }, 'ยังไม่มีงานในวิชานี้'));
  const reload = () => renderWork(body, course, myId);
  mount(body, h('div', { class: 'grid' }, list.map((a) => assignmentCard(a, myId, reload))));
}

function assignmentCard(a, myId, reload) {
  const card = h('article', { class: 'card' });
  const draw = () => {
    const s = a.submission;
    const locked = (s && s.score !== null) || (a.overdue && !a.allowLate);
    const needsGroup = a.groupMax && !a.group;
    mount(card,
      h('div', { class: 'card-head' },
        h('h3', {}, a.title),
        h('span', { class: 'spacer' }),
        a.groupMax ? h('span', { class: 'chip accent' }, `งานกลุ่ม ≤${a.groupMax} คน`) : null,
        statusChip(a)),
      h('div', { class: 'muted small' }, `กำหนดส่ง ${fmtDate(a.dueAt)} · คะแนนเต็ม ${a.maxScore}`),
      a.description ? h('p', { class: 'desc' }, a.description) : null,
      a.groupMax ? groupBox(a, myId, locked, reload) : null,
      s && s.feedback ? h('div', { class: 'feedback' }, h('strong', {}, 'ความเห็นอาจารย์: '), s.feedback) : null,
      fileList(a, locked, (next) => { a.submission = next; draw(); }),
      s && s.link ? h('p', { class: 'small' }, 'ลิงก์: ', h('a', { href: s.link, target: '_blank', rel: 'noopener' }, s.link)) : null,
      s && s.submittedAt ? h('p', { class: 'muted small' }, 'ส่งล่าสุด ' + fmtDate(s.submittedAt)) : null,
      locked || needsGroup ? null : uploader(a, (next) => { a.submission = next; draw(); }));
  };
  draw();
  return card;
}

/* ---------- งานกลุ่ม ---------- */

function groupBox(a, myId, locked, reload) {
  const g = a.group;
  if (!g) {
    return h('div', { class: 'feedback stack' },
      h('div', {}, h('strong', {}, 'ยังไม่มีกลุ่ม'), ' — สร้างกลุ่มแล้วเลือกเพื่อน หรือให้เพื่อนที่สร้างกลุ่มแล้วเพิ่มคุณเข้ากลุ่ม'),
      locked ? null : h('div', {}, actionButton('สร้างกลุ่ม', async () => { if (await groupForm(a, myId, null)) reload(); }, { class: 'primary sm' })));
  }
  return h('div', { class: 'feedback' },
    h('div', { class: 'row' },
      h('strong', {}, 'กลุ่ม ', g.name),
      h('span', { class: 'muted small' }, `${g.members.length}/${a.groupMax} คน`),
      h('span', { class: 'spacer' }),
      locked ? null : actionButton('แก้ไขกลุ่ม', async () => { if (await groupForm(a, myId, g)) reload(); }, { class: 'sm' }),
      locked ? null : actionButton('ออกจากกลุ่ม', async () => {
        if (!(await confirmBox(`ออกจากกลุ่ม "${g.name}"? งานที่กลุ่มส่งไว้จะไม่ใช่งานของคุณแล้ว`, 'ออกจากกลุ่ม', 'danger'))) return;
        await call('leaveGroup', { assignmentId: a.id });
        toast('ออกจากกลุ่มแล้ว');
        reload();
      }, { class: 'sm ghost danger' })),
    h('ul', { class: 'small', style: 'margin:.35rem 0 0;padding-left:1.2rem' },
      g.members.map((m) => h('li', {}, `${m.studentId} ${m.name}`))),
    h('div', { class: 'muted small' }, 'ไฟล์ที่ส่งเป็นของทั้งกลุ่ม — สมาชิกทุกคนเห็นและแก้ไขได้'));
}

/** สร้าง/แก้กลุ่ม: ตั้งชื่อ + เลือกเพื่อนที่ยังไม่มีกลุ่ม (ตัวเองอยู่ในกลุ่มเสมอ) */
async function groupForm(a, myId, g) {
  const opts = await call('groupOptions', { assignmentId: a.id });
  const name = h('input', { value: g?.name || '', maxlength: 100, placeholder: 'เช่น ทีมกาแฟ' });
  const count = h('span', { class: 'muted small' });
  const boxes = opts.students.filter((s) => s.studentId !== myId).map((s) => {
    const mine = g ? s.groupId === g.id : false;
    const taken = !!s.groupId && !mine;
    const input = h('input', { type: 'checkbox', checked: mine, disabled: taken, value: s.studentId });
    return { s, input, taken, row: h('label', { class: 'check' + (taken ? ' muted' : '') }, input,
      `${s.studentId} ${s.name}`, taken ? h('span', { class: 'chip' }, s.groupName) : null) };
  });
  const sync = () => {
    const n = boxes.filter((b) => b.input.checked).length + 1;
    count.textContent = `${n}/${opts.groupMax} คน (รวมคุณ)`;
    boxes.forEach((b) => { if (!b.taken) b.input.disabled = !b.input.checked && n >= opts.groupMax; });
  };
  boxes.forEach((b) => b.input.addEventListener('change', sync));
  sync();
  return modal(g ? 'แก้ไขกลุ่ม' : 'สร้างกลุ่ม', h('div', { class: 'form' },
    h('label', { class: 'field' }, h('span', {}, 'ชื่อกลุ่ม'), name),
    h('div', { class: 'row' }, h('strong', {}, 'สมาชิก'), h('span', { class: 'spacer' }), count),
    h('div', { class: 'pick-list' }, boxes.map((b) => b.row)),
    h('p', { class: 'muted small' }, 'คนที่อยู่กลุ่มอื่นแล้วเลือกไม่ได้ — ให้เขาออกจากกลุ่มเดิมก่อน')),
  [{
    label: 'บันทึก',
    run: async () => {
      await call('saveGroup', {
        assignmentId: a.id, groupId: g?.id, name: name.value.trim(),
        members: boxes.filter((b) => b.input.checked).map((b) => b.s.studentId)
      });
      toast(g ? 'บันทึกกลุ่มแล้ว' : 'สร้างกลุ่มแล้ว');
    }
  }]);
}

function fileList(a, locked, onChange) {
  const files = a.submission?.files || [];
  if (!files.length) return null;
  return h('ul', { class: 'files' }, files.map((f) => h('li', {},
    h('span', { 'aria-hidden': 'true' }, '📄'),
    h('a', { href: driveUrl(f.id), target: '_blank', rel: 'noopener', title: f.name }, f.name),
    h('span', { class: 'muted small' }, fmtSize(f.size)),
    locked ? null : actionButton('ลบ', async () => {
      if (!(await confirmBox(`ลบไฟล์ ${f.name}?`, 'ลบ', 'danger'))) return;
      onChange(await call('removeFile', { assignmentId: a.id, fileId: f.id }));
      toast('ลบไฟล์แล้ว');
    }, { class: 'sm ghost danger' }))));
}

function uploader(a, onChange) {
  const queue = h('div', { class: 'stack' });
  const input = h('input', { type: 'file', multiple: true, class: 'hidden' });
  const drop = h('div', { class: 'drop', tabindex: 0, role: 'button' },
    h('div', {}, 'ลากไฟล์มาวาง หรือ ', h('u', {}, 'เลือกไฟล์')),
    h('div', { class: 'small' }, 'ส่งได้หลายไฟล์ ไฟล์ใหญ่ได้ (อัปโหลดเข้า Google Drive ของอาจารย์)'));

  let busy = false;
  const send = async (files) => {
    if (busy || !files.length) return;
    busy = true;
    for (const file of files) {
      const bar = h('div');
      const label = h('span', {}, `${file.name} (${fmtSize(file.size)})`);
      const pct = h('span', { class: 'muted' }, '0%');
      const item = h('div', { class: 'upload-item' }, h('div', { class: 'row' }, label, h('span', { class: 'spacer' }), pct), h('div', { class: 'progress' }, bar));
      queue.append(item);
      try {
        if (!file.size) throw new Error('ไฟล์ว่างเปล่า');
        const sub = await uploadFile(file, a.id, (p) => {
          bar.style.width = (p * 100).toFixed(1) + '%';
          pct.textContent = Math.floor(p * 100) + '%';
        });
        item.remove();
        onChange(sub);
        toast('อัปโหลด ' + file.name + ' สำเร็จ');
      } catch (e) {
        pct.textContent = 'ไม่สำเร็จ';
        pct.className = 'chip bad';
        toast(file.name + ': ' + e.message, 'bad');
      }
    }
    busy = false;
  };

  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && input.click());
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); send([...e.dataTransfer.files]); });
  input.addEventListener('change', () => { send([...input.files]); input.value = ''; });

  const link = h('input', { type: 'url', placeholder: 'หรือแปะลิงก์ (https://…) เช่น YouTube, Behance', value: a.submission?.link || '', style: 'flex:1' });
  return h('div', { class: 'stack', style: 'margin-top:.75rem' },
    drop, input, queue,
    h('div', { class: 'row' }, link, actionButton('บันทึกลิงก์', async () => {
      onChange(await call('submitLink', { assignmentId: a.id, link: link.value.trim() }));
      toast('บันทึกลิงก์แล้ว');
    })));
}

/* ---------- คะแนน ---------- */

async function renderGrades(body, course) {
  mount(body, loading());
  let g;
  try {
    g = await call('myGrades', { courseCode: course.courseCode });
  } catch (e) {
    return mount(body, errorBox(e));
  }
  const w = g.course.weights;
  const part = (key, label) => {
    const p = g.parts[key];
    return h('div', { class: 'stat' },
      h('div', { class: 'label' }, `${label} (${w[key]}%)`),
      h('div', { class: 'value' }, p.points === null ? '-' : fmtNum(p.points)),
      h('div', { class: 'muted small' }, p.pct === null ? 'ยังไม่มีคะแนน' : `${fmtNum(p.pct)}%`));
  };

  mount(body, h('div', { class: 'stack' },
    h('div', { class: 'stats' },
      h('div', { class: 'stat' },
        h('div', { class: 'label' }, 'เกรด'),
        g.grade ? h('div', { class: 'bigGrade' }, g.grade) : h('div', { class: 'muted' }, 'อาจารย์ยังไม่ประกาศ'),
        g.total !== null ? h('div', { class: 'muted small' }, `รวม ${fmtNum(g.total)} คะแนน`) : null),
      part('attendance', 'เข้าเรียน'),
      part('assignments', 'งาน'),
      part('midterm', 'กลางภาค'),
      part('final', 'ปลายภาค')),

    h('section', { class: 'card' },
      h('h2', {}, 'คะแนนงาน'),
      g.assignments.length ? h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'งาน'), h('th', {}, 'กำหนดส่ง'), h('th', {}, 'สถานะ'), h('th', { class: 'num' }, 'คะแนน'))),
        h('tbody', {}, g.assignments.map((a) => h('tr', {},
          h('td', {}, a.title, a.feedback ? h('div', { class: 'muted small' }, a.feedback) : null),
          h('td', { class: 'nowrap' }, fmtDate(a.dueAt)),
          h('td', {}, a.submitted ? h('span', { class: 'chip info' }, 'ส่งแล้ว') : a.overdue ? h('span', { class: 'chip bad' }, 'ไม่ได้ส่ง') : h('span', { class: 'chip' }, 'ยังไม่ส่ง')),
          h('td', { class: 'num' }, a.score === null ? '-' : `${fmtNum(a.score)} / ${a.maxScore}`))))))
        : h('p', { class: 'muted' }, 'ยังไม่มีงาน')),

    h('section', { class: 'card' },
      h('h2', {}, 'การเข้าเรียน'),
      h('div', { class: 'legend muted' }, Object.entries({ P: 'มา', L: 'สาย', E: 'ลา', A: 'ขาด' }).map(([k, v]) => h('span', {}, h('span', { class: 'chip' }, k), ' ', v))),
      h('div', { class: 'table-wrap', style: 'margin-top:.5rem' }, h('table', { class: 'att' },
        h('thead', {}, h('tr', {}, Array.from({ length: 16 }, (_, i) => h('th', {}, 'ส.' + (i + 1))))),
        h('tbody', {}, h('tr', {}, g.attendance.marks.map((m, i) => {
          // สัปดาห์ที่ยังไม่เช็คชื่อ แสดงเฉพาะ "ลา" จากใบลาที่อนุมัติแล้ว
          const held = g.attendance.heldWeeks.includes(i + 1);
          const mk = held ? m || 'A' : m === 'E' ? 'E' : '';
          return h('td', {}, h('span', { class: 'mark btn ' + mk, title: MARK_LABEL[mk] }, mk || '·'));
        })))))),

    h('section', { class: 'card' },
      h('h2', {}, 'คะแนนสอบ'),
      h('p', {}, `กลางภาค: ${fmtNum(g.exams.midterm)} / ${g.exams.maxMidterm}`),
      h('p', {}, `ปลายภาค: ${fmtNum(g.exams.final)} / ${g.exams.maxFinal}`))));
}

import { h, mount, loading, errorBox, toast, actionButton, confirmBox, fmtDate, fmtSize, fmtNum, driveUrl, tabs, MARK_LABEL } from '../ui.js';
import { call } from '../api.js';
import { uploadFile } from '../upload.js';

export function renderStudent(root, ctx) {
  const { me, course } = ctx;
  if (me.needsBinding) return renderBind(root, ctx);
  if (!course) {
    return mount(root, h('div', { class: 'card' },
      h('h2', {}, 'ยังไม่มีวิชา'),
      h('p', { class: 'muted' }, `รหัส ${me.studentId} ยังไม่อยู่ในรายชื่อวิชาใด กรุณาติดต่ออาจารย์`)));
  }
  const tab = ['work', 'grades'].includes(ctx.tab) ? ctx.tab : 'work';
  const body = h('div');
  mount(root,
    h('div', { class: 'row', style: 'margin-bottom:.5rem' },
      h('div', {},
        h('h1', {}, course.title),
        h('div', { class: 'muted small' }, `${course.courseCode} · Sec ${course.section} · ภาค ${course.term} · ${course.schedule}`))),
    tabs([['work', 'งานที่ต้องส่ง'], ['grades', 'คะแนนของฉัน']], tab, ctx.setTab),
    body);
  if (tab === 'grades') renderGrades(body, course);
  else renderWork(body, course);
}

/* ---------- สมัครเข้าใช้งาน ---------- */

function renderBind(root, ctx) {
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

/* ---------- งาน ---------- */

function statusChip(a) {
  const s = a.submission;
  if (s && s.score !== null) return h('span', { class: 'chip ok' }, `ตรวจแล้ว ${fmtNum(s.score)}/${a.maxScore}`);
  if (s && s.submittedAt) return h('span', { class: 'chip ' + (s.isLate ? 'warn' : 'info') }, s.isLate ? 'ส่งช้า' : 'ส่งแล้ว');
  if (a.overdue) return h('span', { class: 'chip bad' }, a.allowLate ? 'เลยกำหนด (ยังส่งได้)' : 'เลยกำหนด');
  return h('span', { class: 'chip' }, 'ยังไม่ส่ง');
}

async function renderWork(body, course) {
  mount(body, loading());
  let list;
  try {
    list = await call('myAssignments', { courseCode: course.courseCode });
  } catch (e) {
    return mount(body, errorBox(e));
  }
  if (!list.length) return mount(body, h('p', { class: 'muted center pad' }, 'ยังไม่มีงานในวิชานี้'));
  mount(body, h('div', { class: 'grid' }, list.map((a) => assignmentCard(a))));
}

function assignmentCard(a) {
  const card = h('article', { class: 'card' });
  const draw = () => {
    const s = a.submission;
    const locked = (s && s.score !== null) || (a.overdue && !a.allowLate);
    mount(card,
      h('div', { class: 'card-head' },
        h('h3', {}, a.title),
        h('span', { class: 'spacer' }),
        statusChip(a)),
      h('div', { class: 'muted small' }, `กำหนดส่ง ${fmtDate(a.dueAt)} · คะแนนเต็ม ${a.maxScore}`),
      a.description ? h('p', { class: 'desc' }, a.description) : null,
      s && s.feedback ? h('div', { class: 'feedback' }, h('strong', {}, 'ความเห็นอาจารย์: '), s.feedback) : null,
      fileList(a, locked, (next) => { a.submission = next; draw(); }),
      s && s.link ? h('p', { class: 'small' }, 'ลิงก์: ', h('a', { href: s.link, target: '_blank', rel: 'noopener' }, s.link)) : null,
      s && s.submittedAt ? h('p', { class: 'muted small' }, 'ส่งล่าสุด ' + fmtDate(s.submittedAt)) : null,
      locked ? null : uploader(a, (next) => { a.submission = next; draw(); }));
  };
  draw();
  return card;
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
          const held = g.attendance.heldWeeks.includes(i + 1);
          const mk = held ? m || 'A' : '';
          return h('td', {}, h('span', { class: 'mark btn ' + mk, title: MARK_LABEL[mk] }, held ? mk : '·'));
        })))))),

    h('section', { class: 'card' },
      h('h2', {}, 'คะแนนสอบ'),
      h('p', {}, `กลางภาค: ${fmtNum(g.exams.midterm)} / ${g.exams.maxMidterm}`),
      h('p', {}, `ปลายภาค: ${fmtNum(g.exams.final)} / ${g.exams.maxFinal}`))));
}

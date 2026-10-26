// บอร์ดกลุ่ม — ป้ายของทุกกลุ่ม · กดป้ายกลุ่มตัวเองเพื่อวางแผนงานแบบ Kanban (อาจารย์ดูได้ทุกกลุ่ม)
import { h, mount, loading, errorBox, toast, actionButton, confirmBox, modal, fmtDate, fmtDay, fmtLeft, toLocalInput } from '../ui.js';
import { call } from '../api.js';

const COLS = [['todo', 'ต้องทำ'], ['doing', 'กำลังทำ'], ['done', 'เสร็จแล้ว']];

let openGroup = null; // { course, id } กลุ่มที่เปิดอยู่ — กลับมาที่แท็บนี้แล้วยังอยู่หน้าเดิม

export async function renderBoard(body, ctx) {
  if (openGroup && openGroup.course === ctx.course.courseCode) return renderKanban(body, ctx, openGroup.id);
  openGroup = null;
  mount(body, loading());
  let list;
  try {
    list = await call('boardGroups', { courseCode: ctx.course.courseCode });
  } catch (e) {
    return mount(body, errorBox(e));
  }
  const teacher = ctx.me.role === 'teacher';
  if (!list.length) {
    return mount(body, h('p', { class: 'muted center pad' }, teacher ? 'ยังไม่มีงานกลุ่ม — สร้างงานแล้วติ๊ก "งานกลุ่ม"' : 'วิชานี้ยังไม่มีงานกลุ่ม'));
  }
  const open = (g) => { openGroup = { course: ctx.course.courseCode, id: g.id }; renderKanban(body, ctx, g.id); };
  mount(body, h('div', { class: 'stack' },
    h('p', { class: 'muted small' }, teacher
      ? 'กดป้ายกลุ่มเพื่อดูแผนงานของกลุ่ม (ดูอย่างเดียว)'
      : 'กดป้ายกลุ่มของคุณเพื่อวางแผนงาน — แผนงานเห็นเฉพาะสมาชิกในกลุ่มและอาจารย์'),
    list.map((x) => {
      const mine = x.groups.find((g) => g.mine);
      return h('section', { class: 'stack' },
        h('div', { class: 'row' },
          h('h2', { style: 'margin:0' }, x.assignment.title),
          h('span', { class: 'chip accent' }, `≤${x.assignment.groupMax} คน`),
          h('span', { class: 'muted small' }, x.assignment.dueAt ? `ส่ง ${fmtDate(x.assignment.dueAt)} · ${fmtLeft(x.assignment.dueAt)}` : 'ไม่มีกำหนดส่ง'),
          h('span', { class: 'spacer' }),
          h('span', { class: 'muted small' }, `${x.groups.length} กลุ่ม${x.ungrouped ? ` · ยังไม่มีกลุ่ม ${x.ungrouped} คน` : ''}`)),
        !teacher && !mine ? h('div', { class: 'banner' }, 'คุณยังไม่มีกลุ่มในงานนี้ — สร้างหรือเข้ากลุ่มได้ที่แท็บ ',
          h('button', { class: 'sm', onclick: () => ctx.setTab('work') }, 'งานที่ต้องส่ง')) : null,
        x.groups.length ? h('div', { class: 'board-grid' }, x.groups
          .slice().sort((a, b) => Number(b.mine) - Number(a.mine))
          .map((g) => groupCard(g, teacher || g.mine ? () => open(g) : null)))
          : h('p', { class: 'muted' }, 'ยังไม่มีกลุ่ม'));
    })));
}

function groupCard(g, onOpen) {
  const total = g.counts ? g.counts.todo + g.counts.doing + g.counts.done : 0;
  const kids = [
    h('div', { class: 'card-head' },
      h('h3', {}, g.name),
      h('span', { class: 'spacer' }),
      g.mine ? h('span', { class: 'chip accent' }, 'กลุ่มของฉัน') : null,
      h('span', { class: 'chip ' + (g.submitted ? 'info' : '') }, g.submitted ? 'ส่งงานแล้ว' : 'ยังไม่ส่ง')),
    h('div', { class: 'avatars' }, g.members.map((m) => h('span', { class: 'avatar', title: `${m.studentId} ${m.name}` }, initials(m.name)))),
    h('div', { class: 'muted small' }, g.members.map((m) => m.name.replace(/^(นางสาว|นาง|นาย)/, '')).join(', ')),
    g.counts
      ? h('div', { class: 'stack', style: 'gap:.3rem' },
        h('div', { class: 'small' }, total ? `ต้องทำ ${g.counts.todo} · กำลังทำ ${g.counts.doing} · เสร็จ ${g.counts.done}` : 'ยังไม่มีแผนงาน'),
        total ? h('div', { class: 'meter', role: 'meter', 'aria-label': 'งานย่อยที่เสร็จ', 'aria-valuenow': g.counts.done, 'aria-valuemax': total },
          h('div', { style: `width:${(g.counts.done / total) * 100}%` })) : null)
      : h('div', { class: 'muted small' }, '🔒 แผนงานเห็นเฉพาะสมาชิกกลุ่ม')
  ];
  return onOpen
    ? h('button', { class: 'card group-card clickable', onclick: onOpen, 'aria-label': `เปิดบอร์ดกลุ่ม ${g.name}` }, kids)
    : h('article', { class: 'card group-card' }, kids);
}

function initials(name) {
  const clean = String(name).replace(/^(นางสาว|นาง|นาย|น\.ส\.)\s*/, '').trim();
  return clean.slice(0, 2) || '?';
}

/* ---------- Kanban ---------- */

async function renderKanban(body, ctx, groupId) {
  mount(body, loading());
  let b;
  try {
    b = await call('groupBoard', { groupId });
  } catch (e) {
    openGroup = null;
    return mount(body, errorBox(e), h('button', { onclick: () => renderBoard(body, ctx) }, '← กลับ'));
  }
  const back = () => { openGroup = null; renderBoard(body, ctx); };
  const names = Object.fromEntries(b.group.members.map((m) => [m.studentId, m.name.replace(/^(นางสาว|นาง|นาย)/, '')]));
  const holder = h('div', { class: 'kanban' });

  const save = async (patch) => {
    b = await call('saveTask', { groupId, ...patch });
    draw();
  };

  const card = (t) => {
    const overdue = t.dueAt && t.status !== 'done' && new Date(t.dueAt) < Date.now();
    const idx = COLS.findIndex(([k]) => k === t.status);
    const el = h('div', {
      class: 'task', draggable: b.canEdit ? 'true' : null, tabindex: 0, role: b.canEdit ? 'button' : null,
      'aria-label': `${t.title}${t.assignee ? ' ผู้รับผิดชอบ ' + (names[t.assignee] || t.assignee) : ''}`,
      onclick: (e) => { if (b.canEdit && !e.target.closest('button')) taskForm(b, names, t, save, remove); },
      onkeydown: (e) => { if (b.canEdit && e.key === 'Enter' && e.target === el) taskForm(b, names, t, save, remove); }
    },
    h('div', { class: 'task-title' }, t.title),
    t.note ? h('div', { class: 'muted small task-note' }, t.note) : null,
    h('div', { class: 'row small', style: 'gap:.35rem' },
      t.assignee ? h('span', { class: 'chip' }, '👤 ', names[t.assignee] || 'ออกจากกลุ่มแล้ว') : h('span', { class: 'muted' }, 'ยังไม่มีคนรับ'),
      t.dueAt ? h('span', { class: 'chip ' + (overdue ? 'bad' : ''), title: fmtDate(t.dueAt) }, '📅 ', fmtDay(t.dueAt), overdue ? ' · เลยกำหนด' : '') : null,
      h('span', { class: 'spacer' }),
      b.canEdit && idx > 0 ? actionButton('←', () => save({ id: t.id, status: COLS[idx - 1][0] }), { class: 'sm ghost', 'aria-label': 'ย้ายไป ' + COLS[idx - 1][1] }) : null,
      b.canEdit && idx < COLS.length - 1 ? actionButton('→', () => save({ id: t.id, status: COLS[idx + 1][0] }), { class: 'sm ghost', 'aria-label': 'ย้ายไป ' + COLS[idx + 1][1] }) : null));
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', t.id); el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    return el;
  };

  const remove = async (t) => {
    if (!(await confirmBox(`ลบงานย่อย "${t.title}"?`, 'ลบ', 'danger'))) return false;
    b = await call('deleteTask', { groupId, id: t.id });
    draw();
    return true;
  };

  const draw = () => mount(holder, COLS.map(([k, label]) => {
    const tasks = b.tasks.filter((t) => t.status === k)
      .sort((x, y) => (x.dueAt || '9999') < (y.dueAt || '9999') ? -1 : (x.dueAt || '9999') > (y.dueAt || '9999') ? 1 : x.createdAt < y.createdAt ? -1 : 1);
    const col = h('section', { class: 'kanban-col col-' + k, 'aria-label': label },
      h('div', { class: 'row' }, h('h3', { style: 'margin:0' }, label), h('span', { class: 'chip' }, String(tasks.length)), h('span', { class: 'spacer' }),
        b.canEdit ? h('button', { class: 'sm ghost', onclick: () => taskForm(b, names, { status: k }, save, remove), 'aria-label': 'เพิ่มงานย่อยใน ' + label }, '+ เพิ่ม') : null),
      tasks.length ? tasks.map(card) : h('div', { class: 'muted small kanban-empty' }, b.canEdit ? 'ลากการ์ดมาวางที่นี่' : 'ไม่มีงาน'));
    if (b.canEdit) {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain');
        const t = b.tasks.find((x) => x.id === id);
        if (t && t.status !== k) save({ id, status: k }).catch((err) => toast(err.message, 'bad'));
      });
    }
    return col;
  }));

  const sub = b.group.submission;
  mount(body, h('div', { class: 'stack' },
    h('div', { class: 'row' },
      h('button', { class: 'sm', onclick: back }, '← บอร์ดกลุ่ม'),
      h('h2', { style: 'margin:0' }, 'กลุ่ม ', b.group.name),
      h('span', { class: 'muted small' }, b.assignment.title, ' · ', b.assignment.dueAt ? `ส่ง ${fmtDate(b.assignment.dueAt)} (${fmtLeft(b.assignment.dueAt)})` : 'ไม่มีกำหนดส่ง'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'chip ' + (sub && sub.submittedAt ? 'info' : '') }, sub && sub.submittedAt ? 'ส่งงานแล้ว' : 'ยังไม่ส่งงาน'),
      b.canEdit ? null : h('span', { class: 'chip' }, 'ดูอย่างเดียว')),
    h('div', { class: 'avatars' }, b.group.members.map((m) => h('span', { class: 'chip' }, h('span', { class: 'avatar sm' }, initials(m.name)), ' ', m.studentId, ' ', names[m.studentId]))),
    holder,
    b.canEdit ? h('p', { class: 'muted small' }, 'ลากการ์ดข้ามคอลัมน์ หรือกด ← → · กดการ์ดเพื่อแก้ไข · งานย่อยที่มีวันกำหนดจะขึ้นในแท็บ Timeline') : null));
  draw();
}

function taskForm(b, names, t, save, remove) {
  const f = {
    title: h('input', { value: t.title || '', maxlength: 200, placeholder: 'เช่น ร่างโลโก้ 3 แบบ' }),
    note: h('textarea', { value: t.note || '', maxlength: 2000, placeholder: 'รายละเอียด (ไม่บังคับ)', style: 'min-height:70px' }),
    status: h('select', {}, COLS.map(([k, label]) => h('option', { value: k, selected: k === (t.status || 'todo') }, label))),
    assignee: h('select', {},
      h('option', { value: '' }, '— ยังไม่มีคนรับ —'),
      b.group.members.map((m) => h('option', { value: m.studentId, selected: m.studentId === t.assignee }, `${names[m.studentId]} (${m.studentId})`))),
    dueAt: h('input', { type: 'datetime-local', value: toLocalInput(t.dueAt) })
  };
  const actions = [{
    label: 'บันทึก',
    run: async () => {
      await save({
        id: t.id, title: f.title.value.trim(), note: f.note.value, status: f.status.value, assignee: f.assignee.value,
        dueAt: f.dueAt.value ? new Date(f.dueAt.value).toISOString() : ''
      });
      toast(t.id ? 'บันทึกแล้ว' : 'เพิ่มงานย่อยแล้ว');
    }
  }];
  if (t.id) actions.unshift({ label: 'ลบ', class: 'ghost danger', run: async () => ((await remove(t)) ? true : false) });
  return modal(t.id ? 'แก้ไขงานย่อย' : 'เพิ่มงานย่อย', h('div', { class: 'form' },
    h('label', { class: 'field' }, h('span', {}, 'ชื่องาน'), f.title),
    h('label', { class: 'field' }, h('span', {}, 'รายละเอียด'), f.note),
    h('div', { class: 'form-2' },
      h('label', { class: 'field' }, h('span', {}, 'สถานะ'), f.status),
      h('label', { class: 'field' }, h('span', {}, 'ผู้รับผิดชอบ'), f.assignee)),
    h('label', { class: 'field' }, h('span', {}, 'วันกำหนด (ไม่บังคับ)'), f.dueAt),
    t.createdBy ? h('p', { class: 'muted small' }, `สร้างโดย ${names[t.createdBy] || t.createdBy} · ${fmtDate(t.createdAt)}`) : null),
  actions);
}

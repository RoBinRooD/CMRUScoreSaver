// หน้าผู้ดูแลระบบ: บัญชีอาจารย์ (สมาชิก วันหมดอายุ โควตา) และผู้สอนของทุกวิชา
import { h, mount, loading, toast, actionButton, confirmBox, modal, fmtSize } from '../ui.js';
import { call } from '../api.js';

const ROLE_LABEL = { admin: 'ผู้ดูแลระบบ', teacher: 'อาจารย์' };
const size = (n) => fmtSize(n) || '0 B';

export async function renderAdmin(body, ctx) {
  mount(body, loading());
  const data = await call('adminOverview');
  const reload = () => renderAdmin(body, ctx);
  const active = data.teachers.filter((t) => t.status === 'active');

  const statusChip = (t) => t.status === 'disabled' ? h('span', { class: 'chip bad' }, 'ปิดบัญชี')
    : t.expired ? h('span', { class: 'chip warn' }, 'หมดอายุ — ดูได้อย่างเดียว')
      : h('span', { class: 'chip ok' }, 'ใช้งาน');
  const usage = (t) => t.quotaGB
    ? `${size(t.usedBytes)} / ${t.quotaGB} GB`
    : `${size(t.usedBytes)} (ไม่จำกัด)`;

  mount(body, h('div', { class: 'stack' },
    h('section', { class: 'card' },
      h('div', { class: 'row' },
        h('h2', { style: 'margin:0' }, `บัญชีอาจารย์ (${data.teachers.length})`),
        h('span', { class: 'spacer' }),
        h('button', { class: 'primary', onclick: async () => { if (await teacherForm(null, data.me)) reload(); } }, '+ เพิ่มอาจารย์')),
      h('p', { class: 'muted small' }, 'อาจารย์ล็อกอินด้วย Google ได้ทันทีหลังเพิ่ม · เห็นเฉพาะวิชาที่ตัวเองสอน · หมดอายุแล้วดูข้อมูลได้แต่แก้ไม่ได้ (นักศึกษายังส่งงานได้)'),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'อีเมล'), h('th', {}, 'บทบาท'), h('th', {}, 'สถานะ'), h('th', {}, 'หมดอายุ'),
          h('th', {}, 'พื้นที่ Drive'), h('th', {}, 'วิชา'), h('th', {}))),
        h('tbody', {}, data.teachers.map((t) => h('tr', {},
          h('td', {}, h('div', {}, t.email, t.email === data.me ? h('span', { class: 'muted' }, ' (คุณ)') : null),
            t.name ? h('div', { class: 'muted small' }, t.name) : null,
            t.note ? h('div', { class: 'muted small' }, t.note) : null),
          h('td', {}, ROLE_LABEL[t.role] || t.role),
          h('td', {}, statusChip(t)),
          h('td', { class: 'nowrap' }, t.expiresAt || '—'),
          h('td', { class: 'nowrap' }, usage(t)),
          h('td', {}, t.courses.join(', ') || h('span', { class: 'muted' }, '—')),
          h('td', { class: 'nowrap' },
            h('button', { class: 'sm', onclick: async () => { if (await teacherForm(t, data.me)) reload(); } }, 'แก้ไข'),
            t.email === data.me ? null : actionButton('ลบ', async () => {
              if (!(await confirmBox(`ลบบัญชี ${t.email}? (ลบได้เมื่อไม่ได้สอนวิชาใดแล้ว — ถ้าแค่ไม่ให้เข้า ใช้ "ปิดบัญชี" แทน)`, 'ลบบัญชี', 'danger'))) return;
              await call('adminRemoveTeacher', { email: t.email });
              toast('ลบบัญชีแล้ว');
              reload();
            }, { class: 'sm ghost danger' })))))))),

    h('section', { class: 'card' },
      h('h2', {}, `วิชาทั้งหมด (${data.courses.length})`),
      h('p', { class: 'muted small' }, 'ผู้ดูแลระบบเปิดดูวิชาของคนอื่นไม่ได้ แต่โอนวิชาได้ (เช่น อาจารย์ลาออก) — เพิ่มตัวเองเป็นผู้สอนถ้าต้องเข้าไปช่วยดู'),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'วิชา'), h('th', {}, 'ภาค'), h('th', { class: 'num' }, 'นักศึกษา'), h('th', {}, 'พื้นที่'),
          h('th', {}, 'ผู้สอน'), h('th', {}))),
        h('tbody', {}, data.courses.map((c) => h('tr', {},
          h('td', {}, h('div', {}, c.courseCode), h('div', { class: 'muted small' }, c.title, c.section ? ` · Sec ${c.section}` : '')),
          h('td', { class: 'nowrap' }, c.term || '—'),
          h('td', { class: 'num' }, String(c.students)),
          h('td', { class: 'nowrap' }, size(c.usedBytes)),
          h('td', {}, c.owners.length ? c.owners.map((e) => h('div', { class: 'small' }, e)) : h('span', { class: 'chip bad' }, 'ไม่มีผู้สอน')),
          h('td', {}, h('button', { class: 'sm', onclick: async () => {
            if (await ownersForm(c, active)) { reload(); await ctx.refreshMe(); }
          } }, 'เปลี่ยนผู้สอน'))))))))));
}

function teacherForm(t, me) {
  const isNew = !t;
  const self = t && t.email === me;
  const f = {
    email: h('input', { type: 'email', value: t?.email || '', disabled: !isNew, placeholder: 'อีเมล Google ของอาจารย์' }),
    name: h('input', { value: t?.name || '', maxlength: 200 }),
    role: h('select', { disabled: self }, Object.entries(ROLE_LABEL).map(([k, v]) => h('option', { value: k, selected: (t?.role || 'teacher') === k }, v))),
    status: h('select', { disabled: self },
      h('option', { value: 'active', selected: (t?.status || 'active') === 'active' }, 'ใช้งาน'),
      h('option', { value: 'disabled', selected: t?.status === 'disabled' }, 'ปิดบัญชี (เข้าไม่ได้)')),
    expiresAt: h('input', { type: 'date', value: t?.expiresAt || '' }),
    quotaGB: h('input', { type: 'number', min: 1, step: 'any', value: t?.quotaGB ?? '', placeholder: 'ว่าง = ไม่จำกัด', style: 'width:10em' }),
    note: h('textarea', { value: t?.note || '', maxlength: 1000, placeholder: 'เช่น แพ็กเกจรายปี ชำระแล้ว 1 พ.ย. 2569', style: 'min-height:60px' }),
    resetPin: h('input', { type: 'checkbox' })
  };
  const field = (label, el) => h('label', { class: 'field' }, h('span', {}, label), el);
  return modal(isNew ? 'เพิ่มอาจารย์' : `แก้ไข ${t.email}`, h('div', { class: 'form' },
    field('อีเมล', f.email),
    field('ชื่อ (ไม่บังคับ)', f.name),
    h('div', { class: 'form-2' }, field('บทบาท', f.role), field('สถานะ', f.status)),
    h('div', { class: 'form-2' }, field('หมดอายุสมาชิก (ว่าง = ไม่หมด)', f.expiresAt), field('โควตาพื้นที่ (GB)', f.quotaGB)),
    field('บันทึก', f.note),
    t?.hasPin ? h('label', { class: 'check' }, f.resetPin, 'รีเซ็ต PIN ลบวิชา (อาจารย์ลืม PIN)') : null,
    self ? h('p', { class: 'muted small' }, 'บทบาทและสถานะของตัวเองเปลี่ยนไม่ได้ — กันล็อกตัวเองออกจากระบบ') : null,
    h('p', { class: 'muted small' }, 'ผู้ดูแลระบบ: เพิ่ม/แก้บัญชีอาจารย์ แก้การตั้งค่ารวม และโอนวิชาได้ · ไม่หมดอายุ')),
  [{
    label: 'บันทึก',
    run: async () => {
      await call('adminSaveTeacher', {
        email: f.email.value.trim(), name: f.name.value.trim(), role: f.role.value, status: f.status.value,
        expiresAt: f.expiresAt.value, quotaGB: f.quotaGB.value === '' ? '' : Number(f.quotaGB.value),
        note: f.note.value.trim(), resetPin: f.resetPin.checked
      });
      toast('บันทึกแล้ว');
    }
  }]);
}

function ownersForm(c, teachers) {
  const boxes = teachers.map((t) => ({ t, input: h('input', { type: 'checkbox', checked: c.owners.includes(t.email) }) }));
  return modal(`ผู้สอนวิชา ${c.courseCode}`, h('div', { class: 'form' },
    h('div', { class: 'pick-list' }, boxes.map((b) => h('label', { class: 'check' }, b.input, b.t.email, b.t.name ? ` (${b.t.name})` : ''))),
    h('p', { class: 'muted small' }, 'คนแรกที่เลือก (ตามลำดับรายชื่อเดิม) เป็นเจ้าของพื้นที่เก็บไฟล์ · ต้องเลือกอย่างน้อย 1 คน')),
  [{
    label: 'บันทึก',
    run: async () => {
      const keep = c.owners.filter((e) => boxes.some((b) => b.t.email === e && b.input.checked));
      const added = boxes.filter((b) => b.input.checked && !c.owners.includes(b.t.email)).map((b) => b.t.email);
      await call('setCourseOwners', { courseCode: c.courseCode, owners: [...keep, ...added] });
      toast('บันทึกผู้สอนแล้ว');
    }
  }]);
}

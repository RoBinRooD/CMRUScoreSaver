// ใบลา — นักศึกษาส่ง/ติดตาม · อาจารย์อนุมัติ (อนุมัติ = เช็คชื่อสัปดาห์นั้นเป็น "ลา" ให้อัตโนมัติ)
import { h, mount, loading, errorBox, toast, actionButton, confirmBox, modal, fmtDate, fmtSize, driveUrl, richText } from '../ui.js';
import { call } from '../api.js';
import { uploadVia } from '../upload.js';

const TYPES = [['sick', 'ลาป่วย'], ['personal', 'ลากิจ'], ['other', 'อื่นๆ']];
const STATUS = { pending: ['warn', 'รออนุมัติ'], approved: ['ok', 'อนุมัติ'], rejected: ['bad', 'ไม่อนุมัติ'] };
const dateOnly = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' });
const fmtLeaveDate = (d) => (d ? dateOnly.format(new Date(d + 'T00:00:00')) : '-');

function statusChip(v) {
  const [cls, label] = STATUS[v.status] || STATUS.pending;
  return h('span', { class: 'chip ' + cls }, label);
}

function files(list) {
  return list.length ? h('ul', { class: 'files' }, list.map((f) => h('li', {},
    h('span', { 'aria-hidden': 'true' }, '📎'),
    h('a', { href: driveUrl(f.id), target: '_blank', rel: 'noopener', title: f.name }, f.name),
    h('span', { class: 'muted small' }, fmtSize(f.size))))) : null;
}

/* ---------- นักศึกษา ---------- */

export async function studentLeaves(body, ctx) {
  mount(body, loading());
  let list;
  try {
    list = await call('myLeaves', { courseCode: ctx.course.courseCode });
  } catch (e) {
    return mount(body, errorBox(e));
  }
  const reload = () => studentLeaves(body, ctx);
  mount(body, h('div', { class: 'stack' },
    h('div', { class: 'row' },
      h('p', { class: 'muted small', style: 'margin:0' }, 'ส่งใบลาได้ทั้งก่อนและหลังวันที่ลา · อาจารย์อนุมัติแล้วระบบจะบันทึกการเช็คชื่อสัปดาห์นั้นเป็น "ลา" ให้'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'primary', onclick: async () => { if (await leaveForm(ctx)) reload(); } }, '+ ส่งใบลา')),
    list.length ? h('div', { class: 'grid' }, list.map((v) => h('article', { class: 'card stack', style: 'gap:.4rem' },
      h('div', { class: 'card-head' },
        h('h3', {}, `สัปดาห์ที่ ${v.week} · ${v.typeLabel}`),
        h('span', { class: 'spacer' }),
        statusChip(v)),
      h('div', { class: 'muted small' }, `วันที่ลา ${fmtLeaveDate(v.date)} · ส่งเมื่อ ${fmtDate(v.submittedAt)}`),
      richText(v.reason),
      files(v.files),
      v.note ? h('div', { class: 'feedback small' }, h('strong', {}, 'อาจารย์: '), v.note) : null,
      v.status === 'pending' ? h('div', {}, actionButton('ยกเลิกใบลา', async () => {
        if (!(await confirmBox(`ยกเลิกใบลาสัปดาห์ที่ ${v.week}?`, 'ยกเลิกใบลา', 'danger'))) return;
        await call('cancelLeave', { leaveId: v.id });
        toast('ยกเลิกแล้ว');
        reload();
      }, { class: 'sm ghost danger' })) : null)))
      : h('p', { class: 'muted center pad' }, 'ยังไม่มีใบลา')));
}

function leaveForm(ctx) {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const f = {
    week: h('select', {}, h('option', { value: '' }, '— เลือกสัปดาห์ —'),
      Array.from({ length: 16 }, (_, i) => h('option', { value: String(i + 1) }, `สัปดาห์ที่ ${i + 1}`))),
    date: h('input', { type: 'date', value: iso }),
    type: h('select', {}, TYPES.map(([k, label]) => h('option', { value: k }, label))),
    reason: h('textarea', { maxlength: 1000, placeholder: 'เช่น มีไข้ ไปพบแพทย์', style: 'min-height:80px' }),
    files: h('input', { type: 'file', multiple: true, accept: 'image/*,.pdf' })
  };
  const progress = h('div', { class: 'small muted' });
  return modal('ส่งใบลา', h('div', { class: 'form' },
    h('div', { class: 'form-2' },
      h('label', { class: 'field' }, h('span', {}, 'สัปดาห์ที่ลา *'), f.week),
      h('label', { class: 'field' }, h('span', {}, 'วันที่ลา *'), f.date)),
    h('label', { class: 'field' }, h('span', {}, 'ประเภท'), f.type),
    h('label', { class: 'field' }, h('span', {}, 'เหตุผล *'), f.reason),
    h('label', { class: 'field' }, h('span', {}, 'แนบไฟล์ (ไม่บังคับ) เช่น ใบรับรองแพทย์ · รูปหรือ PDF ไม่เกิน 5 ไฟล์ ไฟล์ละ 20 MB'), f.files),
    h('p', { class: 'muted small' }, `สัปดาห์ที่นับตามตารางเรียนของวิชา (${ctx.course.schedule || 'ดูใน Syllabus'}) · เห็นเฉพาะคุณและอาจารย์`),
    progress),
  [{
    label: 'ส่งใบลา',
    run: async () => {
      const picked = [...f.files.files];
      if (picked.length > 5) throw new Error('แนบได้สูงสุด 5 ไฟล์');
      if (picked.some((x) => x.size > 20 * 1024 * 1024)) throw new Error('ไฟล์แนบต้องไม่เกิน 20 MB');
      const v = await call('submitLeave', {
        courseCode: ctx.course.courseCode, week: Number(f.week.value), date: f.date.value, type: f.type.value, reason: f.reason.value.trim()
      });
      // สร้างใบลาก่อน แล้วค่อยแนบไฟล์ — ถ้าไฟล์ไหนไม่สำเร็จ ใบลายังส่งแล้ว
      let failed = 0;
      for (const file of picked) {
        try {
          await uploadVia(file, { start: 'startLeaveUpload', finalize: 'finalizeLeaveUpload', params: { leaveId: v.id } },
            (p) => { progress.textContent = `กำลังแนบ ${file.name} ${Math.floor(p * 100)}%`; });
        } catch (e) {
          failed++;
          toast(`${file.name}: ${e.message}`, 'bad');
        }
      }
      toast(failed ? `ส่งใบลาแล้ว แต่แนบไฟล์ไม่สำเร็จ ${failed} ไฟล์` : 'ส่งใบลาแล้ว', failed ? 'bad' : '');
    }
  }]);
}

/* ---------- อาจารย์ ---------- */

export async function teacherLeaves(body, ctx) {
  mount(body, loading());
  const list = await call('listLeaves', { courseCode: ctx.course.courseCode });
  const filter = h('select', { 'aria-label': 'กรองสถานะ' },
    h('option', { value: 'all' }, 'ทั้งหมด'),
    Object.entries(STATUS).map(([k, [, label]]) => h('option', { value: k, selected: k === 'pending' && list.some((v) => v.status === 'pending') }, label)));
  const holder = h('div');
  const draw = () => {
    const rows = list.filter((v) => filter.value === 'all' || v.status === filter.value);
    mount(holder, rows.length ? h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'นักศึกษา'), h('th', { class: 'num' }, 'สัปดาห์'), h('th', {}, 'วันที่ลา'), h('th', {}, 'ประเภท / เหตุผล'),
        h('th', {}, 'ไฟล์แนบ'), h('th', {}, 'สถานะ'), h('th', {}, ''))),
      h('tbody', {}, rows.map((v) => h('tr', {},
        h('td', {}, v.studentId, h('div', { class: 'small' }, v.name)),
        h('td', { class: 'num' }, v.week),
        h('td', { class: 'nowrap' }, fmtLeaveDate(v.date), h('div', { class: 'muted small' }, 'ส่ง ' + fmtDate(v.submittedAt))),
        h('td', {}, h('strong', {}, v.typeLabel), richText(v.reason, 'small')),
        h('td', {}, files(v.files) || h('span', { class: 'muted small' }, '-')),
        h('td', {}, statusChip(v), v.note ? h('div', { class: 'muted small' }, v.note) : null),
        h('td', {}, h('button', { class: 'sm' + (v.status === 'pending' ? ' primary' : ''), onclick: () => decide(v) }, v.status === 'pending' ? 'พิจารณา' : 'แก้ไข')))))))
      : h('p', { class: 'muted center pad' }, list.length ? 'ไม่มีใบลาในสถานะนี้' : 'ยังไม่มีนักศึกษาส่งใบลา'));
  };
  const decide = async (v) => {
    const note = h('textarea', { value: v.note || '', maxlength: 1000, placeholder: 'ความเห็นถึงนักศึกษา (ไม่บังคับ)', style: 'min-height:60px' });
    const act = (status, label, cls) => ({
      label, class: cls,
      run: async () => {
        const next = await call('decideLeave', { leaveId: v.id, status, note: note.value.trim() });
        list.splice(list.indexOf(v), 1, next);
        toast(status === 'approved' ? `อนุมัติแล้ว — เช็คชื่อสัปดาห์ที่ ${v.week} เป็น "ลา"` : 'บันทึกแล้ว');
      }
    });
    const ok = await modal(`ใบลา ${v.studentId} ${v.name}`, h('div', { class: 'form' },
      h('p', {}, h('strong', {}, `สัปดาห์ที่ ${v.week} · ${v.typeLabel}`), ` · วันที่ลา ${fmtLeaveDate(v.date)} `, statusChip(v)),
      richText(v.reason),
      files(v.files),
      h('label', { class: 'field' }, h('span', {}, 'ความเห็น'), note),
      h('p', { class: 'muted small' }, 'อนุมัติ = เช็คชื่อสัปดาห์นั้นเป็น "ลา" (ถ้าเช็คว่า "มา" ไว้แล้วจะไม่เปลี่ยน) · เปลี่ยนเป็นไม่อนุมัติทีหลัง = คืนค่าเดิม')),
    [
      v.status === 'pending' ? null : act('pending', 'กลับเป็นรออนุมัติ', 'ghost'),
      act('rejected', 'ไม่อนุมัติ', 'danger'),
      act('approved', 'อนุมัติ', 'primary')
    ].filter(Boolean));
    if (ok) draw();
  };
  filter.addEventListener('change', draw);
  mount(body, h('div', { class: 'stack' },
    h('div', { class: 'row' }, filter, h('span', { class: 'muted small' }, `ทั้งหมด ${list.length} ใบ · รออนุมัติ ${list.filter((v) => v.status === 'pending').length}`)),
    holder));
  draw();
}

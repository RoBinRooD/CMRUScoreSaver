// Syllabus — นักศึกษาอ่าน, อาจารย์แก้ไขในหน้าเดียวกัน
import { h, mount, loading, errorBox, toast, actionButton, confirmBox, modal, fmtDate, fmtSize, driveUrl, richText } from '../ui.js';
import { call } from '../api.js';
import { uploadVia } from '../upload.js';

const PART_LABEL = { attendance: 'การเข้าเรียน', assignments: 'งาน', midterm: 'สอบกลางภาค', final: 'สอบปลายภาค' };
// ตามหัวข้อแนวการสอนของมหาวิทยาลัย · before = ก่อนแผนการสอน, after = หลังการวัดผล
const TEXT_SECTIONS = [
  ['description', 'คำอธิบายรายวิชา', 5000, 'before'],
  ['objectives', 'จุดมุ่งหมาย / วัตถุประสงค์', 5000, 'before'],
  ['scope', 'ขอบเขตเนื้อหา', 5000, 'before'],
  ['activities', 'กิจกรรมการเรียนการสอน', 5000, 'before'],
  ['materials', 'สื่อการเรียนการสอน', 5000, 'before'],
  ['assessment', 'การประเมินผล', 3000, 'assessment'],
  ['rules', 'ข้อตกลงในชั้นเรียน / หมายเหตุ', 3000, 'after'],
  ['contact', 'ติดต่ออาจารย์ / เวลาให้คำปรึกษา', 2000, 'after']
];
const sectionsIn = (group) => TEXT_SECTIONS.filter((x) => x[3] === group);

export async function renderSyllabus(body, ctx) {
  mount(body, loading());
  let data;
  try {
    data = await call('getSyllabus', { courseCode: ctx.course.courseCode });
  } catch (e) {
    return mount(body, errorBox(e));
  }
  const teacher = ctx.me.role === 'teacher';
  // ยกเลิก = โหลดใหม่ เพราะไฟล์แนบบันทึกทันทีระหว่างแก้ไข
  const show = () => mount(body, readView(data, teacher, () => mount(body, editView(data, (next) => { data = next; show(); }, () => renderSyllabus(body, ctx)))));
  show();
}

function readView(data, teacher, onEdit) {
  const { course: c, syllabus: s } = data;
  const has = (k) => !!(s[k] && s[k].trim());
  const weeks = s.weeks.map((w, i) => ({ ...w, n: i + 1 })).filter((w) => w.topic || w.detail);
  const empty = !TEXT_SECTIONS.some(([k]) => has(k)) && !weeks.length && !s.attachments.length;
  const section = (title, ...kids) => h('section', { class: 'card stack' }, h('h2', {}, title), ...kids);

  return h('div', { class: 'stack' },
    h('section', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', {},
          h('h2', { style: 'margin:0' }, `${c.courseCode} ${c.title}`),
          h('div', { class: 'muted small' }, [c.credits && `หน่วยกิต ${c.credits}`, `Sec ${c.section}`, `ภาค ${c.term}`, c.schedule, c.teacher && `ผู้สอน ${c.teacher}`].filter(Boolean).join(' · '))),
        h('span', { class: 'spacer' }),
        teacher ? h('button', { class: 'primary sm', onclick: onEdit }, 'แก้ไข syllabus') : null),
      data.updatedAt ? h('div', { class: 'muted small', style: 'margin-top:.35rem' }, 'ปรับปรุงล่าสุด ' + fmtDate(data.updatedAt)) : null),
    empty ? h('p', { class: 'muted center pad' }, teacher ? 'ยังไม่มีเนื้อหา — กด "แก้ไข syllabus" เพื่อเริ่มเขียน' : 'อาจารย์ยังไม่ได้ใส่ syllabus ของวิชานี้') : null,
    sectionsIn('before').map(([k, label]) => (has(k) ? section(label, richText(s[k])) : null)),
    weeks.length ? section('แผนการสอน',
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', { class: 'num' }, 'สัปดาห์'), h('th', {}, 'หัวข้อ'), h('th', {}, 'รายละเอียด'))),
        h('tbody', {}, weeks.map((w) => h('tr', {},
          h('td', { class: 'num' }, w.n), h('td', {}, w.topic), h('td', {}, w.detail ? richText(w.detail, 'small') : null))))))) : null,
    section('การวัดและประเมินผล',
      has('assessment') ? richText(s.assessment) : null,
      h('div', { class: 'stats' }, Object.entries(c.weights).map(([k, v]) => h('div', { class: 'stat' },
        h('div', { class: 'label' }, PART_LABEL[k] || k), h('div', { class: 'value' }, `${v}%`)))),
      h('p', { class: 'muted small' }, 'เกณฑ์เกรด: ' + data.gradeCutoffs.map(([g, min]) => `${g} ≥ ${min}`).join(' · '))),
    sectionsIn('after').map(([k, label]) => (has(k) ? section(label, richText(s[k])) : null)),
    s.attachments.length ? section('ไฟล์และลิงก์', attachmentList(s.attachments)) : null);
}

function attachmentList(list, onRemove) {
  return h('ul', { class: 'files' }, list.map((a) => h('li', {},
    h('span', { 'aria-hidden': 'true' }, a.kind === 'file' ? '📄' : '🔗'),
    h('a', { href: a.kind === 'file' ? driveUrl(a.id) : a.url, target: '_blank', rel: 'noopener', title: a.name }, a.name),
    a.size ? h('span', { class: 'muted small' }, fmtSize(a.size)) : null,
    onRemove ? actionButton('ลบ', () => onRemove(a), { class: 'sm ghost danger' }) : null)));
}

/**
 * วางแผนการสอนทีเดียว: บรรทัดละ 1 สัปดาห์ (บรรทัดแรก = สัปดาห์ 1) "หัวข้อ | รายละเอียด"
 * คั่นด้วย | หรือแท็บ (คัดลอกจาก Excel/Word ได้) · บรรทัดว่าง = สัปดาห์ว่าง · สัปดาห์ที่เกินจำนวนบรรทัดถูกล้าง
 */
function pasteWeeks(weeks, markDirty) {
  const area = h('textarea', {
    style: 'min-height:260px;font-size:.9rem',
    placeholder: 'แนะนำรายวิชา | หลักการออกแบบกราฟิก 2 มิติ\nInfographic | การจัดลำดับข้อมูล ไอคอน แผนภูมิ\n…',
    value: weeks.map((w) => [w.topic.value, w.detail.value].filter(Boolean).join(' | ')).join('\n').replace(/\n+$/, '')
  });
  return modal('วางแผนการสอนทั้งตาราง', h('div', { class: 'form' },
    h('p', { class: 'muted small' }, 'บรรทัดละ 1 สัปดาห์ (บรรทัดแรก = สัปดาห์ 1) · หัวข้อ | รายละเอียด (คั่นด้วย | หรือแท็บ) · บรรทัดว่าง = สัปดาห์ว่าง · กด "ใช้ข้อความนี้" แล้วอย่าลืมกดบันทึก syllabus'),
    area),
  [{
    label: 'ใช้ข้อความนี้',
    run: () => {
      const lines = area.value.replace(/\r/g, '').split('\n');
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      if (lines.length > weeks.length) throw new Error(`มี ${lines.length} บรรทัด — ได้ไม่เกิน ${weeks.length} สัปดาห์`);
      weeks.forEach((w, i) => {
        const [topic, ...rest] = (lines[i] || '').split(/\t| \| |\|/);
        w.topic.value = (topic || '').trim().slice(0, 200);
        w.detail.value = rest.join(' | ').trim().slice(0, 1000);
      });
      markDirty();
      toast(`ใส่แผนการสอน ${lines.length} สัปดาห์แล้ว — กดบันทึกเพื่อบันทึก`);
    }
  }]);
}

function editView(data, onSaved, onCancel) {
  const s = data.syllabus;
  const code = data.course.courseCode;
  const texts = Object.fromEntries(TEXT_SECTIONS.map(([k, , max]) => [k, h('textarea', { value: s[k], maxlength: max, style: 'min-height:90px' })]));
  const weeks = s.weeks.map((w, i) => ({
    topic: h('input', { value: w.topic, maxlength: 200, 'aria-label': `หัวข้อสัปดาห์ ${i + 1}` }),
    detail: h('input', { value: w.detail, maxlength: 1000, 'aria-label': `รายละเอียดสัปดาห์ ${i + 1}`, placeholder: 'ไม่บังคับ' })
  }));
  let dirty = false;
  const markDirty = () => { dirty = true; };
  [...Object.values(texts), ...weeks.flatMap((w) => [w.topic, w.detail])].forEach((el) => el.addEventListener('input', markDirty));

  const save = async () => {
    const next = await call('saveSyllabus', {
      courseCode: code,
      syllabus: {
        ...Object.fromEntries(Object.entries(texts).map(([k, el]) => [k, el.value])),
        weeks: weeks.map((w) => ({ topic: w.topic.value, detail: w.detail.value }))
      }
    });
    dirty = false;
    return next;
  };

  // ไฟล์แนบบันทึกทันที (ไม่ต้องกด "บันทึก") — แต่ไม่ทิ้งข้อความที่พิมพ์ค้างไว้
  const attachHolder = h('div', { class: 'stack' });
  const drawAttachments = (list) => mount(attachHolder,
    list.length ? attachmentList(list, async (a) => {
      if (!(await confirmBox(`ลบ "${a.name}"?${a.kind === 'file' ? ' (ไฟล์จะถูกย้ายไปถังขยะใน Drive)' : ''}`, 'ลบ', 'danger'))) return;
      drawAttachments((await call('removeSyllabusAttachment', { courseCode: code, id: a.id })).syllabus.attachments);
      toast('ลบแล้ว');
    }) : h('p', { class: 'muted small' }, 'ยังไม่มีไฟล์แนบ'));
  drawAttachments(s.attachments);

  const fileInput = h('input', { type: 'file', class: 'hidden' });
  const progress = h('div', { class: 'small muted' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const next = await uploadVia(file, { start: 'startSyllabusUpload', finalize: 'finalizeSyllabusUpload', params: { courseCode: code } },
        (p) => { progress.textContent = `กำลังอัปโหลด ${file.name} ${Math.floor(p * 100)}%`; });
      progress.textContent = '';
      drawAttachments(next.syllabus.attachments);
      toast('แนบไฟล์แล้ว');
    } catch (e) {
      progress.textContent = '';
      toast(e.message, 'bad');
    }
  });
  const linkName = h('input', { placeholder: 'ชื่อลิงก์', maxlength: 200, style: 'flex:1;min-width:8em' });
  const linkUrl = h('input', { type: 'url', placeholder: 'https://…', style: 'flex:2;min-width:12em' });

  window.onbeforeunload = () => (dirty ? true : undefined);
  const leave = async (fn) => {
    if (dirty && !(await confirmBox('มีข้อความที่ยังไม่ได้บันทึก — ออกโดยไม่บันทึก?', 'ออกโดยไม่บันทึก', 'danger'))) return;
    window.onbeforeunload = null;
    fn();
  };

  return h('div', { class: 'stack' },
    h('div', { class: 'row' },
      h('h2', { style: 'margin:0' }, 'แก้ไข syllabus'),
      h('span', { class: 'spacer' }),
      h('button', { onclick: () => leave(onCancel) }, 'ยกเลิก'),
      actionButton('บันทึก', async () => {
        const next = await save();
        window.onbeforeunload = null;
        toast('บันทึก syllabus แล้ว');
        onSaved(next);
      }, { class: 'primary' })),
    sectionsIn('before').map(([k, label]) => h('section', { class: 'card form' }, h('label', { class: 'field' }, h('span', {}, label), texts[k]))),
    h('section', { class: 'card stack' },
      h('div', { class: 'row' },
        h('h2', { style: 'margin:0' }, 'แผนการสอน 16 สัปดาห์'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'sm', onclick: () => pasteWeeks(weeks, markDirty) }, 'วางทั้งตาราง')),
      h('p', { class: 'muted small' }, 'เว้นว่างสัปดาห์ที่ไม่ต้องการแสดง · ลิงก์ https:// ในรายละเอียดจะกดได้'),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', { class: 'num' }, 'สัปดาห์'), h('th', {}, 'หัวข้อ'), h('th', {}, 'รายละเอียด'))),
        h('tbody', {}, weeks.map((w, i) => h('tr', {},
          h('td', { class: 'num' }, i + 1), h('td', {}, w.topic), h('td', {}, w.detail))))))),
    h('section', { class: 'card stack' },
      h('h2', {}, 'การวัดและประเมินผล'),
      h('label', { class: 'field' }, h('span', {}, 'การประเมินผล (ข้อความ เช่น เกณฑ์การให้คะแนนผลงาน)'), texts.assessment),
      h('p', { class: 'muted small' }, 'สัดส่วนคะแนนและเกณฑ์เกรดแสดงต่อท้ายอัตโนมัติ — ดึงจากแท็บสมุดคะแนนและแท็บตั้งค่า (แก้ที่นั่น)')),
    sectionsIn('after').map(([k, label]) => h('section', { class: 'card form' }, h('label', { class: 'field' }, h('span', {}, label), texts[k]))),
    h('section', { class: 'card stack' },
      h('h2', {}, 'ไฟล์และลิงก์'),
      h('p', { class: 'muted small' }, 'บันทึกทันทีที่เพิ่ม/ลบ · ไฟล์เก็บใน Drive ของอาจารย์และเปิดได้ทุกคนที่มีลิงก์ (อย่าแนบข้อมูลส่วนตัว)'),
      attachHolder,
      h('div', { class: 'row' }, h('button', { onclick: () => fileInput.click() }, '+ แนบไฟล์'), fileInput, progress),
      h('div', { class: 'row' }, linkName, linkUrl, actionButton('+ เพิ่มลิงก์', async () => {
        const next = await call('addSyllabusLink', { courseCode: code, name: linkName.value.trim(), url: linkUrl.value.trim() });
        linkName.value = '';
        linkUrl.value = '';
        drawAttachments(next.syllabus.attachments);
        toast('เพิ่มลิงก์แล้ว');
      }))),
    h('div', { class: 'row' }, h('span', { class: 'spacer' }), actionButton('บันทึก', async () => {
      const next = await save();
      window.onbeforeunload = null;
      toast('บันทึก syllabus แล้ว');
      onSaved(next);
    }, { class: 'primary' })));
}

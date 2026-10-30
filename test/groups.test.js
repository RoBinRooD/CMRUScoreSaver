const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./backend.js');

const T = 'teacher@demo.ac.th';
const ORIGIN = 'http://localhost:8080';
const mail = (id) => id + '@demo.ac.th';

function reg(b, id) {
  return b.ok(mail(id), 'register', {});
}

function err(b, email, action, payload) {
  const r = b.call(email, action, payload);
  assert.equal(r.ok, false, `${action} should fail`);
  return r.error;
}

/** งานกลุ่มใหม่ในวิชา DEMO2303 (นักศึกษา 69000101–69000108) */
function groupWork(b, extra = {}) {
  return b.ok(T, 'upsertAssignment', {
    courseCode: 'DEMO2303', title: 'งานกลุ่มทดสอบ', maxScore: 20, groupMax: 3, published: true, allowLate: false,
    dueAt: new Date(Date.now() + 7 * 86400000).toISOString(), ...extra
  });
}

function upload(b, id, assignmentId) {
  const { uploadUrl } = b.ok(mail(id), 'startUpload', { assignmentId, fileName: 'brand.pdf', mimeType: 'application/pdf', size: 1000, origin: ORIGIN });
  const fileId = uploadUrl.replace('demo-upload://', '');
  return { fileId, sub: b.ok(mail(id), 'finalizeUpload', { assignmentId, fileId }) };
}

test('assignment groupMax: validated and shown to students', () => {
  const b = loadBackend();
  assert.match(err(b, T, 'upsertAssignment', { courseCode: 'DEMO2303', title: 'x', maxScore: 5, groupMax: 1 }), /2–50/);
  assert.match(err(b, T, 'upsertAssignment', { courseCode: 'DEMO2303', title: 'x', maxScore: 5, groupMax: 2.5 }), /2–50/);
  const a = groupWork(b);
  assert.equal(a.groupMax, 3);
  assert.equal(b.ok(T, 'upsertAssignment', { courseCode: 'DEMO2303', title: 'เดี่ยว', maxScore: 5 }).groupMax, 0);
  reg(b, '69000103');
  const mine = b.ok(mail('69000103'), 'myAssignments', { courseCode: 'DEMO2303' }).find((x) => x.id === a.id);
  assert.equal(mine.groupMax, 3);
  assert.equal(mine.group, null);
  assert.equal(mine.submission, null);
});

test('students form their own groups within the limits', () => {
  const b = loadBackend();
  const a = groupWork(b);
  ['69000103', '69000104', '69000105', '69000106'].forEach((id) => reg(b, id));
  const s3 = mail('69000103');

  // ต้องอยู่กลุ่มก่อนส่งงาน
  assert.match(err(b, s3, 'startUpload', { assignmentId: a.id, fileName: 'a', size: 1, origin: ORIGIN }), /เข้ากลุ่ม/);

  // ผู้สร้างอยู่ในกลุ่มเสมอ แม้ไม่ได้เลือกตัวเอง
  const g = b.ok(s3, 'saveGroup', { assignmentId: a.id, name: 'สามสหาย', members: ['69000104'] });
  assert.deepEqual(g.members.map((m) => m.studentId), ['69000103', '69000104']);
  assert.match(err(b, s3, 'saveGroup', { assignmentId: a.id, name: 'อีกกลุ่ม', members: [] }), /อยู่ในกลุ่มอื่น/);

  // เกินจำนวน / คนที่อยู่กลุ่มอื่นแล้ว / ชื่อซ้ำ / ไม่อยู่ในวิชา
  assert.match(err(b, s3, 'saveGroup', { assignmentId: a.id, groupId: g.id, name: 'สามสหาย', members: ['69000103', '69000104', '69000105', '69000106'] }), /สูงสุด 3/);
  b.ok(mail('69000105'), 'saveGroup', { assignmentId: a.id, name: 'เดี่ยวดาย', members: [] });
  assert.match(err(b, mail('69000106'), 'saveGroup', { assignmentId: a.id, name: 'ใหม่', members: ['69000105'] }), /อยู่กลุ่ม "เดี่ยวดาย"/);
  assert.match(err(b, mail('69000106'), 'saveGroup', { assignmentId: a.id, name: 'สามสหาย', members: [] }), /มีกลุ่มชื่อ/);
  assert.match(err(b, mail('69000106'), 'saveGroup', { assignmentId: a.id, name: 'ใหม่', members: ['68000101'] }), /ไม่พบรหัส/);
  // คนนอกกลุ่มแก้กลุ่มคนอื่นไม่ได้
  assert.match(err(b, mail('69000106'), 'saveGroup', { assignmentId: a.id, groupId: g.id, name: 'ยึด', members: ['69000106'] }), /ไม่ได้อยู่ในกลุ่มนี้/);

  // สมาชิกเพิ่มเพื่อนได้ และเห็นว่าใครอยู่กลุ่มไหน
  b.ok(mail('69000104'), 'saveGroup', { assignmentId: a.id, groupId: g.id, name: 'สามสหาย', members: ['69000103', '69000104', '69000106'] });
  const opts = b.ok(mail('69000106'), 'groupOptions', { assignmentId: a.id });
  assert.equal(opts.groupMax, 3);
  assert.equal(opts.students.find((s) => s.studentId === '69000106').groupName, 'สามสหาย');
  assert.equal(opts.students.find((s) => s.studentId === '69000107').groupId, null);

  // งานเดี่ยวไม่มีกลุ่ม
  assert.match(err(b, s3, 'saveGroup', { assignmentId: 'A2', name: 'x', members: [] }), /ไม่ใช่งานกลุ่ม/);
});

test('group files are shared with every member and count for everyone', () => {
  const b = loadBackend();
  const a = groupWork(b);
  ['69000103', '69000104', '69000106'].forEach((id) => reg(b, id));
  const g = b.ok(mail('69000103'), 'saveGroup', { assignmentId: a.id, name: 'ทีม', members: ['69000104', '69000105'] });

  const { fileId, sub } = upload(b, '69000103', a.id);
  assert.equal(sub.files.length, 1);
  const f = b.db()._files[fileId];
  assert.deepEqual({ ...f.appProperties, startedAt: undefined }, { assignmentId: a.id, groupId: g.id, startedAt: undefined });
  // 69000105 ยังไม่สมัคร → ยังไม่ได้สิทธิ์
  assert.deepEqual([...f.shared].sort(), [mail('69000103'), mail('69000104')]);

  // สมาชิกคนอื่นเห็นไฟล์เดียวกัน และลบ/เพิ่มได้
  const seen = b.ok(mail('69000104'), 'myAssignments', { courseCode: 'DEMO2303' }).find((x) => x.id === a.id);
  assert.equal(seen.submission.files[0].id, fileId);
  assert.equal(seen.group.name, 'ทีม');
  // คนนอกกลุ่มอ้างไฟล์ของกลุ่มไม่ได้
  b.ok(mail('69000106'), 'saveGroup', { assignmentId: a.id, name: 'อื่น', members: [] });
  assert.match(err(b, mail('69000106'), 'finalizeUpload', { assignmentId: a.id, fileId }), /ไม่พบไฟล์/);
  assert.equal(b.ok(mail('69000106'), 'myAssignments', { courseCode: 'DEMO2303' }).find((x) => x.id === a.id).submission, null);

  // สมัครทีหลัง → ได้สิทธิ์ดูไฟล์ที่เพื่อนส่งไว้
  reg(b, '69000105');
  assert.ok(f.shared.includes(mail('69000105')));
  // เพิ่มสมาชิกใหม่ทีหลัง → ได้สิทธิ์เฉพาะคนใหม่
  reg(b, '69000107');
  b.ok(T, 'saveGroup', { assignmentId: a.id, groupId: g.id, name: 'ทีม', members: ['69000103', '69000104', '69000105', '69000107'] });
  assert.ok(f.shared.includes(mail('69000107')));

  // ลิงก์ของกลุ่ม
  const linked = b.ok(mail('69000105'), 'submitLink', { assignmentId: a.id, link: 'https://behance.net/x' });
  assert.equal(linked.link, 'https://behance.net/x');

  // สถิติของอาจารย์นับเป็นรายคน
  const card = b.ok(T, 'listAssignments', { courseCode: 'DEMO2303' }).find((x) => x.id === a.id);
  assert.equal(card.counts.groups, 2);
  assert.equal(card.counts.submitted, 4);

  // ฝั่งคะแนนของนักศึกษา: ส่งแล้วทุกคนในกลุ่ม
  assert.equal(b.ok(mail('69000104'), 'myGrades', { courseCode: 'DEMO2303' }).assignments.find((x) => x.id === a.id).submitted, true);
});

test('teacher grades a group per member; graded groups are locked', () => {
  const b = loadBackend();
  const a = groupWork(b);
  ['69000103', '69000104'].forEach((id) => reg(b, id));
  const g = b.ok(mail('69000103'), 'saveGroup', { assignmentId: a.id, name: 'ทีม', members: ['69000104'] });
  upload(b, '69000103', a.id);

  const list = b.ok(T, 'listSubmissions', { assignmentId: a.id });
  assert.equal(list.groups.length, 1);
  assert.equal(list.groups[0].submission.files.length, 1);
  assert.equal(list.rows.find((r) => r.studentId === '69000104').groupId, g.id);
  assert.equal(list.rows.find((r) => r.studentId === '69000104').submission.files.length, 1);
  assert.equal(list.rows.find((r) => r.studentId === '69000105').groupId, null);

  // คะแนนเท่ากันทั้งกลุ่ม ปรับรายคนได้
  b.ok(T, 'saveGrades', { assignmentId: a.id, items: [
    { studentId: '69000103', score: 18, feedback: 'ดีมาก' },
    { studentId: '69000104', score: 15, feedback: 'ดีมาก · ช่วยงานน้อยกว่า' }] });
  const m3 = b.ok(mail('69000103'), 'myAssignments', { courseCode: 'DEMO2303' }).find((x) => x.id === a.id);
  const m4 = b.ok(mail('69000104'), 'myAssignments', { courseCode: 'DEMO2303' }).find((x) => x.id === a.id);
  assert.equal(m3.submission.score, 18);
  assert.equal(m4.submission.score, 15);
  assert.equal(m4.submission.files.length, 1, 'still sees the group files');
  const gb = b.ok(T, 'gradebook', { courseCode: 'DEMO2303' });
  assert.equal(gb.students.find((s) => s.studentId === '69000104').scores[a.id], 15);

  // ตรวจแล้ว: ส่งเพิ่ม แก้กลุ่ม ออกจากกลุ่ม ไม่ได้ — อาจารย์ยังแก้ได้
  assert.match(err(b, mail('69000104'), 'submitLink', { assignmentId: a.id, link: 'https://x.y' }), /ตรวจให้คะแนนแล้ว/);
  assert.match(err(b, mail('69000104'), 'saveGroup', { assignmentId: a.id, groupId: g.id, name: 'ใหม่', members: ['69000104'] }), /ตรวจให้คะแนนแล้ว/);
  assert.match(err(b, mail('69000104'), 'leaveGroup', { assignmentId: a.id }), /ตรวจให้คะแนนแล้ว/);
  b.ok(T, 'saveGroup', { assignmentId: a.id, groupId: g.id, name: 'ทีม', members: ['69000103', '69000104', '69000108'] });
});

test('leaving, moving and deleting groups', () => {
  const b = loadBackend();
  const a = groupWork(b);
  ['69000103', '69000104', '69000105'].forEach((id) => reg(b, id));
  const g = b.ok(mail('69000103'), 'saveGroup', { assignmentId: a.id, name: 'ทีม', members: ['69000104'] });
  const { fileId } = upload(b, '69000103', a.id);

  b.ok(mail('69000104'), 'leaveGroup', { assignmentId: a.id });
  assert.match(err(b, mail('69000104'), 'leaveGroup', { assignmentId: a.id }), /ยังไม่ได้อยู่ในกลุ่ม/);
  // สมาชิกคนสุดท้ายต้องลบงานก่อนออก
  assert.match(err(b, mail('69000103'), 'leaveGroup', { assignmentId: a.id }), /คนสุดท้าย/);
  assert.match(err(b, T, 'deleteGroup', { groupId: g.id }), /ส่งงานแล้ว/);
  b.ok(mail('69000103'), 'removeFile', { assignmentId: a.id, fileId });
  b.ok(mail('69000103'), 'leaveGroup', { assignmentId: a.id });
  assert.equal(b.ok(T, 'listSubmissions', { assignmentId: a.id }).groups.length, 0);

  // อาจารย์ย้ายคนข้ามกลุ่มได้ กลุ่มที่ว่างและไม่มีงานจะหายไป
  const g1 = b.ok(mail('69000104'), 'saveGroup', { assignmentId: a.id, name: 'หนึ่ง', members: [] });
  const g2 = b.ok(mail('69000105'), 'saveGroup', { assignmentId: a.id, name: 'สอง', members: [] });
  b.ok(T, 'saveGroup', { assignmentId: a.id, groupId: g2.id, name: 'สอง', members: ['69000105', '69000104'] });
  const groups = b.ok(T, 'listSubmissions', { assignmentId: a.id }).groups;
  assert.deepEqual(groups.map((x) => x.id), [g2.id]);
  assert.equal(groups[0].members.length, 2);
  // อาจารย์ลบกลุ่มที่ยังไม่ส่งได้ และสร้างกลุ่มให้ได้เกินจำนวน
  b.ok(T, 'deleteGroup', { groupId: g2.id });
  const big = b.ok(T, 'saveGroup', { assignmentId: a.id, name: 'ใหญ่', members: ['69000101', '69000102', '69000103', '69000104'] });
  assert.equal(big.members.length, 4);
  assert.equal(g1.name, 'หนึ่ง');

  // ลบนักศึกษาออกจากวิชา → หลุดจากกลุ่ม
  b.ok(T, 'removeStudent', { courseCode: 'DEMO2303', studentId: '69000104' });
  assert.equal(b.ok(T, 'listSubmissions', { assignmentId: a.id }).groups[0].members.length, 3);
});

test('deadline locks group changes; type cannot flip once used', () => {
  const b = loadBackend();
  const a = groupWork(b);
  reg(b, '69000103');
  b.ok(mail('69000103'), 'saveGroup', { assignmentId: a.id, name: 'ทีม', members: [] });
  assert.match(err(b, T, 'upsertAssignment', { ...a, groupMax: 0 }), /เปลี่ยนระหว่างงานเดี่ยว/);
  assert.match(err(b, T, 'upsertAssignment', { id: 'A1', courseCode: 'DEMO2303', title: 'x', maxScore: 10, groupMax: 3 }), /เปลี่ยนระหว่างงานเดี่ยว/);
  // เปลี่ยนจำนวนสูงสุดได้
  assert.equal(b.ok(T, 'upsertAssignment', { ...a, groupMax: 4 }).groupMax, 4);

  b.setNow(new Date(Date.now() + 30 * 86400000).toISOString());
  assert.match(err(b, mail('69000103'), 'leaveGroup', { assignmentId: a.id }), /เลยกำหนด/);
  assert.match(err(b, mail('69000103'), 'saveGroup', { assignmentId: a.id, name: 'x', members: [] }), /เลยกำหนด/);

  // ลบงาน → กลุ่มหายด้วย
  b.setNow(undefined);
  b.ok(T, 'deleteAssignment', { id: a.id });
  assert.equal(b.db().Groups.filter((g) => g.assignmentId === a.id).length, 0);
});

test('demo seed has a group assignment with a group', () => {
  const b = loadBackend();
  const mine = b.ok(mail('69000101'), 'myAssignments', { courseCode: 'DEMO2303' }).find((x) => x.id === 'A4');
  assert.equal(mine.group.name, 'กาแฟดี');
  assert.deepEqual(mine.group.members.map((m) => m.studentId), ['69000101', '69000102']);
});

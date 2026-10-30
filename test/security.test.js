// ทดสอบช่องโหว่ที่เคยพบจากการตรวจความปลอดภัย — ห้ามให้กลับมาอีก
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./backend.js');

const T = 'teacher@demo.ac.th';
const ORIGIN = 'http://localhost:8080';
const S = '69000101@demo.ac.th'; // สมัครแล้วในข้อมูลสาธิต
const mail = (id) => id + '@demo.ac.th';
const day = 86400000;

function err(b, email, action, payload) {
  const r = b.call(email, action, payload);
  assert.equal(r.ok, false, `${action} should fail`);
  return r.error;
}

function work(b, extra = {}) {
  return b.ok(T, 'upsertAssignment', {
    courseCode: 'DEMO2303', title: 'งานทดสอบ', maxScore: 10, published: true, allowLate: false,
    dueAt: new Date(Date.now() + day).toISOString(), ...extra
  });
}

const start = (b, email, assignmentId) => b.ok(email, 'startUpload', {
  assignmentId, fileName: 'a.png', mimeType: 'image/png', size: 100, origin: ORIGIN
}).uploadUrl.replace('demo-upload://', '');

test('unknown or prototype action names are rejected', () => {
  const b = loadBackend();
  for (const action of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.match(err(b, S, action, {}), /ไม่รู้จักคำสั่ง/);
  }
});

test('finalizeUpload re-checks the deadline using the upload start time', () => {
  const b = loadBackend();
  const a = work(b);
  // เริ่มก่อนกำหนด จบหลังกำหนด → รับ และไม่นับว่าส่งช้า
  const early = start(b, S, a.id);
  b.setNow(new Date(Date.now() + 2 * day).toISOString());
  const sub = b.ok(S, 'finalizeUpload', { assignmentId: a.id, fileId: early });
  assert.equal(sub.files.length, 1);
  assert.equal(sub.isLate, false);
  // ไฟล์ที่เริ่มอัปโหลดหลังกำหนด (เช่นปลอมเวลาเริ่มไม่ได้) → เริ่มไม่ได้ตั้งแต่แรก
  assert.match(err(b, S, 'startUpload', { assignmentId: a.id, fileName: 'b', size: 1, origin: ORIGIN }), /เลยกำหนด/);
});

test('finalizeUpload refuses after grading and when hiding the assignment', () => {
  const b = loadBackend();
  const a = work(b);
  const f1 = start(b, S, a.id);
  const f2 = start(b, S, a.id);
  b.ok(S, 'finalizeUpload', { assignmentId: a.id, fileId: f1 });
  b.ok(T, 'saveGrades', { assignmentId: a.id, items: [{ studentId: '69000101', score: 8 }] });
  assert.match(err(b, S, 'finalizeUpload', { assignmentId: a.id, fileId: f2 }), /ตรวจให้คะแนนแล้ว/);

  const c = work(b);
  const f3 = start(b, S, c.id);
  b.ok(T, 'upsertAssignment', { ...c, id: c.id, published: false });
  assert.match(err(b, S, 'finalizeUpload', { assignmentId: c.id, fileId: f3 }), /ยังไม่เปิด/);
});

test('finalizeUpload enforces the per-submission file cap', () => {
  const b = loadBackend();
  const a = work(b);
  const ids = Array.from({ length: 21 }, () => start(b, S, a.id));
  ids.slice(0, 20).forEach((fileId) => b.ok(S, 'finalizeUpload', { assignmentId: a.id, fileId }));
  assert.match(err(b, S, 'finalizeUpload', { assignmentId: a.id, fileId: ids[20] }), /สูงสุด 20 ไฟล์/);
});

test('upload sessions are rate limited per account', () => {
  const b = loadBackend();
  const a = work(b);
  for (let i = 0; i < 60; i++) start(b, S, a.id);
  assert.match(err(b, S, 'startUpload', { assignmentId: a.id, fileName: 'x', size: 1, origin: ORIGIN }), /บ่อยเกินไป/);
});

test('leave attachment cannot be added after the teacher decides', () => {
  const b = loadBackend();
  const v = b.ok(S, 'submitLeave', { courseCode: 'DEMO2303', week: 6, date: '2026-11-27', type: 'sick', reason: 'ไข้' });
  const fileId = b.ok(S, 'startLeaveUpload', { leaveId: v.id, fileName: 'x.jpg', mimeType: 'image/jpeg', size: 100, origin: ORIGIN })
    .uploadUrl.replace('demo-upload://', '');
  b.ok(T, 'decideLeave', { leaveId: v.id, status: 'approved' });
  assert.match(err(b, S, 'finalizeLeaveUpload', { leaveId: v.id, fileId }), /พิจารณาแล้ว|แก้ไขไม่ได้|รออนุมัติ/);
});

test('MIME type from the browser is sanitised', () => {
  const b = loadBackend();
  const a = work(b);
  const fileId = b.ok(S, 'startUpload', { assignmentId: a.id, fileName: 'x', mimeType: 'text/html\r\nX: y', size: 1, origin: ORIGIN })
    .uploadUrl.replace('demo-upload://', '');
  assert.equal(b.db()._files[fileId].mimeType, 'application/octet-stream');
});

test('group board is closed to students once the assignment is hidden', () => {
  const b = loadBackend();
  const a = work(b, { groupMax: 3 });
  b.ok(mail('69000103'), 'register', {});
  const g = b.ok(mail('69000103'), 'saveGroup', { assignmentId: a.id, name: 'ก', members: [] });
  b.ok(mail('69000103'), 'groupBoard', { groupId: g.id });
  b.ok(T, 'upsertAssignment', { ...a, id: a.id, published: false });
  assert.match(err(b, mail('69000103'), 'groupBoard', { groupId: g.id }), /ซ่อน/);
  assert.match(err(b, mail('69000103'), 'saveTask', { groupId: g.id, title: 'x' }), /ซ่อน/);
  b.ok(T, 'groupBoard', { groupId: g.id });
});

test('students can add but not remove group members; leaving revokes file access', () => {
  const b = loadBackend();
  const a = work(b, { groupMax: 3 });
  ['69000103', '69000104', '69000105'].forEach((id) => b.ok(mail(id), 'register', {}));
  const s3 = mail('69000103');
  const g = b.ok(s3, 'saveGroup', { assignmentId: a.id, name: 'ก', members: ['69000104'] });
  assert.match(err(b, s3, 'saveGroup', { assignmentId: a.id, groupId: g.id, name: 'ก', members: [] }), /นำเพื่อนออกจากกลุ่มไม่ได้/);
  b.ok(s3, 'saveGroup', { assignmentId: a.id, groupId: g.id, name: 'ก', members: ['69000104', '69000105'] });

  const fileId = start(b, s3, a.id);
  b.ok(s3, 'finalizeUpload', { assignmentId: a.id, fileId });
  const f = b.db()._files[fileId];
  assert.ok(f.shared.includes(mail('69000104')));

  b.ok(mail('69000104'), 'leaveGroup', { assignmentId: a.id });
  assert.ok(!f.shared.includes(mail('69000104')), 'ออกจากกลุ่มแล้วต้องเห็นไฟล์ไม่ได้');

  // อาจารย์เอาออก → ถอนสิทธิ์ · อาจารย์ลบออกจากรายวิชา → ถอนสิทธิ์
  b.ok(T, 'saveGroup', { assignmentId: a.id, groupId: g.id, name: 'ก', members: ['69000103'] });
  assert.ok(!f.shared.includes(mail('69000105')));
  b.ok(T, 'saveGroup', { assignmentId: a.id, groupId: g.id, name: 'ก', members: ['69000103', '69000105'] });
  assert.ok(f.shared.includes(mail('69000105')));
  b.ok(T, 'removeStudent', { courseCode: 'DEMO2303', studentId: '69000105' });
  assert.ok(!f.shared.includes(mail('69000105')));
  assert.ok(f.shared.includes(s3));
});

test('teacher moving a student to another group revokes the old group files', () => {
  const b = loadBackend();
  const a = work(b, { groupMax: 3 });
  ['69000103', '69000104', '69000106'].forEach((id) => b.ok(mail(id), 'register', {}));
  const g1 = b.ok(mail('69000103'), 'saveGroup', { assignmentId: a.id, name: 'หนึ่ง', members: ['69000104'] });
  const fileId = start(b, mail('69000103'), a.id);
  b.ok(mail('69000103'), 'finalizeUpload', { assignmentId: a.id, fileId });
  b.ok(T, 'saveGroup', { assignmentId: a.id, name: 'สอง', members: ['69000104', '69000106'] });
  const f = b.db()._files[fileId];
  assert.ok(!f.shared.includes(mail('69000104')));
  assert.ok(f.shared.includes(mail('69000103')));
  assert.equal(g1.id, b.ok(mail('69000103'), 'myAssignments', { courseCode: 'DEMO2303' }).find((x) => x.id === a.id).group.id);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./backend.js');

const T = 'teacher@demo.ac.th';
const ORIGIN = 'http://localhost:8080';

/** สมัครด้วยรหัสและชื่อจากรายชื่อตัวอย่าง (อีเมล = <รหัส>@demo.ac.th) */
function reg(b, id) {
  const name = b.db().Students.find((r) => r.studentId === id).name.replace(/^(นางสาว|นาย)/, '');
  const [firstName, lastName] = name.split(' ');
  return b.ok(id + '@demo.ac.th', 'register', { studentId: id, firstName, lastName });
}

function err(b, email, action, payload) {
  const r = b.call(email, action, payload);
  assert.equal(r.ok, false, `${action} should fail`);
  return r.error;
}

test('rejects requests without a valid token and from other domains', () => {
  const b = loadBackend();
  assert.match(err(b, null, 'me', {}), /^AUTH: /);
  assert.match(err(b, 'x@gmail.com', 'me', {}), /^AUTH_DOMAIN/);
});

test('teacher sees all courses; students only their own', () => {
  const b = loadBackend();
  const t = b.ok(T, 'me');
  assert.equal(t.role, 'teacher');
  assert.equal(t.courses.length, 2);
  assert.deepEqual([...t.warnings], []);
  const s = b.ok('69000101@demo.ac.th', 'me');
  assert.equal(s.role, 'student');
  assert.equal(s.studentId, '69000101');
  assert.deepEqual(s.courses.map((c) => c.courseCode), ['DEMO2303']);
});

test('no auto-binding: a student with an id-like email must still register', () => {
  const b = loadBackend();
  const me = b.ok('69000103@demo.ac.th', 'me');
  assert.equal(me.needsBinding, true);
  assert.equal(me.courses.length, 0);
});

test('register: id and name must match the registrar roster', () => {
  const b = loadBackend();
  const e = 'piya@demo.ac.th';
  assert.match(err(b, e, 'myAssignments', { courseCode: 'DEMO2303' }), /ยืนยันรหัส/);
  assert.match(err(b, e, 'register', { studentId: '12345678', firstName: 'ก', lastName: 'ข' }), /ไม่พบรหัส/);
  assert.match(err(b, e, 'register', { studentId: '69000103', firstName: 'ปิยะ', lastName: 'ผิด' }), /ไม่ตรง/);
  assert.match(err(b, e, 'register', { studentId: '69000103', firstName: '', lastName: 'x' }), /ชื่อและนามสกุล/);
  // คำนำหน้าและช่องว่างไม่มีผล
  const me = b.ok(e, 'register', { studentId: '69000103', firstName: 'นางสาว ปิยะ', lastName: ' แสง ทอง ', nickname: 'ปิ่น', phone: '081-234-5678' });
  assert.equal(me.studentId, '69000103');
  assert.equal(me.needsBinding, false);
  assert.deepEqual(me.courses.map((c) => c.courseCode), ['DEMO2303']);
  const row = b.ok(T, 'listStudents', { courseCode: 'DEMO2303' }).find((s) => s.studentId === '69000103');
  assert.equal(row.email, e);
  assert.equal(row.nickname, 'ปิ่น');
  assert.equal(row.phone, '0812345678');
  assert.match(err(b, e, 'register', { studentId: '69000104', firstName: 'x', lastName: 'y' }), /สมัครแล้ว/);
  // คนอื่นสมัครรหัสเดียวกันไม่ได้ จนกว่าอาจารย์รีเซ็ต
  assert.match(err(b, 'other@demo.ac.th', 'register', { studentId: '69000103', firstName: 'ปิยะ', lastName: 'แสงทอง' }), /บัญชีอื่น/);
  b.ok(T, 'setStudentEmail', { studentId: '69000103', email: '' });
  assert.equal(b.ok('other@demo.ac.th', 'register', { studentId: '69000103', firstName: 'ปิยะ', lastName: 'แสงทอง' }).studentId, '69000103');
});

test('register: blocked after 5 wrong attempts', () => {
  const b = loadBackend();
  const e = 'guess@demo.ac.th';
  for (let i = 0; i < 5; i++) err(b, e, 'register', { studentId: '6900010' + i, firstName: 'สุ่ม', lastName: 'เดา' });
  assert.match(err(b, e, 'register', { studentId: '69000103', firstName: 'ปิยะ', lastName: 'แสงทอง' }), /หลายครั้งเกินไป/);
});

test('register spans every course that has the id; teacher can add late students', () => {
  const b = loadBackend();
  b.ok(T, 'addStudent', { courseCode: 'DEMO3314', studentId: '69000103', name: 'นางสาวปิยะ แสงทอง', group: 'เพิ่มเอง' });
  assert.match(err(b, T, 'addStudent', { courseCode: 'DEMO3314', studentId: '69000103', name: 'x' }), /อยู่ในวิชานี้แล้ว/);
  const me = reg(b, '69000103');
  assert.deepEqual(me.courses.map((c) => c.courseCode).sort(), ['DEMO2303', 'DEMO3314']);
  // เพิ่มเข้าวิชาใหม่หลังสมัครแล้ว → ใช้บัญชีเดิมทันที
  b.ok(T, 'importRoster', { course: { courseCode: 'NEW1001', title: 'ใหม่' }, students: [{ studentId: '69000103', name: 'นางสาวปิยะ แสงทอง' }] });
  assert.equal(b.ok('69000103@demo.ac.th', 'me').courses.length, 3);
});

test('students need a configured university domain; teacher is warned', () => {
  const b = loadBackend();
  b.ok(T, 'updateSettings', { allowedDomains: [] });
  assert.match(err(b, '69000101@demo.ac.th', 'me', {}), /ยังไม่เปิดรับ/);
  assert.equal(b.ok(T, 'me').warnings.length, 1);
});

test('students cannot call teacher actions or see other courses', () => {
  const b = loadBackend();
  const s = '69000101@demo.ac.th';
  assert.match(err(b, s, 'gradebook', { courseCode: 'DEMO2303' }), /เฉพาะอาจารย์/);
  assert.match(err(b, s, 'saveGrades', { assignmentId: 'A1', items: [] }), /เฉพาะอาจารย์/);
  assert.match(err(b, s, 'myAssignments', { courseCode: 'DEMO3314' }), /ไม่ได้ลงทะเบียน/);
});

test('import roster adds a course and keeps existing bindings', () => {
  const b = loadBackend();
  b.ok('69000101@demo.ac.th', 'me');
  const r = b.ok(T, 'importRoster', {
    course: { courseCode: 'artd2303', title: 'คอมพิวเตอร์กราฟิก 2D', term: '2/2569', section: '01' },
    students: [
      { studentId: '69000101', name: 'นางสาวสมชาย ใจดี', group: 'ก' },
      { studentId: '69000999', name: 'นายใหม่ เข้ามา', group: 'ก' },
      { studentId: 'bad', name: 'x' }
    ]
  });
  assert.equal(r.course.courseCode, 'ARTD2303');
  assert.equal(r.added, 2);
  const list = b.ok(T, 'listStudents', { courseCode: 'ARTD2303' });
  assert.equal(list.find((s) => s.studentId === '69000101').email, '69000101@demo.ac.th');
  // นำเข้าซ้ำ = อัปเดต ไม่ซ้ำแถว
  const again = b.ok(T, 'importRoster', { course: { courseCode: 'ARTD2303' }, students: [{ studentId: '69000101', name: 'ชื่อใหม่' }] });
  assert.equal(again.added, 0);
  assert.equal(again.updated, 1);
  assert.deepEqual(again.missing.map((m) => m.studentId), ['69000999']);
  assert.equal(b.ok(T, 'listStudents', { courseCode: 'ARTD2303' }).length, 2);
});

test('upload flow: start → finalize shares the file with the owner only', () => {
  const b = loadBackend();
  const s = '69000103@demo.ac.th';
  reg(b, '69000103');
  reg(b, '69000104');
  const { uploadUrl } = b.ok(s, 'startUpload', { assignmentId: 'A2', fileName: 'poster/v1.psd', mimeType: 'image/vnd.adobe.photoshop', size: 300 * 1024 * 1024, origin: ORIGIN });
  const fileId = uploadUrl.replace('demo-upload://', '');
  const f = b.db()._files[fileId];
  assert.equal(f.name, 'poster_v1.psd');
  assert.deepEqual({ ...f.appProperties }, { assignmentId: 'A2', studentId: '69000103' });

  // นักศึกษาคนอื่นอ้างไฟล์นี้ไม่ได้
  assert.match(err(b, '69000104@demo.ac.th', 'finalizeUpload', { assignmentId: 'A2', fileId }), /ไม่พบไฟล์/);

  const sub = b.ok(s, 'finalizeUpload', { assignmentId: 'A2', fileId });
  assert.equal(sub.files.length, 1);
  assert.equal(sub.isLate, false);
  assert.ok(sub.submittedAt);
  assert.deepEqual([...f.shared], [s]);

  // finalize ซ้ำไม่เพิ่มไฟล์ซ้ำ
  assert.equal(b.ok(s, 'finalizeUpload', { assignmentId: 'A2', fileId }).files.length, 1);

  const mine = b.ok(s, 'myAssignments', { courseCode: 'DEMO2303' });
  assert.equal(mine.find((a) => a.id === 'A2').submission.files[0].id, fileId);

  // ลบไฟล์ → กลับเป็นยังไม่ส่ง
  const removed = b.ok(s, 'removeFile', { assignmentId: 'A2', fileId });
  assert.equal(removed.files.length, 0);
  assert.equal(removed.submittedAt, '');
  assert.equal(f.trashed, true);
});

test('upload guards: origin, size, deadline, graded work', () => {
  const b = loadBackend();
  const s = '69000103@demo.ac.th';
  reg(b, '69000103');
  const base = { assignmentId: 'A2', fileName: 'a.png', mimeType: 'image/png', size: 1000, origin: ORIGIN };
  assert.match(err(b, s, 'startUpload', { ...base, origin: 'https://evil.example' }), /ไม่ได้รับอนุญาต/);
  assert.match(err(b, s, 'startUpload', { ...base, size: 0 }), /ว่างเปล่า/);
  assert.match(err(b, s, 'startUpload', { ...base, size: 3000 * 1024 * 1024 }), /ใหญ่เกิน/);
  assert.match(err(b, '69000103@demo.ac.th', 'startUpload', { ...base, assignmentId: 'A3' }), /ไม่ได้ลงทะเบียน/);

  // A2 ไม่รับงานช้า
  b.setNow(new Date(Date.now() + 30 * 86400000).toISOString());
  assert.match(err(b, s, 'startUpload', base), /เลยกำหนด/);
  // A1 รับงานช้า → ส่งได้ แต่ถูกทำเครื่องหมายว่าช้า
  const lateUrl = b.ok(s, 'startUpload', { ...base, assignmentId: 'A1' }).uploadUrl;
  const late = b.ok(s, 'finalizeUpload', { assignmentId: 'A1', fileId: lateUrl.replace('demo-upload://', '') });
  assert.equal(late.isLate, true);

  // งานที่ตรวจแล้ว แก้ไม่ได้
  assert.match(err(b, '69000101@demo.ac.th', 'submitLink', { assignmentId: 'A1', link: 'https://x.y' }), /ตรวจให้คะแนนแล้ว/);
  assert.match(err(b, s, 'submitLink', { assignmentId: 'A1', link: 'javascript:alert(1)' }), /https/);
});

test('teacher grades, takes attendance and exams; gradebook totals', () => {
  const b = loadBackend();
  const a = b.ok(T, 'upsertAssignment', { courseCode: 'DEMO3314', title: 'งานทดสอบ', maxScore: 50, dueAt: '2020-01-01T00:00:00Z', allowLate: false, published: true });
  assert.match(err(b, T, 'saveGrades', { assignmentId: a.id, items: [{ studentId: '68000101', score: 51 }] }), /0–50/);
  assert.match(err(b, T, 'saveGrades', { assignmentId: a.id, items: [{ studentId: '99999999', score: 1 }] }), /ไม่พบรหัส/);
  const graded = b.ok(T, 'saveGrades', { assignmentId: a.id, items: [{ studentId: '68000101', score: 45, feedback: 'ดีมาก' }] });
  const row = graded.rows.find((r) => r.studentId === '68000101');
  assert.equal(row.submission.score, 45);
  assert.equal(row.submission.feedback, 'ดีมาก');

  const marks = Array(16).fill('');
  marks[0] = 'P'; marks[1] = 'P'; marks[2] = 'L';
  const att = b.ok(T, 'saveAttendance', { courseCode: 'DEMO3314', rows: [{ studentId: '68000101', marks }] });
  assert.deepEqual(att.heldWeeks, [1, 2, 3]);
  assert.match(err(b, T, 'saveAttendance', { courseCode: 'DEMO3314', rows: [{ studentId: '68000101', marks: ['X'] }] }), /ไม่ถูกต้อง/);

  b.ok(T, 'saveExams', { courseCode: 'DEMO3314', maxMidterm: 40, maxFinal: 60, rows: [{ studentId: '68000101', midterm: 30, final: 48 }] });
  assert.match(err(b, T, 'saveExams', { courseCode: 'DEMO3314', maxMidterm: 40, maxFinal: 60, rows: [{ studentId: '68000101', midterm: 41 }] }), /0–40/);

  const gb = b.ok(T, 'gradebook', { courseCode: 'DEMO3314' });
  const st = gb.students.find((s) => s.studentId === '68000101');
  // เช็คชื่อ 2.5/3 = 83.33% × 10, งาน 45/50 (A3 ยังไม่ถึงกำหนด ไม่นับ) × 50, กลางภาค 30/40 × 20, ปลายภาค 48/60 × 20
  assert.equal(st.result.parts.attendance.points, 8.33);
  assert.equal(st.result.parts.assignments.points, 45);
  assert.equal(st.result.total, 8.33 + 45 + 15 + 16);
  assert.equal(st.result.grade, 'A');

  // นักศึกษาเห็นเกรดเมื่ออาจารย์เปิดเผยเท่านั้น
  reg(b, '68000101');
  assert.equal(b.ok('68000101@demo.ac.th', 'myGrades', { courseCode: 'DEMO3314' }).grade, null);
  b.ok(T, 'updateCourse', { courseCode: 'DEMO3314', gradesVisible: true });
  const mine = b.ok('68000101@demo.ac.th', 'myGrades', { courseCode: 'DEMO3314' });
  assert.equal(mine.grade, 'A');
  assert.equal(mine.exams.midterm, 30);
});

test('cannot delete an assignment that has submissions', () => {
  const b = loadBackend();
  assert.match(err(b, T, 'deleteAssignment', { id: 'A1' }), /ลบไม่ได้/);
  const a = b.ok(T, 'upsertAssignment', { courseCode: 'DEMO2303', title: 'ลบได้', maxScore: 5 });
  b.ok(T, 'deleteAssignment', { id: a.id });
  assert.equal(b.ok(T, 'listAssignments', { courseCode: 'DEMO2303' }).some((x) => x.id === a.id), false);
});

test('settings: teacher cannot remove themselves; values validated', () => {
  const b = loadBackend();
  assert.match(err(b, T, 'updateSettings', { teacherEmails: ['other@demo.ac.th'] }), /อีเมลของคุณเอง/);
  assert.match(err(b, T, 'updateSettings', { attendancePoints: { P: 2, L: 0, E: 0, A: 0 } }), /0–1/);
  const s = b.ok(T, 'updateSettings', { allowedDomains: ['@g.cmru.ac.th', 'demo.ac.th'] });
  assert.deepEqual(s.allowedDomains, ['g.cmru.ac.th', 'demo.ac.th']);
});

test('values that look like formulas are escaped before writing to the sheet', () => {
  const b = loadBackend();
  const out = b.ctx.toArray_({ headers: ['a', 'b', 'c', 'd'] }, { a: '=IMPORTXML("x")', b: '-5', c: { x: 1 }, d: null });
  assert.deepEqual([...out], ["'=IMPORTXML(\"x\")", '-5', '{"x":1}', '']);
});

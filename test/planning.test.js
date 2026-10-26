const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./backend.js');

const T = 'teacher@demo.ac.th';
const ORIGIN = 'http://localhost:8080';
const S1 = '69000101@demo.ac.th'; // สมัครแล้ว · กลุ่ม กาแฟดี (G1) ของงาน A4
const plain = (x) => JSON.parse(JSON.stringify(x));

function err(b, email, action, payload) {
  const r = b.call(email, action, payload);
  assert.equal(r.ok, false, `${action} should fail`);
  return r.error;
}

test('syllabus: teacher edits, enrolled students read, others cannot', () => {
  const b = loadBackend();
  const empty = b.ok(T, 'getSyllabus', { courseCode: 'DEMO3314' });
  assert.equal(empty.syllabus.weeks.length, 16);
  assert.equal(empty.syllabus.description, '');

  const weeks = Array.from({ length: 20 }, (_, i) => ({ topic: 'สัปดาห์ ' + (i + 1), detail: 'x'.repeat(2000) }));
  const saved = b.ok(T, 'saveSyllabus', { courseCode: 'DEMO3314', syllabus: { description: 'คำอธิบาย', contact: 'ห้อง 12', weeks } });
  assert.equal(saved.syllabus.weeks.length, 16, 'always 16 weeks');
  assert.equal(saved.syllabus.weeks[0].detail.length, 1000, 'trimmed');
  assert.equal(saved.syllabus.contact, 'ห้อง 12');
  assert.ok(saved.updatedAt);
  // บันทึกบางช่อง ไม่ลบช่องอื่น
  assert.equal(b.ok(T, 'saveSyllabus', { courseCode: 'DEMO3314', syllabus: { objectives: 'ข้อ 1' } }).syllabus.description, 'คำอธิบาย');

  b.ok('68000101@demo.ac.th', 'register', {});
  assert.equal(b.ok('68000101@demo.ac.th', 'getSyllabus', { courseCode: 'DEMO3314' }).syllabus.description, 'คำอธิบาย');
  assert.match(err(b, S1, 'getSyllabus', { courseCode: 'DEMO3314' }), /ไม่ได้ลงทะเบียน/);
  assert.match(err(b, '68000101@demo.ac.th', 'saveSyllabus', { courseCode: 'DEMO3314', syllabus: {} }), /เฉพาะอาจารย์/);
  assert.match(err(b, T, 'saveSyllabus', { courseCode: 'DEMO3314', syllabus: { weeks: Array(16).fill({ topic: '"'.repeat(200), detail: '"'.repeat(1000) }), description: '"'.repeat(5000), objectives: '"'.repeat(5000) } }), /ยาวเกินไป/);
});

test('syllabus attachments: links and uploaded files (public link), removable', () => {
  const b = loadBackend();
  assert.match(err(b, T, 'addSyllabusLink', { courseCode: 'DEMO3314', url: 'http://x.y' }), /https/);
  const withLink = b.ok(T, 'addSyllabusLink', { courseCode: 'DEMO3314', name: 'เว็บวิชา', url: 'https://example.com/a' });
  assert.equal(withLink.syllabus.attachments[0].kind, 'link');

  const { uploadUrl } = b.ok(T, 'startSyllabusUpload', { courseCode: 'DEMO3314', fileName: 'syllabus.pdf', mimeType: 'application/pdf', size: 5000, origin: ORIGIN });
  const fileId = uploadUrl.replace('demo-upload://', '');
  // ไฟล์งานนักศึกษาเอามาเป็นไฟล์ syllabus ไม่ได้
  assert.match(err(b, T, 'finalizeSyllabusUpload', { courseCode: 'DEMO2303', fileId }), /ไม่พบไฟล์/);
  const withFile = b.ok(T, 'finalizeSyllabusUpload', { courseCode: 'DEMO3314', fileId });
  assert.equal(withFile.syllabus.attachments.length, 2);
  assert.equal(b.db()._files[fileId].public, true);
  assert.equal(b.ok(T, 'finalizeSyllabusUpload', { courseCode: 'DEMO3314', fileId }).syllabus.attachments.length, 2, 'idempotent');

  const left = b.ok(T, 'removeSyllabusAttachment', { courseCode: 'DEMO3314', id: fileId });
  assert.equal(left.syllabus.attachments.length, 1);
  assert.equal(b.db()._files[fileId].trashed, true);
  assert.match(err(b, '69000101@demo.ac.th', 'startSyllabusUpload', { courseCode: 'DEMO2303', fileName: 'x', size: 1, origin: ORIGIN }), /เฉพาะอาจารย์/);
});

test('board: every group card listed; only members open the kanban; teacher reads', () => {
  const b = loadBackend();
  b.ok('69000103@demo.ac.th', 'register', {});
  const other = b.ok('69000103@demo.ac.th', 'saveGroup', { assignmentId: 'A4', name: 'อีกทีม', members: [] });

  const mine = b.ok(S1, 'boardGroups', { courseCode: 'DEMO2303' });
  assert.equal(mine.length, 1);
  assert.equal(mine[0].assignment.id, 'A4');
  const cards = mine[0].groups;
  assert.deepEqual(cards.map((g) => g.name).sort(), ['กาแฟดี', 'อีกทีม']);
  assert.deepEqual(plain(cards.find((g) => g.id === 'G1').counts), { todo: 2, doing: 1, done: 1 });
  assert.equal(cards.find((g) => g.id === other.id).counts, null, 'other groups: no plan details');
  assert.equal(cards.find((g) => g.id === other.id).mine, false);
  assert.equal(mine[0].ungrouped, 5);

  assert.match(err(b, '69000103@demo.ac.th', 'groupBoard', { groupId: 'G1' }), /เฉพาะแผนงานของกลุ่มตัวเอง/);
  const board = b.ok(S1, 'groupBoard', { groupId: 'G1' });
  assert.equal(board.canEdit, true);
  assert.equal(board.tasks.length, 4);

  const tv = b.ok(T, 'groupBoard', { groupId: 'G1' });
  assert.equal(tv.canEdit, false);
  assert.equal(tv.tasks.length, 4);
  assert.match(err(b, T, 'saveTask', { groupId: 'G1', title: 'x' }), /เฉพาะนักศึกษา/);
  assert.equal(b.ok(T, 'boardGroups', { courseCode: 'DEMO2303' })[0].groups.every((g) => g.counts), true);
});

test('tasks: create, move, assign, validate, delete', () => {
  const b = loadBackend();
  assert.match(err(b, S1, 'saveTask', { groupId: 'G1', title: '' }), /ชื่องานย่อย/);
  const made = b.ok(S1, 'saveTask', { groupId: 'G1', title: 'ถ่ายภาพสินค้า', assignee: '69000102', dueAt: '2030-01-05T10:00:00Z' });
  const t = made.tasks.find((x) => x.title === 'ถ่ายภาพสินค้า');
  assert.equal(t.status, 'todo');
  assert.equal(t.createdBy, '69000101');
  assert.equal(t.dueAt, '2030-01-05T10:00:00.000Z');

  const moved = b.ok(S1, 'saveTask', { groupId: 'G1', id: t.id, status: 'doing' });
  const m = moved.tasks.find((x) => x.id === t.id);
  assert.equal(m.status, 'doing');
  assert.equal(m.title, 'ถ่ายภาพสินค้า', 'partial update keeps other fields');
  assert.equal(m.assignee, '69000102');

  assert.match(err(b, S1, 'saveTask', { groupId: 'G1', id: t.id, status: 'later' }), /สถานะ/);
  assert.match(err(b, S1, 'saveTask', { groupId: 'G1', id: t.id, assignee: '69000105' }), /สมาชิกกลุ่ม/);
  assert.match(err(b, S1, 'saveTask', { groupId: 'G1', id: t.id, dueAt: 'พรุ่งนี้' }), /ไม่ถูกต้อง/);
  assert.match(err(b, S1, 'saveTask', { groupId: 'G1', id: 'nope', status: 'done' }), /ไม่พบงานย่อย/);

  assert.equal(b.ok(S1, 'deleteTask', { groupId: 'G1', id: t.id }).tasks.some((x) => x.id === t.id), false);
  assert.match(err(b, S1, 'deleteTask', { groupId: 'G1', id: t.id }), /ไม่พบงานย่อย/);
});

test('tasks are removed with their group', () => {
  const b = loadBackend();
  b.ok(T, 'setStudentEmail', { studentId: '69000102', email: '69000102@demo.ac.th' });
  b.ok('69000102@demo.ac.th', 'leaveGroup', { assignmentId: 'A4' });
  assert.equal(b.db().Tasks.length, 4, 'group still has a member');
  b.ok(S1, 'leaveGroup', { assignmentId: 'A4' });
  assert.equal(b.db().Tasks.length, 0);
});

test('timeline: student sees own status + own group tasks; teacher sees counts', () => {
  const b = loadBackend();
  const tl = b.ok(S1, 'timeline', { courseCode: 'DEMO2303' });
  const byId = Object.fromEntries(tl.items.map((i) => [i.id, i]));
  assert.equal(byId.A1.status, 'graded');
  assert.equal(byId.A2.status, 'open');
  assert.equal(byId.A4.groupMax, 3);
  assert.ok(byId.A1.start < byId.A1.end);
  assert.equal(tl.tasks.length, 4);
  assert.equal(tl.tasks.find((t) => t.title === 'ออกแบบโลโก้ 3 แบบ').mine, true);
  assert.equal(tl.tasks[0].groupName, 'กาแฟดี');

  b.ok('69000105@demo.ac.th', 'register', {});
  const lonely = b.ok('69000105@demo.ac.th', 'timeline', { courseCode: 'DEMO2303' });
  assert.equal(lonely.tasks.length, 0, 'no access to other groups tasks');
  assert.equal(lonely.items.find((i) => i.id === 'A1').status, 'missing');

  b.ok(T, 'upsertAssignment', { courseCode: 'DEMO2303', title: 'ซ่อน', maxScore: 5, published: false });
  const tt = b.ok(T, 'timeline', { courseCode: 'DEMO2303' });
  assert.equal(tt.items.length, 4);
  assert.equal(tt.items.find((i) => i.title === 'ซ่อน').published, false);
  assert.equal(tt.items.find((i) => i.id === 'A1').counts.submitted, 2);
  assert.equal(tt.tasks.length, 0);
  assert.equal(lonely.items.some((i) => i.title === 'ซ่อน'), false);
});

test('student dashboard: to-do, missing, my tasks, feedback', () => {
  const b = loadBackend();
  const d = b.ok(S1, 'studentDashboard', { courseCode: 'DEMO2303' });
  assert.deepEqual(plain(d.counts), { total: 3, submitted: 1, graded: 1, missing: 0 });
  assert.deepEqual(d.todo.map((x) => x.id), ['A2', 'A4']);
  assert.equal(d.feedback[0].feedback, 'สีสวย ตัวอักษรอ่านง่าย');
  // งานย่อยที่ยังไม่เสร็จ ของฉัน หรือยังไม่มีคนรับ
  assert.deepEqual(d.tasks.map((t) => t.title), ['ออกแบบโลโก้ 3 แบบ', 'เลือกชุดสี + ฟอนต์']);
  assert.deepEqual(plain(d.attendance.tally), { P: 2, L: 0, E: 0, A: 0 });
  assert.equal(d.grade, null, 'hidden until the teacher publishes grades');

  b.ok('69000105@demo.ac.th', 'register', {});
  const late = b.ok('69000105@demo.ac.th', 'studentDashboard', { courseCode: 'DEMO2303' });
  assert.deepEqual(late.missing.map((x) => x.id), ['A1']);
  assert.deepEqual(late.todo.map((x) => x.id), ['A1', 'A2', 'A4'], 'late-allowed missing work stays on the to-do list');
  assert.match(err(b, T, 'studentDashboard', { courseCode: 'DEMO2303' }), /เฉพาะนักศึกษา/);
});

test('teacher dashboard: counts, to-grade, at-risk, grade spread', () => {
  const b = loadBackend();
  const d = b.ok(T, 'teacherDashboard', { courseCode: 'DEMO2303' });
  assert.equal(d.counts.students, 8);
  assert.equal(d.counts.registered, 1);
  assert.equal(d.counts.assignments, 3);
  assert.equal(d.counts.toGrade, 1, '69000102 sent A1 late, not graded');
  assert.equal(d.assignments.find((a) => a.id === 'A1').toGrade, 1);
  // A1 เลยกำหนด: 6 คนไม่ส่ง = ขาดส่ง 1 งาน · 69000104 ขาดเรียน 1/2 = 50% · 69000106 สาย 1/2 = 75%
  assert.deepEqual(d.atRisk.list.map((s) => s.studentId), ['69000104', '69000106']);
  assert.equal(d.atRisk.total, 2);
  assert.equal(d.grades.reduce((n, g) => n + g.count, 0), 8);
  assert.equal(d.attendanceAvg, 90.63);
  assert.match(err(b, S1, 'teacherDashboard', { courseCode: 'DEMO2303' }), /เฉพาะอาจารย์/);
});

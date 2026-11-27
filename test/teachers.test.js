// หลายอาจารย์: แต่ละคนเห็น/แก้ได้เฉพาะวิชาที่ตัวเองสอน · ผู้ดูแลระบบจัดการบัญชีอาจารย์
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./backend.js');

const T = 'teacher@demo.ac.th';      // ผู้ดูแลระบบ · สอน DEMO2303, DEMO3314
const T2 = 'teacher2@demo.ac.th';    // อาจารย์ทั่วไป · ยังไม่มีวิชา
const S = '69000101@demo.ac.th';
const ORIGIN = 'http://localhost:8080';

function err(b, email, action, payload) {
  const r = b.call(email, action, payload);
  assert.equal(r.ok, false, `${action} should fail`);
  return r.error;
}

const codes = (b, email) => b.ok(email, 'me').courses.map((c) => c.courseCode);
const snapshot = (b) => { const { _rate, ...rest } = b.db(); return JSON.stringify(rest); };

test('teachers only see their own courses', () => {
  const b = loadBackend();
  assert.deepEqual(codes(b, T), ['DEMO2303', 'DEMO3314']);
  assert.deepEqual(codes(b, T2), []);
  const me = b.ok(T, 'me');
  assert.equal(me.admin, true);
  assert.deepEqual([...me.courses[0].owners], [T]);
  assert.equal(b.ok(T2, 'me').admin, false);
  // นักศึกษาไม่เห็นรายชื่อผู้สอน
  assert.equal(b.ok(S, 'me').courses[0].owners, undefined);
});

test("another teacher cannot read or change a course they don't teach", () => {
  const b = loadBackend();
  const g = b.ok(T, 'saveGroup', { assignmentId: 'A4', name: 'กลุ่มทดสอบ', members: ['69000101'] });
  const leave = b.ok(S, 'submitLeave', { courseCode: 'DEMO2303', week: 6, date: '2026-12-03', type: 'sick', reason: 'ไข้' });
  b.ok(T, 'openCheckIn', { courseCode: 'DEMO2303', week: 9, lateAfterMin: 15 });
  const C = { courseCode: 'DEMO2303' };
  const calls = [
    ['listStudents', C], ['setStudentNote', { ...C, studentId: '69000101', note: 'x' }],
    ['setStudentEmail', { ...C, studentId: '69000101', email: '' }],
    ['addStudent', { ...C, studentId: '69009999', name: 'x' }], ['removeStudent', { ...C, studentId: '69000101' }],
    ['deleteCourse', { ...C, preview: true }], ['deleteCourse', { ...C, pin: '1234' }],
    ['listAssignments', C], ['upsertAssignment', { ...C, title: 'x', maxScore: 5 }],
    ['upsertAssignment', { ...C, id: 'A1', title: 'x', maxScore: 5 }], ['deleteAssignment', { id: 'A1' }],
    ['listSubmissions', { assignmentId: 'A1' }], ['saveGrades', { assignmentId: 'A1', items: [{ studentId: '69000101', score: 1 }] }],
    ['getAttendance', C], ['saveAttendance', { ...C, rows: [] }],
    ['setAttendanceMarks', { ...C, changes: [{ studentId: '69000101', week: 3, mark: 'A' }] }],
    ['getExams', C], ['saveExams', { ...C, maxMidterm: 100, maxFinal: 100, rows: [] }],
    ['gradebook', C], ['updateCourse', { ...C, gradesVisible: true }], ['teacherDashboard', C],
    ['listLeaves', C], ['decideLeave', { leaveId: leave.id, status: 'approved' }],
    ['openCheckIn', { ...C, week: 10, lateAfterMin: 0 }], ['checkInStatus', C], ['closeCheckIn', { ...C, markAbsent: true }],
    ['saveSyllabus', { ...C, syllabus: { description: 'x' } }], ['addSyllabusLink', { ...C, url: 'https://example.com', name: 'x' }],
    ['startSyllabusUpload', { ...C, fileName: 'x.pdf', mimeType: 'application/pdf', size: 10, origin: ORIGIN }],
    ['finalizeSyllabusUpload', { ...C, fileId: 'x' }], ['removeSyllabusAttachment', { ...C, id: 'x' }],
    ['getSyllabus', C], ['timeline', C], ['boardGroups', C], ['groupBoard', { groupId: g.id }],
    ['groupOptions', { assignmentId: 'A4' }], ['saveGroup', { assignmentId: 'A4', name: 'แอบ', members: ['69000102'] }],
    ['saveGroup', { assignmentId: 'A4', groupId: g.id, name: 'แอบ', members: [] }], ['deleteGroup', { groupId: g.id }],
    ['importRoster', { course: { courseCode: 'DEMO2303', title: 'x' }, students: [{ studentId: '69000101', name: 'x' }] }],
    ['setCourseOwners', { ...C, owners: [T2] }]
  ];
  const before = snapshot(b);
  for (const [action, payload] of calls) {
    const e = err(b, T2, action, payload);
    assert.match(e, /ไม่พบวิชา|มีอาจารย์ท่านอื่นใช้อยู่/, `${action}: ${e}`);
  }
  assert.equal(snapshot(b), before, 'nothing changed');
  // นักศึกษาก็ใช้คำสั่งอาจารย์ไม่ได้
  assert.match(err(b, S, 'setCourseOwners', { ...C, owners: [T2] }), /เฉพาะอาจารย์/);
});

test('a second teacher creates their own course; the admin cannot open it either', () => {
  const b = loadBackend();
  const res = b.ok(T2, 'importRoster', {
    course: { courseCode: 'DEMO2303-02', title: 'ตอน 2', section: '02' },
    students: [{ studentId: '69000101', name: 'นางสาวสมชาย ใจดี' }, { studentId: '69000501', name: 'นายใหม่ คนดี' }]
  });
  assert.equal(res.added, 2);
  assert.deepEqual(codes(b, T2), ['DEMO2303-02']);
  assert.deepEqual(codes(b, T), ['DEMO2303', 'DEMO3314']);
  assert.match(err(b, T, 'listStudents', { courseCode: 'DEMO2303-02' }), /ไม่พบวิชา/);
  // นักศึกษาที่สมัครแล้วเห็นวิชาใหม่ทันที
  assert.ok(codes(b, S).includes('DEMO2303-02'));
  // โฟลเดอร์วิชาแชร์ให้ผู้สอน
  assert.deepEqual([...b.db()._folderShares['DEMO2303-02']], [T2]);
});

test('co-teachers: owners add and remove each other; the admin can reassign any course', () => {
  const b = loadBackend();
  assert.match(err(b, T, 'setCourseOwners', { courseCode: 'DEMO2303', owners: [] }), /อย่างน้อย 1 คน/);
  assert.match(err(b, T, 'setCourseOwners', { courseCode: 'DEMO2303', owners: [T, 'nobody@demo.ac.th'] }), /ยังไม่มีบัญชีอาจารย์/);
  assert.match(err(b, T, 'setCourseOwners', { courseCode: 'DEMO2303', owners: [T, 'not an email'] }), /อีเมลไม่ถูกต้อง/);

  b.ok(T, 'setCourseOwners', { courseCode: 'DEMO2303', owners: [T, T2.toUpperCase()] });
  assert.deepEqual(codes(b, T2), ['DEMO2303']);
  b.ok(T2, 'getAttendance', { courseCode: 'DEMO2303' });
  assert.ok(b.db()._folderShares.DEMO2303.includes(T2));

  // ผู้สอนร่วมเอาเจ้าของเดิมออกได้ → เจ้าของเดิมไม่เห็นแล้ว
  const r = b.ok(T2, 'setCourseOwners', { courseCode: 'DEMO2303', owners: [T2] });
  assert.equal(r.removedSelf, false);
  assert.deepEqual(codes(b, T), ['DEMO3314']);
  assert.ok(!b.db()._folderShares.DEMO2303.includes(T));
  // ผู้ดูแลระบบโอนกลับได้ (แม้ไม่ได้สอนวิชานี้แล้ว)
  b.ok(T, 'setCourseOwners', { courseCode: 'DEMO2303', owners: [T] });
  assert.deepEqual(codes(b, T2), []);
  // อาจารย์ทั่วไปทำแบบนั้นไม่ได้
  assert.match(err(b, T2, 'setCourseOwners', { courseCode: 'DEMO2303', owners: [T2] }), /ไม่พบวิชา/);
});

test('admin manages teacher accounts', () => {
  const b = loadBackend();
  assert.match(err(b, T2, 'adminOverview', {}), /ผู้ดูแลระบบ/);
  assert.match(err(b, T2, 'adminSaveTeacher', { email: T2, role: 'admin' }), /ผู้ดูแลระบบ/);
  assert.match(err(b, S, 'adminOverview', {}), /เฉพาะอาจารย์/);

  const ov = b.ok(T, 'adminOverview', {});
  assert.deepEqual(ov.teachers.map((t) => t.email).sort(), [T2, T]);
  const admin = ov.teachers.find((t) => t.email === T);
  assert.deepEqual([...admin.courses], ['DEMO2303', 'DEMO3314']);
  assert.ok(admin.usedBytes > 0);
  assert.equal(ov.courses.length, 2);

  // เพิ่มอาจารย์ใหม่ → เข้าระบบเป็นอาจารย์ทันที
  const t3 = 'Teacher3@Demo.ac.th';
  assert.match(err(b, 'teacher3@demo.ac.th', 'listStudents', { courseCode: 'DEMO2303' }), /เฉพาะอาจารย์/);
  const v = b.ok(T, 'adminSaveTeacher', { email: t3, name: 'อ.สาม', expiresAt: '2027-10-31', quotaGB: 50 });
  assert.deepEqual([v.email, v.role, v.status, v.quotaGB], ['teacher3@demo.ac.th', 'teacher', 'active', 50]);
  assert.equal(b.ok('teacher3@demo.ac.th', 'me').role, 'teacher');

  // ปิดบัญชี → ไม่ใช่อาจารย์แล้ว
  b.ok(T, 'adminSaveTeacher', { email: 'teacher3@demo.ac.th', status: 'disabled' });
  assert.equal(b.ok('teacher3@demo.ac.th', 'me').role, 'student');

  assert.match(err(b, T, 'adminSaveTeacher', { email: T, role: 'teacher' }), /ของตัวเอง/);
  assert.match(err(b, T, 'adminSaveTeacher', { email: T, role: 'admin', status: 'disabled' }), /ของตัวเอง/);
  assert.match(err(b, T, 'adminSaveTeacher', { email: 'x@demo.ac.th', role: 'root' }), /บทบาท/);
  assert.match(err(b, T, 'adminSaveTeacher', { email: 'x@demo.ac.th', expiresAt: '31/10/2027' }), /วันหมดอายุ/);
  assert.match(err(b, T, 'adminSaveTeacher', { email: 'x@demo.ac.th', quotaGB: -1 }), /โควตา/);
  assert.match(err(b, T, 'adminSaveTeacher', { email: S }), /ผูกกับนักศึกษา/);

  // ลบได้เมื่อไม่ได้สอนวิชาใด
  assert.match(err(b, T, 'adminRemoveTeacher', { email: T }), /ของตัวเอง/);
  b.ok(T, 'setCourseOwners', { courseCode: 'DEMO3314', owners: [T, T2] });
  assert.match(err(b, T, 'adminRemoveTeacher', { email: T2 }), /DEMO3314/);
  b.ok(T, 'adminRemoveTeacher', { email: 'teacher3@demo.ac.th' });
  assert.ok(!b.ok(T, 'adminOverview', {}).teachers.some((t) => t.email === 'teacher3@demo.ac.th'));
});

test('admin resets a forgotten delete PIN', () => {
  const b = loadBackend();
  b.ok(T2, 'updateSettings', { deletePin: { next: '1234' } });
  assert.equal(b.ok(T2, 'getSettings').hasDeletePin, true);
  b.ok(T, 'adminSaveTeacher', { email: T2, resetPin: true });
  assert.equal(b.ok(T2, 'getSettings').hasDeletePin, false);
});

test('expired membership is read-only; students are unaffected', () => {
  const b = loadBackend();
  b.ok(T, 'setCourseOwners', { courseCode: 'DEMO2303', owners: [T, T2] });
  b.ok(T, 'adminSaveTeacher', { email: T2, expiresAt: '2020-01-31' });
  const me = b.ok(T2, 'me');
  assert.deepEqual([me.expired, me.expiresAt], [true, '2020-01-31']);
  b.ok(T2, 'getAttendance', { courseCode: 'DEMO2303' });
  assert.match(err(b, T2, 'setAttendanceMarks', { courseCode: 'DEMO2303', changes: [] }), /หมดอายุ/);
  assert.match(err(b, T2, 'importRoster', { course: { courseCode: 'NEW1' }, students: [{ studentId: '69000101', name: 'x' }] }), /หมดอายุ/);
  // ผู้ดูแลระบบไม่หมดอายุ
  b.ok(T, 'adminSaveTeacher', { email: T, role: 'admin', expiresAt: '2020-01-31' });
  b.ok(T, 'setAttendanceMarks', { courseCode: 'DEMO2303', changes: [] });
  b.ok(S, 'submitLink', { assignmentId: 'A2', link: 'https://example.com/work' });
  // ต่ออายุ → ใช้ได้
  b.ok(T, 'adminSaveTeacher', { email: T2, expiresAt: '2099-12-31' });
  b.ok(T2, 'setAttendanceMarks', { courseCode: 'DEMO2303', changes: [] });
});

test('storage quota of the course owner limits new uploads', () => {
  const b = loadBackend();
  const start = (p = {}) => b.call(S, 'startUpload', { assignmentId: 'A2', fileName: 'x.png', mimeType: 'image/png', size: 1024, origin: ORIGIN, ...p });
  assert.equal(start().ok, true);
  const used = b.ok(T, 'adminOverview', {}).teachers.find((t) => t.email === T).usedBytes;
  b.ok(T, 'adminSaveTeacher', { email: T, role: 'admin', quotaGB: (used + 2048) / 1024 ** 3 });
  assert.equal(start().ok, true);
  assert.match(start({ size: 4096 }).error, /พื้นที่เก็บไฟล์ของวิชานี้เต็ม/);
  b.ok(T, 'adminSaveTeacher', { email: T, role: 'admin', quotaGB: '' });
  assert.equal(start({ size: 4096 }).ok, true);
});

test('setup migrates the old teacher list: owner becomes admin, existing courses keep their teachers', () => {
  const b = loadBackend();
  const db = b.db();
  db.Teachers = [];
  db.Courses.forEach((c) => { c.owners = ''; });
  db.Settings.push({ key: 'teacherEmails', value: 'owner@demo.ac.th,helper@demo.ac.th' },
    { key: 'deletePinSalt', value: 'salt' }, { key: 'deletePinHash', value: 'hash' });
  const res = b.ctx.migrateTeachers_('Owner@demo.ac.th');
  assert.deepEqual([res.teachers, res.courses], [2, 2]);
  assert.deepEqual(db.Teachers.map((t) => [t.email, t.role, t.pinHash]), [['owner@demo.ac.th', 'admin', 'hash'], ['helper@demo.ac.th', 'teacher', '']]);
  assert.deepEqual(codes(b, 'helper@demo.ac.th'), ['DEMO2303', 'DEMO3314']);
  assert.equal(b.ok('owner@demo.ac.th', 'me').admin, true);
  // รันซ้ำไม่เปลี่ยนอะไร
  assert.deepEqual({ ...b.ctx.migrateTeachers_('owner@demo.ac.th') }, { teachers: 0, courses: 0 });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./backend.js');

const T = 'teacher@demo.ac.th';

function err(b, email, action, payload) {
  const r = b.call(email, action, payload);
  assert.equal(r.ok, false, `${action} should fail`);
  return r.error;
}

test('delete PIN: set once, changing needs the current PIN, stored only as a hash', () => {
  const b = loadBackend();
  assert.equal(b.ok(T, 'getSettings').hasDeletePin, false);
  assert.match(err(b, T, 'updateSettings', { deletePin: { next: '12' } }), /4–8 หลัก/);
  assert.match(err(b, T, 'updateSettings', { deletePin: { next: 'abcd' } }), /4–8 หลัก/);
  assert.equal(b.ok(T, 'updateSettings', { deletePin: { next: '2468' } }).hasDeletePin, true);

  const stored = b.db().Settings.filter((r) => /^deletePin/.test(r.key));
  assert.deepEqual([...stored.map((r) => r.key)].sort(), ['deletePinHash', 'deletePinSalt']);
  assert.ok(stored.every((r) => r.value !== '2468'), 'PIN itself is never stored');
  assert.equal(JSON.stringify(b.ok(T, 'getSettings')).includes('2468'), false);
  const oldSalt = stored.find((r) => r.key === 'deletePinSalt').value;

  assert.match(err(b, T, 'updateSettings', { deletePin: { next: '1357' } }), /PIN ไม่ถูกต้อง/);
  assert.match(err(b, T, 'updateSettings', { deletePin: { current: '0000', next: '1357' } }), /PIN ไม่ถูกต้อง/);
  b.ok(T, 'updateSettings', { deletePin: { current: '2468', next: '1357' } });
  // salt ใหม่ทุกครั้งที่ตั้ง PIN
  assert.notEqual(b.db().Settings.find((r) => r.key === 'deletePinSalt').value, oldSalt);
});

test('deleteCourse: preview counts, PIN required, removes only that course', () => {
  const b = loadBackend();
  const s = '69000101@demo.ac.th';
  assert.match(err(b, T, 'deleteCourse', { courseCode: 'DEMO2303', pin: '1234' }), /ยังไม่ได้ตั้ง PIN/);
  b.ok(T, 'updateSettings', { deletePin: { next: '1234' } });

  const preview = b.ok(T, 'deleteCourse', { courseCode: 'DEMO2303', preview: true });
  assert.deepEqual({ ...preview }, { students: 8, assignments: 3, submissions: 2, groups: 1 });
  assert.equal(b.ok(T, 'me').courses.length, 2, 'preview deletes nothing');

  assert.match(err(b, T, 'deleteCourse', { courseCode: 'DEMO2303', pin: '9999' }), /PIN ไม่ถูกต้อง/);
  assert.match(err(b, T, 'deleteCourse', { courseCode: 'DEMO2303' }), /PIN ไม่ถูกต้อง/);
  assert.match(err(b, s, 'deleteCourse', { courseCode: 'DEMO2303', pin: '1234' }), /เฉพาะอาจารย์/);
  assert.match(err(b, T, 'deleteCourse', { courseCode: 'NOPE', pin: '1234' }), /ไม่พบวิชา/);

  const done = b.ok(T, 'deleteCourse', { courseCode: 'DEMO2303', pin: '1234' });
  assert.equal(done.filesTrashed, false);
  const db = b.db();
  assert.deepEqual([...db.Courses.map((c) => c.courseCode)], ['DEMO3314']);
  assert.equal(db.Students.some((r) => r.courseCode === 'DEMO2303'), false);
  assert.equal(db.Attendance.some((r) => r.courseCode === 'DEMO2303'), false);
  assert.deepEqual([...db.Assignments.map((a) => a.id)], ['A3']);
  assert.equal(db.Submissions.some((x) => ['A1', 'A2', 'A4'].includes(x.assignmentId)), false);
  assert.equal(db.Groups.length, 0);
  assert.equal((db._trashedFolders || []).length, 0, 'Drive untouched unless asked');
  // วิชาอื่นยังอยู่ครบ
  assert.equal(db.Students.filter((r) => r.courseCode === 'DEMO3314').length, 8);
  // นักศึกษาของวิชาที่ลบไม่มีวิชาเหลือ แต่ยังล็อกอินได้
  assert.equal(b.ok(s, 'me').courses.length, 0);
});

test('deleteCourse can move the course Drive folder to trash', () => {
  const b = loadBackend();
  b.ok(T, 'updateSettings', { deletePin: { next: '1234' } });
  assert.equal(b.ok(T, 'deleteCourse', { courseCode: 'DEMO3314', pin: '1234', trashFiles: true }).filesTrashed, true);
  assert.deepEqual([...b.db()._trashedFolders], ['DEMO3314']);
});

test('wrong PIN 5 times locks deletion for an hour', () => {
  const b = loadBackend();
  b.ok(T, 'updateSettings', { deletePin: { next: '1234' } });
  for (let i = 0; i < 5; i++) err(b, T, 'deleteCourse', { courseCode: 'DEMO2303', pin: '000' + i });
  assert.match(err(b, T, 'deleteCourse', { courseCode: 'DEMO2303', pin: '1234' }), /หลายครั้งเกินไป/);
  assert.equal(b.ok(T, 'me').courses.length, 2);
});

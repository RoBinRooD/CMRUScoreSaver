const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./backend.js');

const T = 'teacher@demo.ac.th';
const C = 'DEMO2303';
const SECRET = 'เรียนอ่อน-ลับเฉพาะอาจารย์-7f3a';

function err(b, email, action, payload) {
  const r = b.call(email, action, payload);
  assert.equal(r.ok, false, `${action} should fail`);
  return r.error;
}

test('teacher notes: saved per course, shown in teacher views, kept on roster re-import', () => {
  const b = loadBackend();
  const v = b.ok(T, 'setStudentNote', { courseCode: C, studentId: '69000104', note: '  ' + SECRET + '  ' });
  assert.equal(v.note, SECRET);
  assert.equal(b.ok(T, 'listStudents', { courseCode: C }).find((s) => s.studentId === '69000104').note, SECRET);
  assert.equal(b.ok(T, 'getAttendance', { courseCode: C }).rows.find((s) => s.studentId === '69000104').note, SECRET);
  assert.equal(b.ok(T, 'gradebook', { courseCode: C }).students.find((s) => s.studentId === '69000104').note, SECRET);
  assert.equal(b.ok(T, 'listSubmissions', { assignmentId: 'A1' }).rows.find((s) => s.studentId === '69000104').note, SECRET);
  assert.equal(b.ok(T, 'teacherDashboard', { courseCode: C }).atRisk.list.find((s) => s.studentId === '69000104').note, SECRET);

  b.ok(T, 'importRoster', { course: { courseCode: C }, students: [{ studentId: '69000104', name: 'นายอรุณี มีสุข' }] });
  assert.equal(b.ok(T, 'listStudents', { courseCode: C }).find((s) => s.studentId === '69000104').note, SECRET, 're-import keeps notes');

  assert.equal(b.ok(T, 'setStudentNote', { courseCode: C, studentId: '69000104', note: '' }).note, '');
  assert.match(err(b, T, 'setStudentNote', { courseCode: C, studentId: '68000101', note: 'x' }), /ไม่พบรหัส/);
  assert.equal(b.ok(T, 'setStudentNote', { courseCode: C, studentId: '69000101', note: 'ก'.repeat(3000) }).note.length, 2000);
});

test('teacher notes never reach students through any student action', () => {
  const b = loadBackend();
  const S = '69000101@demo.ac.th'; // อยู่กลุ่ม G1 กับ 69000102
  ['69000101', '69000102'].forEach((studentId) => b.ok(T, 'setStudentNote', { courseCode: C, studentId, note: SECRET }));
  assert.match(err(b, S, 'setStudentNote', { courseCode: C, studentId: '69000101', note: 'x' }), /เฉพาะอาจารย์/);
  assert.match(err(b, S, 'listStudents', { courseCode: C }), /เฉพาะอาจารย์/);
  const calls = [
    ['me', {}], ['myAssignments', { courseCode: C }], ['myGrades', { courseCode: C }],
    ['studentDashboard', { courseCode: C }], ['timeline', { courseCode: C }], ['getSyllabus', { courseCode: C }],
    ['boardGroups', { courseCode: C }], ['groupBoard', { groupId: 'G1' }], ['groupOptions', { assignmentId: 'A4' }],
    ['myLeaves', { courseCode: C }]
  ];
  calls.forEach(([action, payload]) => {
    const out = JSON.stringify(b.ok(S, action, payload));
    assert.equal(out.includes(SECRET), false, `${action} leaks the teacher note`);
  });
  // นักศึกษาที่ยังไม่สมัคร (หน้าสมัคร) ก็ไม่เห็น
  b.ok(T, 'setStudentNote', { courseCode: C, studentId: '69000103', note: SECRET });
  assert.equal(JSON.stringify(b.ok('69000103@demo.ac.th', 'me')).includes(SECRET), false);
});

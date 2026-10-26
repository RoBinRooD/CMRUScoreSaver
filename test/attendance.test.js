const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./backend.js');

const T = 'teacher@demo.ac.th';
const C = 'DEMO2303';

function err(b, email, action, payload) {
  const r = b.call(email, action, payload);
  assert.equal(r.ok, false, `${action} should fail`);
  return r.error;
}
const marks = (b, id) => b.ok(T, 'getAttendance', { courseCode: C }).rows.find((r) => r.studentId === id).marks;

test('setAttendanceMarks writes only the changed cells', () => {
  const b = loadBackend();
  const before = marks(b, '69000101');
  const res = b.ok(T, 'setAttendanceMarks', { courseCode: C, changes: [
    { studentId: '69000101', week: 3, mark: 'P' }, { studentId: '69000102', week: 3, mark: 'l' }] });
  assert.equal(res.saved, 2);
  assert.deepEqual([...res.heldWeeks], [1, 2, 3]);
  assert.ok(res.savedAt);
  assert.deepEqual(marks(b, '69000101'), [...before.slice(0, 2), 'P', ...before.slice(3)]);
  assert.equal(marks(b, '69000102')[2], 'L');
  // ส่งซ้ำได้ ผลเหมือนเดิม
  b.ok(T, 'setAttendanceMarks', { courseCode: C, changes: [{ studentId: '69000101', week: 3, mark: 'P' }] });
  assert.equal(marks(b, '69000101')[2], 'P');
  // ล้างช่องทั้งสัปดาห์ → สัปดาห์นั้นไม่นับว่าเช็คแล้ว
  const cleared = b.ok(T, 'setAttendanceMarks', { courseCode: C, changes: [
    { studentId: '69000101', week: 3, mark: '' }, { studentId: '69000102', week: 3, mark: '' }] });
  assert.deepEqual([...cleared.heldWeeks], [1, 2]);
});

test('setAttendanceMarks does not overwrite a leave approved meanwhile', () => {
  const b = loadBackend();
  b.ok(T, 'decideLeave', { leaveId: 'V1', status: 'approved' }); // 69000104 สัปดาห์ 2 → E
  // หน้าเช็คชื่อที่เปิดค้างไว้ส่งเฉพาะช่องสัปดาห์ 3
  b.ok(T, 'setAttendanceMarks', { courseCode: C, changes: [{ studentId: '69000104', week: 3, mark: 'P' }] });
  const m = marks(b, '69000104');
  assert.equal(m[1], 'E');
  assert.equal(m[2], 'P');
});

test('setAttendanceMarks validates input and creates rows for new students', () => {
  const b = loadBackend();
  assert.match(err(b, T, 'setAttendanceMarks', { courseCode: C, changes: [{ studentId: '69000101', week: 0, mark: 'P' }] }), /สัปดาห์/);
  assert.match(err(b, T, 'setAttendanceMarks', { courseCode: C, changes: [{ studentId: '69000101', week: 4, mark: 'X' }] }), /ไม่ถูกต้อง/);
  assert.match(err(b, T, 'setAttendanceMarks', { courseCode: C, changes: [{ studentId: '68000101', week: 4, mark: 'P' }] }), /ไม่พบรหัส/);
  assert.match(err(b, '69000101@demo.ac.th', 'setAttendanceMarks', { courseCode: C, changes: [] }), /เฉพาะอาจารย์/);
  // ทั้งชุดไม่บันทึกถ้ามีช่องผิด
  err(b, T, 'setAttendanceMarks', { courseCode: C, changes: [{ studentId: '69000101', week: 5, mark: 'P' }, { studentId: '69000101', week: 99, mark: 'P' }] });
  assert.equal(b.db().Attendance.filter((r) => r.courseCode === C).every((r) => !r.w5), true);

  b.ok(T, 'addStudent', { courseCode: C, studentId: '69000999', name: 'นายมาใหม่ ล่าสุด' });
  b.ok(T, 'setAttendanceMarks', { courseCode: C, changes: [{ studentId: '69000999', week: 1, mark: 'A' }] });
  assert.equal(marks(b, '69000999')[0], 'A');
  assert.equal(marks(b, '69000999').length, 16);
  assert.equal(b.ok(T, 'setAttendanceMarks', { courseCode: C, changes: [] }).saved, 0);
});

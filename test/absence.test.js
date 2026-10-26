const test = require('node:test');
const assert = require('node:assert/strict');
const Grade = require('../js/grade.js');
const { loadBackend } = require('./backend.js');

const T = 'teacher@demo.ac.th';
const C = 'DEMO2303';
const weeks = (n) => Array.from({ length: n }, (_, i) => i + 1);

test('absences: absent + late ÷ 2 (rounded down); leave does not count; blank in a held week = absent', () => {
  const a = Grade.absences(['A', 'L', 'L', 'L', 'E', 'E', '', 'P'], weeks(8));
  assert.equal(a.absent, 2); // A + ช่องว่างสัปดาห์ 7
  assert.equal(a.late, 3);
  assert.equal(a.leave, 2);
  assert.equal(a.effective, 3); // 2 + floor(3/2)
  assert.equal(a.warn, true);
  assert.equal(a.fail, false);
  // สัปดาห์ที่ยังไม่เช็ค ไม่นับ
  assert.equal(Grade.absences(['A', 'A', 'A', 'A', 'A'], [1, 2]).effective, 2);
});

test('more than 4 counted absences = F whatever the score; exactly 4 is still graded by score', () => {
  const full = { weights: Grade.DEFAULT_WEIGHTS, assignments: [{ score: 10, maxScore: 10, half: 1 }, { score: 10, maxScore: 10, half: 2 }], midterm: 10, maxMidterm: 10, final: 10, maxFinal: 10 };
  const marks = (a, l) => [...Array(a).fill('A'), ...Array(l).fill('L'), ...Array(16 - a - l).fill('P')];
  const four = Grade.compute({ ...full, heldWeeks: weeks(16), attendance: marks(2, 4) }); // 2 + 4/2 = 4
  assert.equal(four.absence.effective, 4);
  assert.equal(four.absence.fail, false);
  assert.equal(four.grade, 'A');
  const five = Grade.compute({ ...full, heldWeeks: weeks(16), attendance: marks(4, 2) }); // 4 + 1 = 5
  assert.equal(five.absence.effective, 5);
  assert.equal(five.absence.fail, true);
  assert.equal(five.grade, 'F');
  assert.equal(five.scoreGrade, 'A', 'score grade kept for reference');
  assert.ok(five.total > 80, 'total still shows the real score');
  // ลา 10 ครั้งไม่ทำให้ตก
  assert.equal(Grade.compute({ ...full, heldWeeks: weeks(16), attendance: [...Array(10).fill('E'), ...Array(6).fill('P')] }).grade, 'A');
  // เกณฑ์ปรับได้
  assert.equal(Grade.compute({ ...full, heldWeeks: weeks(16), attendance: marks(3, 0), attendanceRules: { failAbove: 2, warnAt: 1, latePerAbsence: 3 } }).grade, 'F');
  assert.equal(Grade.absences(marks(0, 9), weeks(16), { failAbove: 4, warnAt: 3, latePerAbsence: 0 }).effective, 0, '0 = lateness never counts');
});

test('backend: rules from settings drive gradebook, dashboards and the at-risk list', () => {
  const b = loadBackend();
  const marks = (a, l) => [...Array(a).fill('A'), ...Array(l).fill('L'), ...Array(8 - a - l).fill('P'), ...Array(8).fill('')];
  b.ok(T, 'saveAttendance', { courseCode: C, rows: [
    { studentId: '69000101', marks: marks(5, 0) }, // 5 → F
    { studentId: '69000102', marks: marks(2, 2) }, // 3 → ติดตาม
    { studentId: '69000103', marks: [...Array(6).fill('E'), 'P', 'P', ...Array(8).fill('')] }, // ลา 6 → ปกติ
    // คนอื่นมาครบ (สัปดาห์ที่เช็คแล้วแต่ช่องว่าง = ขาด)
    ...['69000104', '69000105', '69000106', '69000107', '69000108'].map((studentId) => ({ studentId, marks: marks(0, 0) }))
  ] });
  const gb = b.ok(T, 'gradebook', { courseCode: C });
  const st = (id) => gb.students.find((s) => s.studentId === id).result;
  assert.equal(st('69000101').grade, 'F');
  assert.equal(st('69000101').absence.effective, 5);
  assert.equal(st('69000102').absence.warn, true);
  assert.equal(st('69000102').absence.fail, false);
  assert.equal(st('69000103').absence.effective, 0);

  const d = b.ok(T, 'teacherDashboard', { courseCode: C });
  assert.equal(d.atRisk.failedByAbsence, 1);
  assert.equal(d.atRisk.list[0].studentId, '69000101', 'F by absence first');
  assert.equal(d.atRisk.list[1].studentId, '69000102');
  assert.equal(d.atRisk.list.some((s) => s.studentId === '69000103'), false);
  assert.deepEqual({ ...d.atRisk.rules }, { failAbove: 4, warnAt: 3, latePerAbsence: 2 });

  // นักศึกษาเห็นเกณฑ์และสถานะของตัวเอง แม้อาจารย์ยังไม่ประกาศเกรด
  const mine = b.ok('69000101@demo.ac.th', 'studentDashboard', { courseCode: C });
  assert.equal(mine.attendance.absence.fail, true);
  assert.equal(mine.grade, null);
  assert.equal(b.ok('69000101@demo.ac.th', 'myGrades', { courseCode: C }).attendance.absence.effective, 5);
  assert.equal(b.ok(T, 'getAttendance', { courseCode: C }).attendanceRules.failAbove, 4);

  // แก้เกณฑ์ในตั้งค่า
  b.ok(T, 'updateSettings', { attendanceRules: { failAbove: 5, warnAt: 4, latePerAbsence: 2 } });
  assert.equal(b.ok(T, 'gradebook', { courseCode: C }).students.find((s) => s.studentId === '69000101').result.absence.fail, false);
  const bad = b.call(T, 'updateSettings', { attendanceRules: { failAbove: 4.5, warnAt: 3, latePerAbsence: 2 } });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /จำนวนเต็ม/);
});

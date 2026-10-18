const test = require('node:test');
const assert = require('node:assert/strict');
const Grade = require('../js/grade.js');

test('letter grade uses cutoffs (inclusive lower bound)', () => {
  assert.equal(Grade.letter(80, Grade.DEFAULT_CUTOFFS), 'A');
  assert.equal(Grade.letter(79.99, Grade.DEFAULT_CUTOFFS), 'B+');
  assert.equal(Grade.letter(50, Grade.DEFAULT_CUTOFFS), 'D');
  assert.equal(Grade.letter(49.5, Grade.DEFAULT_CUTOFFS), 'F');
  assert.equal(Grade.letter(0, Grade.DEFAULT_CUTOFFS), 'F');
});

test('attendance counts only held weeks; blank in a held week = absent', () => {
  const marks = ['P', 'L', '', 'E', 'P'];
  const r = Grade.attendance(marks, [1, 2, 3, 4], Grade.DEFAULT_ATTENDANCE_POINTS);
  assert.deepEqual(r, { held: 4, earned: 2.5, pct: 62.5 });
  assert.equal(Grade.attendance(marks, [], null).pct, null);
});

test('assignments skip ungraded work that is not yet due', () => {
  const r = Grade.assignments([
    { score: 8, maxScore: 10 },
    { score: null, maxScore: 20, overdue: true }, // ไม่ส่งและเลยกำหนด = 0
    { score: null, maxScore: 50, overdue: false } // ยังไม่ถึงกำหนด ไม่นับ
  ]);
  assert.deepEqual(r, { counted: 2, earned: 8, max: 30, pct: 26.67 });
});

test('compute weights each part and sums to total', () => {
  const r = Grade.compute({
    weights: { attendance: 10, assignments: 50, midterm: 20, final: 20 },
    heldWeeks: [1, 2], attendance: ['P', 'P'],
    assignments: [{ score: 45, maxScore: 50 }],
    midterm: 30, maxMidterm: 40, final: 70, maxFinal: 100
  });
  assert.equal(r.parts.attendance.points, 10);
  assert.equal(r.parts.assignments.points, 45);
  assert.equal(r.parts.midterm.points, 15);
  assert.equal(r.parts.final.points, 14);
  assert.equal(r.total, 84);
  assert.equal(r.grade, 'A');
});

test('missing parts count as zero', () => {
  const r = Grade.compute({ assignments: [{ score: 50, maxScore: 50 }] });
  assert.equal(r.total, 50);
  assert.equal(r.parts.midterm.pct, null);
  assert.equal(r.grade, 'D');
});

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

test('attendance counts only marked cells in held weeks; blank = not checked yet', () => {
  const marks = ['P', 'L', '', 'E', 'P'];
  const r = Grade.attendance(marks, [1, 2, 3, 4], Grade.DEFAULT_ATTENDANCE_POINTS);
  assert.deepEqual(r, { held: 3, earned: 2.5, pct: 83.33 });
  assert.equal(Grade.attendance(marks, [], null).pct, null);
  assert.equal(Grade.attendance(['', ''], [1, 2], null).pct, null, 'never checked = no attendance score yet');
});

test('submitted but not yet graded work is not counted, even after the deadline', () => {
  const r = Grade.assignments([
    { score: 8, maxScore: 10, overdue: true },
    { score: null, maxScore: 20, overdue: true, submitted: true }, // ส่งแล้ว รอตรวจ
    { score: null, maxScore: 5, overdue: true, submitted: false } // ไม่ส่ง = 0
  ]);
  assert.deepEqual(r, { counted: 2, earned: 8, max: 15, pct: 53.33 });
});

test('assignments skip ungraded work that is not yet due', () => {
  const r = Grade.assignments([
    { score: 8, maxScore: 10 },
    { score: null, maxScore: 20, overdue: true }, // ไม่ส่งและเลยกำหนด = 0
    { score: null, maxScore: 50, overdue: false } // ยังไม่ถึงกำหนด ไม่นับ
  ]);
  assert.deepEqual(r, { counted: 2, earned: 8, max: 30, pct: 26.67 });
});

test('compute: each half gets half the work weight plus half the attendance', () => {
  const r = Grade.compute({
    weights: { attendance: 10, assignments: 70, midterm: 10, final: 10 },
    heldWeeks: [1, 2], attendance: ['P', 'P'],
    assignments: [
      { score: 45, maxScore: 50, half: 1 }, { score: 5, maxScore: 10, half: 1 }, // 50/60 = 83.33%
      { score: 20, maxScore: 20, half: 2 } // 100%
    ],
    midterm: 30, maxMidterm: 40, final: 70, maxFinal: 100
  });
  assert.equal(r.parts.attendance.points, 10);
  assert.equal(r.parts.assignments.first.pct, 83.33);
  assert.equal(r.parts.assignments.second.pct, 100);
  assert.equal(r.parts.assignments.pct, 91.67, 'average of the two halves');
  assert.equal(r.parts.assignments.points, 64.17);
  assert.equal(r.halves.first, 34.17); // 5 + 83.33% × 35
  assert.equal(r.halves.second, 40); // 5 + 100% × 35
  assert.equal(r.halves.midterm, 7.5);
  assert.equal(r.halves.final, 7);
  assert.deepEqual(r.halves.max, { first: 40, second: 40, midterm: 10, final: 10 });
  assert.equal(r.total, 88.67);
  assert.equal(r.grade, 'A');
});

test('a half with no counted work is zero; work without half counts as the first half', () => {
  const r = Grade.compute({ assignments: [{ score: 50, maxScore: 50 }] });
  assert.equal(r.parts.assignments.pct, 100, 'shown pct ignores the empty half');
  assert.equal(r.parts.assignments.points, 35);
  assert.equal(r.halves.first, 35);
  assert.equal(r.halves.second, 0);
  assert.equal(r.total, 35);
  assert.equal(r.parts.midterm.pct, null);
  assert.equal(r.grade, null, 'no grade until every weighted part has a score');
  assert.equal(r.complete, false);
  assert.equal(r.projectedGrade, 'A', '100% of the work counted so far');
  assert.equal(Grade.compute({}).parts.assignments.points, null);
  assert.equal(Grade.compute({}).projectedGrade, null);
});

test('early in term: no F from missing parts; projected grade from parts with scores', () => {
  const early = Grade.compute({
    heldWeeks: [1, 2, 3], attendance: ['P', 'P', 'P'],
    assignments: [{ score: 7, maxScore: 10, half: 1 }]
  });
  assert.equal(early.grade, null);
  assert.equal(early.scoreGrade, 'F', 'raw total is still low');
  // เข้าเรียน 100% × 10 + งาน 70% × 70 = 59 จาก 80 → 73.75 = B
  assert.equal(early.projectedTotal, 73.75);
  assert.equal(early.projectedGrade, 'B');

  const full = Grade.compute({
    heldWeeks: [1], attendance: ['P'], assignments: [{ score: 7, maxScore: 10, half: 1 }, { score: 7, maxScore: 10, half: 2 }],
    midterm: 7, maxMidterm: 10, final: 7, maxFinal: 10
  });
  assert.equal(full.complete, true);
  assert.equal(full.grade, Grade.letter(full.total, Grade.DEFAULT_CUTOFFS));
  // ส่วนที่น้ำหนัก 0 ไม่ต้องมีคะแนน
  const noMid = Grade.compute({
    weights: { attendance: 10, assignments: 70, midterm: 0, final: 20 },
    heldWeeks: [1], attendance: ['P'], assignments: [{ score: 10, maxScore: 10 }], final: 10, maxFinal: 10
  });
  assert.equal(noMid.complete, true);
  assert.ok(noMid.grade);
  // ขาดเกินเกณฑ์ = F ทันที แม้คะแนนยังไม่ครบ
  const absent = Grade.compute({ heldWeeks: [1, 2, 3, 4, 5], attendance: ['A', 'A', 'A', 'A', 'A'] });
  assert.equal(absent.grade, 'F');
  assert.equal(absent.projectedGrade, 'F');
});

test('total is the sum of the four registrar columns', () => {
  const r = Grade.compute({
    weights: { attendance: 20, assignments: 60, midterm: 10, final: 10 },
    heldWeeks: [1, 2, 3, 4], attendance: ['P', 'P', 'A', 'L'],
    assignments: [{ score: 7, maxScore: 10, half: 1 }, { score: 3, maxScore: 4, half: 2 }],
    midterm: 8, maxMidterm: 10, final: 6, maxFinal: 10
  });
  const h = r.halves;
  assert.deepEqual(h.max, { first: 40, second: 40, midterm: 10, final: 10 });
  assert.equal(h.first, 27.25); // 12.5/2 + 70% × 30
  assert.equal(h.second, 28.75); // 6.25 + 75% × 30
  assert.equal(r.total, Grade.round2(h.first + h.second + h.midterm + h.final));
});

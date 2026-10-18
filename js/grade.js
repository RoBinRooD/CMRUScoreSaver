/*
 * Grade — คำนวณคะแนนรวมและเกรด
 * ไฟล์นี้ใช้ร่วมกัน 3 ที่: เบราว์เซอร์ (window.Grade), Node tests, และ Apps Script (ถูกรวมเข้า dist/Code.gs)
 * จึงเขียนเป็น JavaScript ธรรมดา ไม่ใช้ import/export
 */
var Grade = (function () {
  var DEFAULT_WEIGHTS = { attendance: 10, assignments: 50, midterm: 20, final: 20 };
  var DEFAULT_CUTOFFS = [['A', 80], ['B+', 75], ['B', 70], ['C+', 65], ['C', 60], ['D+', 55], ['D', 50], ['F', 0]];
  // P = มา, L = สาย, E = ลา, A = ขาด
  var DEFAULT_ATTENDANCE_POINTS = { P: 1, L: 0.5, E: 1, A: 0 };
  var WEEKS = 16;
  var PARTS = ['attendance', 'assignments', 'midterm', 'final'];

  function num(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  /** marks: array ยาว 16 (index 0 = สัปดาห์ 1), heldWeeks: สัปดาห์ที่มีการเช็คชื่อแล้ว (เลข 1–16) */
  function attendance(marks, heldWeeks, points) {
    points = points || DEFAULT_ATTENDANCE_POINTS;
    var held = (heldWeeks || []).filter(function (w) { return w >= 1 && w <= WEEKS; });
    if (!held.length) return { held: 0, earned: 0, pct: null };
    var earned = 0;
    held.forEach(function (w) {
      var m = (marks || [])[w - 1] || 'A'; // สัปดาห์ที่เช็คแล้วแต่ไม่มีบันทึก = ขาด
      earned += num(points[m]) || 0;
    });
    return { held: held.length, earned: earned, pct: round2((earned / held.length) * 100) };
  }

  /** items: [{score, maxScore, overdue}] — นับงานที่ให้คะแนนแล้ว หรือเลยกำหนดส่งแล้ว (ไม่ส่ง = 0) */
  function assignments(items) {
    var got = 0, max = 0, counted = 0;
    (items || []).forEach(function (it) {
      var s = num(it.score), m = num(it.maxScore);
      if (!m || m <= 0) return;
      if (s === null && !it.overdue) return;
      got += s || 0;
      max += m;
      counted++;
    });
    return { counted: counted, earned: got, max: max, pct: max ? round2((got / max) * 100) : null };
  }

  function exam(score, max) {
    var s = num(score), m = num(max);
    if (s === null || !m) return { score: s, max: m, pct: null };
    return { score: s, max: m, pct: round2((s / m) * 100) };
  }

  function letter(total, cutoffs) {
    var list = (cutoffs && cutoffs.length ? cutoffs : DEFAULT_CUTOFFS).slice().sort(function (a, b) { return b[1] - a[1]; });
    for (var i = 0; i < list.length; i++) {
      if (total >= Number(list[i][1])) return list[i][0];
    }
    return list[list.length - 1][0];
  }

  /**
   * input: { weights, cutoffs, attendancePoints, heldWeeks, attendance (marks),
   *          assignments: [{score,maxScore,overdue}], midterm, maxMidterm, final, maxFinal }
   * คืน: { parts: {attendance, assignments, midterm, final}, total, grade }
   * ส่วนที่ยังไม่มีคะแนน (pct = null) นับเป็น 0 ในคะแนนรวม
   */
  function compute(input) {
    var w = input.weights || DEFAULT_WEIGHTS;
    var parts = {
      attendance: attendance(input.attendance, input.heldWeeks, input.attendancePoints),
      assignments: assignments(input.assignments),
      midterm: exam(input.midterm, input.maxMidterm),
      final: exam(input.final, input.maxFinal)
    };
    var total = 0;
    PARTS.forEach(function (k) {
      var weight = num(w[k]) || 0;
      var pct = parts[k].pct;
      parts[k].weight = weight;
      parts[k].points = pct === null ? null : round2((pct / 100) * weight);
      total += parts[k].points || 0;
    });
    total = round2(total);
    return { parts: parts, total: total, grade: letter(total, input.cutoffs) };
  }

  return {
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
    DEFAULT_CUTOFFS: DEFAULT_CUTOFFS,
    DEFAULT_ATTENDANCE_POINTS: DEFAULT_ATTENDANCE_POINTS,
    WEEKS: WEEKS,
    PARTS: PARTS,
    num: num,
    round2: round2,
    attendance: attendance,
    assignments: assignments,
    exam: exam,
    letter: letter,
    compute: compute
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Grade;

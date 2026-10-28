/*
 * Grade — คำนวณคะแนนรวมและเกรด
 * ไฟล์นี้ใช้ร่วมกัน 3 ที่: เบราว์เซอร์ (window.Grade), Node tests, และ Apps Script (ถูกรวมเข้า dist/Code.gs)
 * จึงเขียนเป็น JavaScript ธรรมดา ไม่ใช้ import/export
 */
var Grade = (function () {
  // คะแนนเก็บ 80 = เข้าเรียน 10 + งาน 70 → ระบบทะเบียน: เก็บครึ่งแรก 40 · เก็บครึ่งหลัง 40 · กลางภาค 10 · ปลายภาค 10
  var DEFAULT_WEIGHTS = { attendance: 10, assignments: 70, midterm: 10, final: 10 };
  var DEFAULT_CUTOFFS = [['A', 80], ['B+', 75], ['B', 70], ['C+', 65], ['C', 60], ['D+', 55], ['D', 50], ['F', 0]];
  // P = มา, L = สาย, E = ลา, A = ขาด
  var DEFAULT_ATTENDANCE_POINTS = { P: 1, L: 0.5, E: 1, A: 0 };
  // ขาดที่นับ = ขาด + (สาย ÷ latePerAbsence ปัดลง) · ลาไม่นับ · ตั้งแต่ warnAt = อาจารย์ติดตาม · เกิน failAbove = F
  var DEFAULT_ATTENDANCE_RULES = { failAbove: 4, warnAt: 3, latePerAbsence: 2 };
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

  /** สัปดาห์ที่นับของนักศึกษาคนนี้: อยู่ใน heldWeeks และมีเครื่องหมาย — ช่องว่าง = ยังไม่เช็ค ไม่นับ */
  function markedWeeks(marks, heldWeeks) {
    return (heldWeeks || []).filter(function (w) { return w >= 1 && w <= WEEKS && (marks || [])[w - 1]; });
  }

  /** marks: array ยาว 16 (index 0 = สัปดาห์ 1), heldWeeks: สัปดาห์ที่มีการเช็คชื่อแล้ว (เลข 1–16) */
  function attendance(marks, heldWeeks, points) {
    points = points || DEFAULT_ATTENDANCE_POINTS;
    var weeks = markedWeeks(marks, heldWeeks);
    if (!weeks.length) return { held: 0, earned: 0, pct: null };
    var earned = 0;
    weeks.forEach(function (w) { earned += num(points[marks[w - 1]]) || 0; });
    return { held: weeks.length, earned: earned, pct: round2((earned / weeks.length) * 100) };
  }

  /** นับการขาดเรียนตามเกณฑ์ — นับเฉพาะช่องที่เช็คแล้ว (ขาดต้องกด A) */
  function absences(marks, heldWeeks, rules) {
    var r = rules || DEFAULT_ATTENDANCE_RULES;
    var c = { A: 0, L: 0, E: 0 };
    markedWeeks(marks, heldWeeks).forEach(function (w) {
      var m = marks[w - 1];
      if (c[m] !== undefined) c[m]++;
    });
    var per = num(r.latePerAbsence) || 0;
    var effective = c.A + (per > 0 ? Math.floor(c.L / per) : 0);
    return {
      absent: c.A, late: c.L, leave: c.E, effective: effective,
      warnAt: num(r.warnAt), failAbove: num(r.failAbove), latePerAbsence: per,
      warn: num(r.warnAt) !== null && effective >= num(r.warnAt),
      fail: num(r.failAbove) !== null && effective > num(r.failAbove)
    };
  }

  /**
   * items: [{score, maxScore, overdue, submitted}] — นับงานที่ให้คะแนนแล้ว หรือเลยกำหนดแล้วไม่ได้ส่ง (= 0)
   * ส่งแล้วแต่ยังไม่ตรวจ = ยังไม่นับ
   */
  function assignments(items) {
    var got = 0, max = 0, counted = 0;
    (items || []).forEach(function (it) {
      var s = num(it.score), m = num(it.maxScore);
      if (!m || m <= 0) return;
      if (s === null && (!it.overdue || it.submitted)) return;
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
   * งานแบ่งเป็นครึ่งเทอมแรก/หลัง (half: 1 | 2, ไม่ระบุ = 1) แต่ละครึ่งได้น้ำหนักงานครึ่งหนึ่ง
   * คืน pct = ค่าเฉลี่ยของครึ่งที่มีงานนับแล้ว (สำหรับแสดง) และ points = คะแนนที่ใช้รวมจริง (ครึ่งที่ยังไม่มีงาน = 0)
   */
  function assignmentHalves(items, weight) {
    var byHalf = { 1: [], 2: [] };
    (items || []).forEach(function (it) { byHalf[Number(it.half) === 2 ? 2 : 1].push(it); });
    var first = assignments(byHalf[1]), second = assignments(byHalf[2]);
    var all = assignments(items);
    var pcts = [first.pct, second.pct].filter(function (p) { return p !== null; });
    all.first = first;
    all.second = second;
    all.pct = pcts.length ? round2(pcts.reduce(function (a, b) { return a + b; }, 0) / pcts.length) : null;
    all.halfPoints = [first, second].map(function (h) { return h.pct === null ? 0 : (h.pct / 100) * (weight / 2); });
    all.points = pcts.length ? round2(all.halfPoints[0] + all.halfPoints[1]) : null;
    return all;
  }

  /**
   * input: { weights, cutoffs, attendancePoints, attendanceRules, heldWeeks, attendance (marks),
   *          assignments: [{score,maxScore,overdue,half}], midterm, maxMidterm, final, maxFinal }
   * คืน: { parts: {attendance, assignments, midterm, final}, halves, absence, total, grade }
   * ขาดเรียนเกินเกณฑ์ = เกรด F (คะแนนรวมยังแสดงตามจริง)
   * grade = null จนกว่าทุกส่วนที่มีน้ำหนักจะมีคะแนน (ต้นเทอมไม่ขึ้น F เพราะส่วนที่ยังไม่มีคะแนนนับเป็น 0)
   * projectedGrade = แนวโน้มจากเฉพาะส่วนที่มีคะแนนแล้ว (เทียบเป็น 100)
   * halves = 4 ช่องของระบบทะเบียน: เก็บครึ่งแรก/หลัง (= เข้าเรียน ÷ 2 + งานของครึ่งนั้น), กลางภาค, ปลายภาค
   * ส่วนที่ยังไม่มีคะแนน (pct = null) นับเป็น 0 ในคะแนนรวม · total = ผลรวม 4 ช่อง
   */
  function compute(input) {
    var w = input.weights || DEFAULT_WEIGHTS;
    var wa = num(w.assignments) || 0;
    var parts = {
      attendance: attendance(input.attendance, input.heldWeeks, input.attendancePoints),
      assignments: assignmentHalves(input.assignments, wa),
      midterm: exam(input.midterm, input.maxMidterm),
      final: exam(input.final, input.maxFinal)
    };
    PARTS.forEach(function (k) {
      var weight = num(w[k]) || 0;
      var pct = parts[k].pct;
      parts[k].weight = weight;
      if (k !== 'assignments') parts[k].points = pct === null ? null : round2((pct / 100) * weight);
    });
    var att = parts.attendance.points || 0;
    var halves = {
      first: round2(att / 2 + parts.assignments.halfPoints[0]),
      second: round2(att / 2 + parts.assignments.halfPoints[1]),
      midterm: parts.midterm.points || 0,
      final: parts.final.points || 0,
      max: {
        first: round2(((num(w.attendance) || 0) + wa) / 2),
        second: round2(((num(w.attendance) || 0) + wa) / 2),
        midterm: num(w.midterm) || 0,
        final: num(w.final) || 0
      }
    };
    var total = round2(halves.first + halves.second + halves.midterm + halves.final);
    var absence = absences(input.attendance, input.heldWeeks, input.attendanceRules);
    var lowest = (input.cutoffs && input.cutoffs.length ? input.cutoffs : DEFAULT_CUTOFFS)
      .slice().sort(function (a, b) { return a[1] - b[1]; })[0][0];
    var got = 0, of = 0, complete = true;
    PARTS.forEach(function (k) {
      if (!parts[k].weight) return;
      if (parts[k].pct === null) { complete = false; return; }
      got += (parts[k].pct / 100) * parts[k].weight;
      of += parts[k].weight;
    });
    var projectedTotal = of ? round2((got / of) * 100) : null;
    return {
      parts: parts, halves: halves, absence: absence, total: total, complete: complete,
      grade: absence.fail ? lowest : complete ? letter(total, input.cutoffs) : null,
      scoreGrade: letter(total, input.cutoffs),
      projectedTotal: projectedTotal,
      projectedGrade: absence.fail ? lowest : projectedTotal === null ? null : letter(projectedTotal, input.cutoffs)
    };
  }

  return {
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
    DEFAULT_CUTOFFS: DEFAULT_CUTOFFS,
    DEFAULT_ATTENDANCE_POINTS: DEFAULT_ATTENDANCE_POINTS,
    DEFAULT_ATTENDANCE_RULES: DEFAULT_ATTENDANCE_RULES,
    absences: absences,
    WEEKS: WEEKS,
    PARTS: PARTS,
    num: num,
    round2: round2,
    attendance: attendance,
    assignments: assignments,
    assignmentHalves: assignmentHalves,
    exam: exam,
    letter: letter,
    compute: compute
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Grade;

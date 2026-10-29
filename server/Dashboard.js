/*
 * Dashboard — ภาพรวมของวิชา (อาจารย์ / นักศึกษา) และข้อมูล Timeline (Gantt)
 */

/** สถานะงานของนักศึกษา 1 คน: graded | submitted | late | missing | open */
function workStatus_(a, sub) {
  if (sub && sub.score !== null && sub.score !== undefined) return 'graded';
  if (sub && sub.submittedAt) return sub.isLate ? 'late' : 'submitted';
  return isPastDue_(a) ? 'missing' : 'open';
}

function publishedOf_(code) {
  return rows_('Assignments')
    .filter(function (a) { return a.courseCode === code && a.published === 'true'; })
    .sort(byDue_);
}

/** แผนงานในกลุ่มของนักศึกษาในวิชานี้ */
function myGroupTasks_(code, studentId) {
  var out = [];
  publishedOf_(code).forEach(function (a) {
    if (!isGroupWork_(a)) return;
    var g = groupOf_(a.id, studentId);
    if (!g) return;
    tasksOf_(g.id).forEach(function (t) {
      var v = taskView_(t);
      v.groupId = g.id;
      v.groupName = g.name;
      v.assignmentTitle = a.title;
      v.mine = t.assignee === studentId;
      out.push(v);
    });
  });
  return out;
}

/* ---------- Timeline ---------- */

function apiTimeline_(user, p) {
  checkEnrolled_(user, p.courseCode);
  var teacher = user.role === 'teacher';
  if (!teacher) requireStudent_(user);
  var list = teacher
    ? rows_('Assignments').filter(function (a) { return a.courseCode === p.courseCode; }).sort(byDue_)
    : publishedOf_(p.courseCode);
  var cards = teacher ? apiListAssignments_(user, { courseCode: p.courseCode }) : [];
  var items = list.map(function (a) {
    var v = assignmentView_(a);
    var item = {
      kind: 'assignment', id: a.id, title: a.title, start: a.createdAt || a.dueAt || now_(), end: a.dueAt,
      groupMax: v.groupMax, published: v.published, overdue: v.overdue
    };
    if (teacher) item.counts = find_(cards, function (c) { return c.id === a.id; }).counts;
    else item.status = workStatus_(a, mergedSubmission_(a, user.studentId));
    return item;
  });
  var tasks = teacher ? [] : myGroupTasks_(p.courseCode, user.studentId)
    .filter(function (t) { return t.dueAt; })
    .map(function (t) {
      return {
        kind: 'task', id: t.id, title: t.title, start: t.createdAt || t.dueAt, end: t.dueAt, status: t.status,
        mine: t.mine, groupId: t.groupId, groupName: t.groupName, assignmentTitle: t.assignmentTitle
      };
    });
  return { now: now_(), items: items, tasks: tasks };
}

/* ---------- Dashboard นักศึกษา ---------- */

function apiStudentDashboard_(user, p) {
  requireStudent_(user);
  checkEnrolled_(user, p.courseCode);
  var d = courseData_(p.courseCode);
  var id = user.studentId;
  var result = computeFor_(d, id);
  var work = publishedOf_(p.courseCode).map(function (a) {
    var sub = mergedSubmission_(a, id);
    var v = assignmentView_(a);
    v.status = workStatus_(a, sub);
    v.score = sub ? sub.score : null;
    v.feedback = sub ? sub.feedback : '';
    v.gradedAt = sub ? sub.gradedAt : '';
    return v;
  });
  var count = function (st) { return work.filter(function (w) { return st.indexOf(w.status) >= 0; }).length; };
  var tasks = myGroupTasks_(p.courseCode, id)
    .filter(function (t) { return t.status !== 'done' && (t.mine || !t.assignee); })
    .sort(function (a, b) { return (a.dueAt || '9999') < (b.dueAt || '9999') ? -1 : 1; });
  var marks = d.att[id] || marksOf_(null);
  var held = d.course.heldWeeks;
  var tally = { P: 0, L: 0, E: 0, A: 0 };
  held.forEach(function (w) { if (tally[marks[w - 1]] !== undefined) tally[marks[w - 1]]++; });
  // ลาที่อนุมัติแล้วในสัปดาห์ที่ยังไม่เช็คชื่อ ก็นับด้วย
  marks.forEach(function (m, i) { if (m === 'E' && held.indexOf(i + 1) < 0) tally.E++; });
  return {
    course: d.course,
    todo: work.filter(function (w) { return w.status === 'open' || (w.status === 'missing' && w.allowLate); }).slice(0, 6),
    missing: work.filter(function (w) { return w.status === 'missing'; }).map(function (w) { return { id: w.id, title: w.title, dueAt: w.dueAt, allowLate: w.allowLate }; }),
    counts: { total: work.length, submitted: count(['submitted', 'late', 'graded']), graded: count(['graded']), missing: count(['missing']) },
    parts: result.parts,
    total: d.course.gradesVisible ? result.total : null,
    grade: d.course.gradesVisible ? result.grade : null,
    gradePending: d.course.gradesVisible && result.grade === null,
    attendance: { held: held.length, tally: tally, absence: result.absence },
    tasks: tasks.slice(0, 8),
    feedback: work
      .filter(function (w) { return w.status === 'graded'; })
      .sort(function (a, b) { return (a.gradedAt || '') > (b.gradedAt || '') ? -1 : 1; })
      .slice(0, 3)
      .map(function (w) { return { id: w.id, title: w.title, score: w.score, maxScore: w.maxScore, feedback: w.feedback, gradedAt: w.gradedAt }; })
  };
}

/* ---------- Dashboard อาจารย์ ---------- */

var AT_RISK_MISSING = 2;
var AT_RISK_ATTENDANCE = 80;

function apiTeacherDashboard_(user, p) {
  requireTeacher_(user);
  var d = courseData_(p.courseCode);
  var roster = rosterOf_(p.courseCode);
  var published = publishedOf_(p.courseCode);
  var cards = apiListAssignments_(user, { courseCode: p.courseCode });
  var grades = {};
  var attSum = 0, attN = 0;
  var students = roster.map(function (r) {
    var res = computeFor_(d, r.studentId);
    var missing = 0;
    var toGrade = 0;
    published.forEach(function (a) {
      var st = workStatus_(a, mergedSubmission_(a, r.studentId));
      if (st === 'missing') missing++;
      if (st === 'submitted' || st === 'late') toGrade++;
    });
    var att = res.parts.attendance.pct;
    if (att !== null) { attSum += att; attN++; }
    // ระหว่างเทอมใช้แนวโน้ม (คิดจากส่วนที่มีคะแนนแล้ว) — ยังไม่มีคะแนนเลย = ไม่นับ
    var g = res.grade || res.projectedGrade;
    grades[g || '-'] = (grades[g || '-'] || 0) + 1;
    return {
      studentId: r.studentId, name: r.name, note: r.note || '', registered: !!r.email, missing: missing, toGrade: toGrade,
      attendance: att, absence: res.absence, total: res.total, grade: res.grade
    };
  });
  // ขาดเกินเกณฑ์ (F) ขึ้นก่อน แล้วขาดมาก → ขาดส่งมาก → เข้าเรียนน้อย
  var risk = students
    .filter(function (s) {
      return s.absence.warn || s.missing >= AT_RISK_MISSING || (s.attendance !== null && s.attendance < AT_RISK_ATTENDANCE);
    })
    .sort(function (a, b) {
      return Number(b.absence.fail) - Number(a.absence.fail) || b.absence.effective - a.absence.effective ||
        b.missing - a.missing || (a.attendance === null ? 101 : a.attendance) - (b.attendance === null ? 101 : b.attendance);
    });
  var toGradeBy = {};
  published.forEach(function (a) {
    toGradeBy[a.id] = roster.filter(function (r) {
      var st = workStatus_(a, mergedSubmission_(a, r.studentId));
      return st === 'submitted' || st === 'late';
    }).length;
  });
  return {
    course: d.course,
    counts: {
      students: roster.length,
      registered: roster.filter(function (r) { return r.email; }).length,
      assignments: published.length,
      hidden: cards.length - published.length,
      toGrade: students.reduce(function (n, s) { return n + s.toGrade; }, 0),
      heldWeeks: d.course.heldWeeks.length,
      pendingLeaves: pendingLeaves_(p.courseCode)
    },
    attendanceAvg: attN ? Grade.round2(attSum / attN) : null,
    assignments: cards.filter(function (c) { return c.published; }).map(function (c) {
      c.toGrade = toGradeBy[c.id] || 0;
      return c;
    }),
    atRisk: {
      total: risk.length, list: risk.slice(0, 10), missingLimit: AT_RISK_MISSING, attendanceLimit: AT_RISK_ATTENDANCE,
      failedByAbsence: students.filter(function (s) { return s.absence.fail; }).length, rules: d.settings.attendanceRules
    },
    grades: d.settings.gradeCutoffs.map(function (g) { return { grade: g[0], count: grades[g[0]] || 0 }; }),
    noScores: grades['-'] || 0
  };
}

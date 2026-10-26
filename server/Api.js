/*
 * Api — คำสั่งทั้งหมดที่เว็บเรียกได้
 */

function actions_() {
  return {
    // ทุกคน
    me: apiMe_,
    register: apiRegister_,
    getSyllabus: apiGetSyllabus_,
    timeline: apiTimeline_,
    boardGroups: apiBoardGroups_,
    groupBoard: apiGroupBoard_,
    // นักศึกษา
    myAssignments: apiMyAssignments_,
    myGrades: apiMyGrades_,
    studentDashboard: apiStudentDashboard_,
    myLeaves: apiMyLeaves_,
    submitLeave: apiSubmitLeave_,
    startLeaveUpload: apiStartLeaveUpload_,
    finalizeLeaveUpload: apiFinalizeLeaveUpload_,
    cancelLeave: apiCancelLeave_,
    saveTask: apiSaveTask_,
    deleteTask: apiDeleteTask_,
    startUpload: apiStartUpload_,
    finalizeUpload: apiFinalizeUpload_,
    submitLink: apiSubmitLink_,
    removeFile: apiRemoveFile_,
    leaveGroup: apiLeaveGroup_,
    // นักศึกษา + อาจารย์ (งานกลุ่ม)
    groupOptions: apiGroupOptions_,
    saveGroup: apiSaveGroup_,
    // อาจารย์
    importRoster: apiImportRoster_,
    listStudents: apiListStudents_,
    setStudentEmail: apiSetStudentEmail_,
    addStudent: apiAddStudent_,
    removeStudent: apiRemoveStudent_,
    listAssignments: apiListAssignments_,
    upsertAssignment: apiUpsertAssignment_,
    deleteAssignment: apiDeleteAssignment_,
    deleteGroup: apiDeleteGroup_,
    deleteCourse: apiDeleteCourse_,
    teacherDashboard: apiTeacherDashboard_,
    listLeaves: apiListLeaves_,
    decideLeave: apiDecideLeave_,
    saveSyllabus: apiSaveSyllabus_,
    addSyllabusLink: apiAddSyllabusLink_,
    startSyllabusUpload: apiStartSyllabusUpload_,
    finalizeSyllabusUpload: apiFinalizeSyllabusUpload_,
    removeSyllabusAttachment: apiRemoveSyllabusAttachment_,
    listSubmissions: apiListSubmissions_,
    saveGrades: apiSaveGrades_,
    getAttendance: apiGetAttendance_,
    saveAttendance: apiSaveAttendance_,
    getExams: apiGetExams_,
    saveExams: apiSaveExams_,
    gradebook: apiGradebook_,
    updateCourse: apiUpdateCourse_,
    getSettings: apiGetSettings_,
    updateSettings: apiUpdateSettings_
  };
}

/* ---------- helpers ---------- */

function find_(list, pred) {
  for (var i = 0; i < list.length; i++) if (pred(list[i])) return list[i];
  return null;
}

function parseJson_(s, fallback) {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch (e) {
    return fallback;
  }
}

function numOrNull_(v) {
  return Grade.num(v);
}

function courseRow_(code) {
  var c = find_(rows_('Courses'), function (r) { return r.courseCode === code; });
  if (!c) throw new Error('ไม่พบวิชา ' + code);
  return c;
}

function courseView_(c) {
  return {
    courseCode: c.courseCode,
    title: c.title,
    section: c.section,
    term: c.term,
    schedule: c.schedule,
    credits: c.credits,
    teacher: c.teacher,
    weights: parseJson_(c.weights, Grade.DEFAULT_WEIGHTS),
    maxMidterm: numOrNull_(c.maxMidterm) || 100,
    maxFinal: numOrNull_(c.maxFinal) || 100,
    gradesVisible: c.gradesVisible === 'true',
    heldWeeks: parseJson_(c.heldWeeks, [])
  };
}

function assignmentRow_(id) {
  var a = find_(rows_('Assignments'), function (r) { return r.id === id; });
  if (!a) throw new Error('ไม่พบงานนี้');
  return a;
}

function assignmentView_(a) {
  return {
    id: a.id,
    courseCode: a.courseCode,
    title: a.title,
    description: a.description,
    maxScore: Number(a.maxScore) || 0,
    dueAt: a.dueAt,
    allowLate: a.allowLate === 'true',
    published: a.published === 'true',
    createdAt: a.createdAt,
    groupMax: isGroupWork_(a) ? Number(a.groupMax) : 0,
    half: a.half === '2' ? 2 : 1,
    overdue: isPastDue_(a)
  };
}

function isPastDue_(a) {
  return !!a.dueAt && new Date(now_()).getTime() > new Date(a.dueAt).getTime();
}

function submissionRow_(assignmentId, studentId) {
  return find_(rows_('Submissions'), function (s) {
    return s.assignmentId === assignmentId && s.studentId === studentId;
  });
}

function submissionView_(s) {
  if (!s) return null;
  return {
    id: s.id,
    files: parseJson_(s.files, []),
    link: s.link,
    submittedAt: s.submittedAt,
    isLate: s.isLate === 'true',
    score: numOrNull_(s.score),
    feedback: s.feedback,
    gradedAt: s.gradedAt
  };
}

function newSubmission_(assignmentId, studentId) {
  return {
    id: uid_('S'), assignmentId: assignmentId, studentId: studentId, files: '[]', link: '',
    submittedAt: '', isLate: '', score: '', feedback: '', gradedAt: '', groupId: ''
  };
}

function rosterOf_(code) {
  return rows_('Students')
    .filter(function (r) { return r.courseCode === code; })
    .sort(function (a, b) { return a.studentId < b.studentId ? -1 : a.studentId > b.studentId ? 1 : 0; });
}

function checkInRoster_(code, studentId) {
  if (!find_(rows_('Students'), function (r) { return r.courseCode === code && r.studentId === studentId; })) {
    throw new Error('ไม่พบรหัส ' + studentId + ' ในรายชื่อวิชา ' + code);
  }
}

function studentView_(r) {
  return {
    studentId: r.studentId, name: r.name, group: r.group, email: r.email, boundAt: r.boundAt,
    nickname: r.nickname || '', phone: r.phone || ''
  };
}

function checkEnrolled_(user, courseCode) {
  if (user.role === 'teacher') return;
  if (user.courses.indexOf(courseCode) < 0) throw new Error('คุณไม่ได้ลงทะเบียนวิชานี้');
}

function settingsView_() {
  var s = settings_();
  return {
    teacherEmails: listSetting_('teacherEmails'),
    allowedDomains: listSetting_('allowedDomains'),
    allowedOrigins: String(s.allowedOrigins || '').split(/[,\s]+/).filter(Boolean),
    gradeCutoffs: jsonSetting_('gradeCutoffs', Grade.DEFAULT_CUTOFFS),
    attendancePoints: jsonSetting_('attendancePoints', Grade.DEFAULT_ATTENDANCE_POINTS),
    uploadMaxMB: Number(s.uploadMaxMB) || 2048,
    hasDeletePin: !!s.deletePinHash
  };
}

function marksOf_(row) {
  var marks = [];
  for (var w = 1; w <= Grade.WEEKS; w++) marks.push(row ? row['w' + w] || '' : '');
  return marks;
}

/** โหลดข้อมูลทั้งวิชาสำหรับคำนวณคะแนน */
function courseData_(code) {
  var course = courseView_(courseRow_(code));
  var assignments = rows_('Assignments')
    .filter(function (a) { return a.courseCode === code && a.published === 'true'; })
    .map(assignmentView_)
    .sort(byDue_);
  var ids = {};
  assignments.forEach(function (a) { ids[a.id] = true; });
  var subs = {};
  rows_('Submissions').forEach(function (s) {
    if (ids[s.assignmentId]) subs[s.assignmentId + '|' + s.studentId] = submissionView_(s);
  });
  var att = {};
  rows_('Attendance').forEach(function (r) { if (r.courseCode === code) att[r.studentId] = marksOf_(r); });
  var exams = {};
  rows_('Exams').forEach(function (r) {
    if (r.courseCode === code) exams[r.studentId] = { midterm: numOrNull_(r.midterm), final: numOrNull_(r.final) };
  });
  return { course: course, assignments: assignments, subs: subs, att: att, exams: exams, settings: settingsView_() };
}

function computeFor_(d, studentId) {
  var ex = d.exams[studentId] || {};
  return Grade.compute({
    weights: d.course.weights,
    cutoffs: d.settings.gradeCutoffs,
    attendancePoints: d.settings.attendancePoints,
    heldWeeks: d.course.heldWeeks,
    attendance: d.att[studentId] || marksOf_(null),
    assignments: d.assignments.map(function (a) {
      var sub = d.subs[a.id + '|' + studentId];
      return { score: sub ? sub.score : null, maxScore: a.maxScore, overdue: a.overdue, half: a.half };
    }),
    midterm: ex.midterm,
    maxMidterm: d.course.maxMidterm,
    final: ex.final,
    maxFinal: d.course.maxFinal
  });
}

function byDue_(a, b) {
  var x = a.dueAt || '9999', y = b.dueAt || '9999';
  return x < y ? -1 : x > y ? 1 : 0;
}

function str_(v, max) {
  return String(v === null || v === undefined ? '' : v).trim().slice(0, max || 500);
}

function scoreInRange_(v, max, label) {
  var n = numOrNull_(v);
  if (v !== '' && v !== null && v !== undefined && n === null) throw new Error(label + ': ต้องเป็นตัวเลข');
  if (n !== null && (n < 0 || n > max)) throw new Error(label + ': ต้องอยู่ระหว่าง 0–' + max);
  return n === null ? '' : String(n);
}

/* ---------- ทุกคน ---------- */

function apiMe_(user) {
  var courses = rows_('Courses').map(courseView_);
  if (user.role === 'student') {
    courses = courses.filter(function (c) { return user.courses.indexOf(c.courseCode) >= 0; });
  }
  return {
    email: user.email,
    name: user.name,
    role: user.role,
    studentId: user.studentId || null,
    studentName: user.studentName || '',
    needsBinding: user.role === 'student' && !user.studentId,
    courses: courses,
    registration: user.role === 'student' && !user.studentId ? registrationInfo_(user) : null,
    warnings: user.role === 'teacher' ? setupWarnings_() : []
  };
}

function setupWarnings_() {
  var w = [];
  if (!listSetting_('allowedDomains').length) {
    w.push('ยังไม่ได้ตั้งโดเมนอีเมลมหาวิทยาลัย — นักศึกษายังสมัครไม่ได้ (ตั้งที่แท็บ ตั้งค่า)');
  }
  return w;
}

/** อีเมลนักศึกษา มรภ.เชียงใหม่ = <รหัสนักศึกษา>@cmru.ac.th → คืนรหัส (หรือ null ถ้าไม่ใช่รูปแบบนี้) */
function emailStudentId_(email) {
  var local = String(email || '').split('@')[0];
  return /^\d{8,13}$/.test(local) ? local : null;
}

/** ข้อมูลสำหรับหน้าสมัครของนักศึกษาที่ยังไม่สมัคร */
function registrationInfo_(user) {
  var id = emailStudentId_(user.email);
  if (!id) return null;
  var rows = rows_('Students').filter(function (r) { return r.studentId === id; });
  if (!rows.length) return { studentId: id, notFound: true };
  var courses = rows_('Courses');
  return {
    studentId: id,
    name: rows[0].name,
    takenByOther: rows.some(function (r) { return r.email && r.email.toLowerCase() !== user.email; }),
    courses: rows.map(function (r) {
      var c = find_(courses, function (x) { return x.courseCode === r.courseCode; });
      return { courseCode: r.courseCode, title: c ? c.title : '' };
    })
  };
}

/** ตัดคำนำหน้าและช่องว่าง เพื่อเทียบชื่อที่กรอกกับชื่อในใบรายชื่อ */
function normalizeName_(s) {
  return String(s || '')
    .replace(/^\s*(นางสาว|นาง|นาย|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|miss|ms\.?)\s*/i, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** นักศึกษาสมัครเข้าใช้งาน: รหัส + ชื่อ-นามสกุลต้องตรงกับรายชื่อที่อาจารย์นำเข้า */
function apiRegister_(user, p) {
  if (user.role !== 'student') throw new Error('อาจารย์ไม่ต้องสมัคร');
  if (user.studentId) throw new Error('บัญชีนี้สมัครแล้วด้วยรหัส ' + user.studentId);
  var phone = str_(p.phone, 20).replace(/[\s-]/g, '');
  if (phone && !/^\+?\d{9,12}$/.test(phone)) throw new Error('เบอร์โทรไม่ถูกต้อง');
  var rows;

  var fromEmail = emailStudentId_(user.email);
  if (fromEmail) {
    // อีเมลแบบ <รหัส>@cmru.ac.th ยืนยันตัวตนโดย Google แล้ว → ใช้รหัสจากอีเมล ไม่ต้องตรวจชื่อ
    if (p.studentId && str_(p.studentId, 20) !== fromEmail) throw new Error('สมัครได้เฉพาะรหัส ' + fromEmail + ' ตามอีเมลที่ล็อกอิน');
    rows = rows_('Students').filter(function (r) { return r.studentId === fromEmail; });
    if (!rows.length) throw new Error('รหัส ' + fromEmail + ' ยังไม่อยู่ในรายชื่อวิชาใด กรุณาแจ้งอาจารย์');
  } else {
    // อีเมลรูปแบบอื่น → ต้องกรอกรหัส + ชื่อ-นามสกุลให้ตรงกับรายชื่อ
    var hit = rateLimit_('reg_' + user.email, 5, 3600, 'กรอกข้อมูลไม่ถูกต้องหลายครั้งเกินไป กรุณารอ 1 ชั่วโมง หรือติดต่ออาจารย์');
    var id = str_(p.studentId, 20);
    var first = str_(p.firstName, 100), last = str_(p.lastName, 100);
    if (!/^\d{8,13}$/.test(id)) throw new Error('รหัสนักศึกษาต้องเป็นตัวเลข 8–13 หลัก');
    if (!first || !last) throw new Error('กรุณากรอกชื่อและนามสกุล');
    rows = rows_('Students').filter(function (r) { return r.studentId === id; });
    if (!rows.length) {
      hit();
      throw new Error('ไม่พบรหัส ' + id + ' ในรายชื่อลงทะเบียน — ตรวจรหัสอีกครั้ง หรือติดต่ออาจารย์');
    }
    if (normalizeName_(rows[0].name) !== normalizeName_(first + last)) {
      hit();
      throw new Error('ชื่อ-นามสกุลไม่ตรงกับรายชื่อลงทะเบียนของรหัสนี้ (กรอกตามใบรายชื่อของมหาวิทยาลัย ไม่ต้องใส่คำนำหน้า)');
    }
  }
  if (rows.some(function (r) { return r.email && r.email.toLowerCase() !== user.email; })) {
    throw new Error('รหัสนี้ถูกสมัครด้วยบัญชีอื่นแล้ว กรุณาติดต่ออาจารย์');
  }
  bindRows_(rows, user.email, { nickname: str_(p.nickname, 50), phone: phone });
  shareGroupFilesWithStudent_(rows[0].studentId);
  user.studentId = rows[0].studentId;
  user.studentName = rows[0].name;
  user.courses = rows.map(function (r) { return r.courseCode; });
  return apiMe_(user);
}

/* ---------- นักศึกษา ---------- */

function apiMyAssignments_(user, p) {
  requireStudent_(user);
  checkEnrolled_(user, p.courseCode);
  return rows_('Assignments')
    .filter(function (a) { return a.courseCode === p.courseCode && a.published === 'true'; })
    .map(function (a) {
      var v = assignmentView_(a);
      v.submission = mergedSubmission_(a, user.studentId);
      if (isGroupWork_(a)) {
        var g = groupOf_(a.id, user.studentId);
        v.group = g ? groupView_(a, g) : null;
      }
      return v;
    })
    .sort(byDue_);
}

function apiMyGrades_(user, p) {
  requireStudent_(user);
  checkEnrolled_(user, p.courseCode);
  var d = courseData_(p.courseCode);
  var id = user.studentId;
  var result = computeFor_(d, id);
  var ex = d.exams[id] || {};
  return {
    course: d.course,
    assignments: d.assignments.map(function (a) {
      var s = d.subs[a.id + '|' + id];
      var work = a.groupMax ? mergedSubmission_(assignmentRow_(a.id), id) : s;
      return {
        id: a.id, title: a.title, maxScore: a.maxScore, dueAt: a.dueAt, overdue: a.overdue, groupMax: a.groupMax,
        submitted: !!(work && work.submittedAt), score: s ? s.score : null, feedback: s ? s.feedback : ''
      };
    }),
    attendance: { marks: d.att[id] || marksOf_(null), heldWeeks: d.course.heldWeeks },
    exams: { midterm: ex.midterm, final: ex.final, maxMidterm: d.course.maxMidterm, maxFinal: d.course.maxFinal },
    parts: result.parts,
    total: d.course.gradesVisible ? result.total : null,
    grade: d.course.gradesVisible ? result.grade : null
  };
}

/* ---------- อาจารย์: รายชื่อ ---------- */

function apiImportRoster_(user, p) {
  requireTeacher_(user);
  var c = p.course || {};
  var code = str_(c.courseCode, 20).toUpperCase();
  if (!/^[A-Z0-9-]{3,20}$/.test(code)) throw new Error('รหัสวิชาไม่ถูกต้อง');
  var list = (p.students || []).filter(function (s) { return /^\d{8,13}$/.test(str_(s.studentId)); });
  if (!list.length) throw new Error('ไม่มีรายชื่อนักศึกษา');

  var course = find_(rows_('Courses'), function (r) { return r.courseCode === code; });
  var fields = ['title', 'section', 'term', 'schedule', 'credits', 'teacher'];
  if (!course) {
    course = {
      courseCode: code, weights: JSON.stringify(Grade.DEFAULT_WEIGHTS), maxMidterm: '100', maxFinal: '100',
      gradesVisible: 'false', heldWeeks: '[]'
    };
    fields.forEach(function (f) { course[f] = str_(c[f], 200); });
    insert_('Courses', course);
  } else {
    fields.forEach(function (f) { if (c[f]) course[f] = str_(c[f], 200); });
    update_('Courses', course);
  }

  var students = rows_('Students');
  var existing = {};
  students.forEach(function (r) { if (r.courseCode === code) existing[r.studentId] = r; });
  // ถ้ารหัสนี้ผูกอีเมลไว้แล้วในวิชาอื่น ให้ใช้อีเมลเดียวกัน
  var emailById = {};
  students.forEach(function (r) { if (r.email) emailById[r.studentId] = r; });

  var added = 0, updated = 0, inFile = {};
  list.forEach(function (s) {
    var id = str_(s.studentId);
    inFile[id] = true;
    var r = existing[id];
    if (r) {
      r.name = str_(s.name, 200) || r.name;
      r.group = str_(s.group, 100) || r.group;
      updated++;
    } else {
      var bound = emailById[id];
      students.push({
        courseCode: code, studentId: id, name: str_(s.name, 200), group: str_(s.group, 100),
        email: bound ? bound.email : '', boundAt: bound ? bound.boundAt : '',
        nickname: bound ? bound.nickname : '', phone: bound ? bound.phone : ''
      });
      added++;
    }
  });
  saveAll_('Students');
  var missing = Object.keys(existing).filter(function (id) { return !inFile[id]; })
    .map(function (id) { return studentView_(existing[id]); });
  return { course: courseView_(course), added: added, updated: updated, missing: missing };
}

function apiListStudents_(user, p) {
  requireTeacher_(user);
  return rosterOf_(p.courseCode).map(studentView_);
}

function apiSetStudentEmail_(user, p) {
  requireTeacher_(user);
  var id = str_(p.studentId);
  var email = str_(p.email, 200).toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('อีเมลไม่ถูกต้อง');
  var rows = rows_('Students');
  if (email && rows.some(function (r) { return r.email.toLowerCase() === email && r.studentId !== id; })) {
    throw new Error('อีเมลนี้ผูกกับนักศึกษาคนอื่นอยู่');
  }
  var mine = rows.filter(function (r) { return r.studentId === id; });
  if (!mine.length) throw new Error('ไม่พบรหัสนักศึกษา');
  bindRows_(mine, email);
  if (email) shareGroupFilesWithStudent_(id);
  return studentView_(mine[0]);
}

function apiAddStudent_(user, p) {
  requireTeacher_(user);
  courseRow_(p.courseCode);
  var id = str_(p.studentId, 20);
  var name = str_(p.name, 200);
  if (!/^\d{8,13}$/.test(id)) throw new Error('รหัสนักศึกษาต้องเป็นตัวเลข 8–13 หลัก');
  if (!name) throw new Error('กรุณาใส่ชื่อ-นามสกุล');
  var rows = rows_('Students');
  if (find_(rows, function (r) { return r.courseCode === p.courseCode && r.studentId === id; })) {
    throw new Error('รหัสนี้อยู่ในวิชานี้แล้ว');
  }
  // ถ้าสมัครไว้แล้วจากวิชาอื่น ให้ใช้บัญชีเดิม
  var other = find_(rows, function (r) { return r.studentId === id && r.email; });
  var row = {
    courseCode: p.courseCode, studentId: id, name: name, group: str_(p.group, 100),
    email: other ? other.email : '', boundAt: other ? other.boundAt : '',
    nickname: other ? other.nickname : '', phone: other ? other.phone : ''
  };
  insert_('Students', row);
  return studentView_(row);
}

/**
 * ลบวิชาและข้อมูลทั้งหมดของวิชา (รายชื่อ งาน การส่งงาน กลุ่ม เช็คชื่อ คะแนนสอบ) — ต้องใส่ PIN
 * preview: true = นับจำนวนที่จะถูกลบ ไม่ต้องใส่ PIN · trashFiles: ย้ายโฟลเดอร์งานใน Drive ไปถังขยะด้วย (กู้คืนได้ 30 วัน)
 */
function apiDeleteCourse_(user, p) {
  requireTeacher_(user);
  var code = courseRow_(p.courseCode).courseCode;
  var ids = {};
  rows_('Assignments').forEach(function (a) { if (a.courseCode === code) ids[a.id] = true; });
  var inCourse = function (r) { return r.courseCode === code; };
  var ofWork = function (r) { return !!ids[r.assignmentId]; };
  var counts = {
    students: rows_('Students').filter(inCourse).length,
    assignments: Object.keys(ids).length,
    submissions: rows_('Submissions').filter(function (s) { return ofWork(s) && (s.submittedAt || s.score !== ''); }).length,
    leaves: rows_('LeaveRequests').filter(inCourse).length,
    groups: rows_('Groups').filter(ofWork).length
  };
  if (p.preview) return counts;

  checkDeletePin_(user, p.pin);
  remove_('Submissions', ofWork);
  remove_('Groups', ofWork);
  pruneTasks_();
  remove_('Assignments', inCourse);
  remove_('Attendance', inCourse);
  remove_('Exams', inCourse);
  remove_('LeaveRequests', inCourse);
  remove_('Students', inCourse);
  remove_('Courses', inCourse);
  counts.filesTrashed = p.trashFiles ? trashCourseFolder_(code) : false;
  return counts;
}

function apiRemoveStudent_(user, p) {
  requireTeacher_(user);
  var n = remove_('Students', function (r) { return r.courseCode === p.courseCode && r.studentId === p.studentId; });
  var ids = {};
  rows_('Assignments').forEach(function (a) { if (a.courseCode === p.courseCode) ids[a.id] = true; });
  rows_('Groups').forEach(function (g) {
    if (ids[g.assignmentId]) g.members = JSON.stringify(membersOf_(g).filter(function (m) { return m !== p.studentId; }));
  });
  saveAll_('Groups');
  return { removed: n };
}

/* ---------- อาจารย์: งาน ---------- */

function apiListAssignments_(user, p) {
  requireTeacher_(user);
  var roster = rosterOf_(p.courseCode).length;
  var subs = rows_('Submissions');
  return rows_('Assignments')
    .filter(function (a) { return a.courseCode === p.courseCode; })
    .map(function (a) {
      var v = assignmentView_(a);
      var mine = subs.filter(function (s) { return s.assignmentId === a.id; });
      v.counts = {
        roster: roster,
        submitted: mine.filter(function (s) { return s.submittedAt && s.studentId; }).length,
        graded: mine.filter(function (s) { return s.score !== '' && s.studentId; }).length
      };
      if (isGroupWork_(a)) {
        // งานกลุ่ม: นับคนที่กลุ่มส่งแล้ว
        var groups = groupsOf_(a.id);
        v.counts.groups = groups.length;
        v.counts.submitted = groups.reduce(function (n, g) {
          var gs = groupSubmissionRow_(g.id);
          return n + (gs && gs.submittedAt ? membersOf_(g).length : 0);
        }, 0);
      }
      return v;
    })
    .sort(byDue_);
}

function apiUpsertAssignment_(user, p) {
  requireTeacher_(user);
  courseRow_(p.courseCode);
  var title = str_(p.title, 200);
  if (!title) throw new Error('กรุณาใส่ชื่องาน');
  var max = numOrNull_(p.maxScore);
  if (!(max > 0)) throw new Error('คะแนนเต็มต้องมากกว่า 0');
  if (p.dueAt && isNaN(new Date(p.dueAt).getTime())) throw new Error('กำหนดส่งไม่ถูกต้อง');
  var groupMax = numOrNull_(p.groupMax) || 0;
  if (groupMax && (groupMax < 2 || groupMax > 50 || groupMax !== Math.floor(groupMax))) {
    throw new Error('จำนวนสมาชิกสูงสุดต้องเป็นจำนวนเต็ม 2–50');
  }

  var a = p.id ? assignmentRow_(p.id) : { id: uid_('A'), courseCode: p.courseCode, createdAt: now_() };
  if (p.id && !!groupMax !== isGroupWork_(a)) {
    var used = groupsOf_(a.id).length || rows_('Submissions').some(function (s) {
      return s.assignmentId === a.id && (s.submittedAt || s.score !== '');
    });
    if (used) throw new Error('มีการส่งงานหรือจับกลุ่มแล้ว เปลี่ยนระหว่างงานเดี่ยว/งานกลุ่มไม่ได้ — สร้างงานใหม่แทน');
  }
  a.title = title;
  a.description = str_(p.description, 5000);
  a.maxScore = String(max);
  a.dueAt = p.dueAt ? new Date(p.dueAt).toISOString() : '';
  a.allowLate = p.allowLate ? 'true' : 'false';
  a.published = p.published ? 'true' : 'false';
  a.groupMax = groupMax ? String(groupMax) : '';
  a.half = Number(p.half) === 2 ? '2' : '1';
  if (p.id) update_('Assignments', a); else insert_('Assignments', a);
  return assignmentView_(a);
}

function apiDeleteAssignment_(user, p) {
  requireTeacher_(user);
  assignmentRow_(p.id);
  var hasFiles = rows_('Submissions').some(function (s) {
    return s.assignmentId === p.id && (parseJson_(s.files, []).length || s.link);
  });
  if (hasFiles) throw new Error('มีนักศึกษาส่งงานนี้แล้ว ลบไม่ได้ — ใช้ "ซ่อน" แทน');
  remove_('Submissions', function (s) { return s.assignmentId === p.id; });
  remove_('Groups', function (g) { return g.assignmentId === p.id; });
  pruneTasks_();
  remove_('Assignments', function (a) { return a.id === p.id; });
  return { deleted: p.id };
}

function apiListSubmissions_(user, p) {
  requireTeacher_(user);
  var a = assignmentRow_(p.assignmentId);
  var group = isGroupWork_(a);
  return {
    assignment: assignmentView_(a),
    groups: group ? groupsOf_(a.id).map(function (g) { return groupView_(a, g); }) : null,
    rows: rosterOf_(a.courseCode).map(function (r) {
      var v = studentView_(r);
      v.submission = mergedSubmission_(a, r.studentId);
      if (group) {
        var g = groupOf_(a.id, r.studentId);
        v.groupId = g ? g.id : null;
      }
      return v;
    })
  };
}

function apiSaveGrades_(user, p) {
  requireTeacher_(user);
  var a = assignmentRow_(p.assignmentId);
  var max = Number(a.maxScore);
  var subs = rows_('Submissions');
  var t = now_();
  (p.items || []).forEach(function (it) {
    checkInRoster_(a.courseCode, it.studentId);
    var score = scoreInRange_(it.score, max, 'คะแนนของ ' + it.studentId);
    var s = submissionRow_(a.id, it.studentId);
    if (!s) {
      if (score === '' && !it.feedback) return;
      s = newSubmission_(a.id, it.studentId);
      subs.push(s);
    }
    s.score = score;
    s.feedback = str_(it.feedback, 5000);
    s.gradedAt = score === '' ? '' : t;
  });
  saveAll_('Submissions');
  return apiListSubmissions_(user, { assignmentId: a.id });
}

/* ---------- อาจารย์: เช็คชื่อ / สอบ ---------- */

function apiGetAttendance_(user, p) {
  requireTeacher_(user);
  var c = courseView_(courseRow_(p.courseCode));
  var att = {};
  rows_('Attendance').forEach(function (r) { if (r.courseCode === p.courseCode) att[r.studentId] = marksOf_(r); });
  return {
    heldWeeks: c.heldWeeks,
    pendingLeaves: pendingLeaves_(p.courseCode),
    rows: rosterOf_(p.courseCode).map(function (r) {
      var v = studentView_(r);
      v.marks = att[r.studentId] || marksOf_(null);
      return v;
    })
  };
}

function apiSaveAttendance_(user, p) {
  requireTeacher_(user);
  var course = courseRow_(p.courseCode);
  var rows = rows_('Attendance');
  var held = {};
  (p.rows || []).forEach(function (it) {
    checkInRoster_(p.courseCode, it.studentId);
    var r = find_(rows, function (x) { return x.courseCode === p.courseCode && x.studentId === it.studentId; });
    if (!r) {
      r = { courseCode: p.courseCode, studentId: it.studentId };
      rows.push(r);
    }
    for (var w = 1; w <= Grade.WEEKS; w++) {
      var m = String((it.marks || [])[w - 1] || '').toUpperCase();
      if (['', 'P', 'L', 'A', 'E'].indexOf(m) < 0) throw new Error('สถานะเช็คชื่อไม่ถูกต้อง: ' + m);
      r['w' + w] = m;
    }
  });
  // สัปดาห์ที่มีแค่ "ลา" (จากใบลาที่อนุมัติล่วงหน้า) ยังไม่นับว่าเช็คชื่อแล้ว
  rows.forEach(function (r) {
    if (r.courseCode !== p.courseCode) return;
    for (var w = 1; w <= Grade.WEEKS; w++) if (r['w' + w] && r['w' + w] !== 'E') held[w] = true;
  });
  saveAll_('Attendance');
  course.heldWeeks = JSON.stringify(Object.keys(held).map(Number).sort(function (a, b) { return a - b; }));
  update_('Courses', course);
  return apiGetAttendance_(user, p);
}

function apiGetExams_(user, p) {
  requireTeacher_(user);
  var c = courseView_(courseRow_(p.courseCode));
  var ex = {};
  rows_('Exams').forEach(function (r) { if (r.courseCode === p.courseCode) ex[r.studentId] = r; });
  return {
    maxMidterm: c.maxMidterm,
    maxFinal: c.maxFinal,
    rows: rosterOf_(p.courseCode).map(function (r) {
      var v = studentView_(r);
      var e = ex[r.studentId];
      v.midterm = e ? numOrNull_(e.midterm) : null;
      v.final = e ? numOrNull_(e.final) : null;
      return v;
    })
  };
}

function apiSaveExams_(user, p) {
  requireTeacher_(user);
  var course = courseRow_(p.courseCode);
  var maxM = numOrNull_(p.maxMidterm), maxF = numOrNull_(p.maxFinal);
  if (!(maxM > 0) || !(maxF > 0)) throw new Error('คะแนนเต็มสอบต้องมากกว่า 0');
  course.maxMidterm = String(maxM);
  course.maxFinal = String(maxF);
  update_('Courses', course);
  var rows = rows_('Exams');
  (p.rows || []).forEach(function (it) {
    checkInRoster_(p.courseCode, it.studentId);
    var mid = scoreInRange_(it.midterm, maxM, 'กลางภาคของ ' + it.studentId);
    var fin = scoreInRange_(it.final, maxF, 'ปลายภาคของ ' + it.studentId);
    var r = find_(rows, function (x) { return x.courseCode === p.courseCode && x.studentId === it.studentId; });
    if (!r) {
      if (mid === '' && fin === '') return;
      r = { courseCode: p.courseCode, studentId: it.studentId };
      rows.push(r);
    }
    r.midterm = mid;
    r.final = fin;
  });
  saveAll_('Exams');
  return apiGetExams_(user, p);
}

/* ---------- อาจารย์: สมุดคะแนน / ตั้งค่า ---------- */

function apiGradebook_(user, p) {
  requireTeacher_(user);
  var d = courseData_(p.courseCode);
  return {
    course: d.course,
    settings: d.settings,
    assignments: d.assignments,
    students: rosterOf_(p.courseCode).map(function (r) {
      var v = studentView_(r);
      v.attendance = d.att[r.studentId] || marksOf_(null);
      v.exams = d.exams[r.studentId] || { midterm: null, final: null };
      v.scores = {};
      d.assignments.forEach(function (a) {
        var s = d.subs[a.id + '|' + r.studentId];
        v.scores[a.id] = s ? s.score : null;
      });
      v.result = computeFor_(d, r.studentId);
      return v;
    })
  };
}

function apiUpdateCourse_(user, p) {
  requireTeacher_(user);
  var c = courseRow_(p.courseCode);
  if (p.weights) {
    var w = {};
    Grade.PARTS.forEach(function (k) {
      var n = numOrNull_(p.weights[k]);
      if (n === null || n < 0) throw new Error('น้ำหนักคะแนนต้องเป็นตัวเลข ≥ 0');
      w[k] = n;
    });
    c.weights = JSON.stringify(w);
  }
  if (p.gradesVisible !== undefined) c.gradesVisible = p.gradesVisible ? 'true' : 'false';
  if (p.title) c.title = str_(p.title, 200);
  update_('Courses', c);
  return courseView_(c);
}

function apiGetSettings_(user) {
  requireTeacher_(user);
  return settingsView_();
}

function apiUpdateSettings_(user, p) {
  requireTeacher_(user);
  var updates = {};
  if (p.teacherEmails) {
    var t = p.teacherEmails.map(function (e) { return str_(e).toLowerCase(); }).filter(Boolean);
    if (t.indexOf(user.email) < 0) throw new Error('ต้องมีอีเมลของคุณเองอยู่ในรายชื่ออาจารย์');
    updates.teacherEmails = t.join(',');
  }
  if (p.allowedDomains) updates.allowedDomains = p.allowedDomains.map(function (d) { return str_(d).toLowerCase().replace(/^@/, ''); }).filter(Boolean).join(',');
  if (p.allowedOrigins) updates.allowedOrigins = p.allowedOrigins.map(function (o) { return str_(o).replace(/\/+$/, ''); }).filter(Boolean).join(',');
  if (p.gradeCutoffs) {
    var cut = p.gradeCutoffs.map(function (g) { return [str_(g[0], 5), Number(g[1])]; });
    if (cut.some(function (g) { return !g[0] || !isFinite(g[1]); })) throw new Error('เกณฑ์เกรดไม่ถูกต้อง');
    updates.gradeCutoffs = JSON.stringify(cut);
  }
  if (p.attendancePoints) {
    var pts = {};
    ['P', 'L', 'E', 'A'].forEach(function (k) {
      var n = numOrNull_(p.attendancePoints[k]);
      if (n === null || n < 0 || n > 1) throw new Error('คะแนนเช็คชื่อต้องอยู่ระหว่าง 0–1');
      pts[k] = n;
    });
    updates.attendancePoints = JSON.stringify(pts);
  }
  if (p.deletePin) {
    // เปลี่ยน PIN ต้องใส่ PIN เดิมก่อน (ลืม PIN: ลบค่า deletePinHash ในแท็บ Settings ของ Google Sheet)
    if (hasDeletePin_()) checkDeletePin_(user, p.deletePin.current);
    var pin = str_(p.deletePin.next, 20);
    if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN ต้องเป็นตัวเลข 4–8 หลัก');
    updates.deletePinSalt = uid_('P');
    updates.deletePinHash = hashPin_(updates.deletePinSalt, pin);
  }
  if (p.uploadMaxMB !== undefined) {
    var mb = numOrNull_(p.uploadMaxMB);
    if (!(mb > 0)) throw new Error('ขนาดไฟล์สูงสุดไม่ถูกต้อง');
    updates.uploadMaxMB = String(mb);
  }
  var rows = rows_('Settings');
  Object.keys(updates).forEach(function (k) {
    var r = find_(rows, function (x) { return x.key === k; });
    if (r) {
      r.value = updates[k];
      update_('Settings', r);
    } else {
      insert_('Settings', { key: k, value: updates[k] });
    }
  });
  _cache.settings = null;
  return settingsView_();
}

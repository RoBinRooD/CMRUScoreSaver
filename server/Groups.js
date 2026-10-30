/*
 * Groups — งานกลุ่ม
 * งานที่ตั้ง groupMax ≥ 2 = งานกลุ่ม: นักศึกษาจับกลุ่มเองแยกตามงาน (อาจารย์แก้ได้)
 * ไฟล์/ลิงก์ของกลุ่มอยู่ในแถว Submissions ที่มี groupId (studentId ว่าง)
 * ส่วนคะแนน/ความเห็นยังอยู่ในแถวของนักศึกษาแต่ละคน → สูตรเกรดและสมุดคะแนนไม่ต้องรู้จักกลุ่ม
 */

function isGroupWork_(a) {
  return (Number(a.groupMax) || 0) >= 2;
}

function groupsOf_(assignmentId) {
  return rows_('Groups').filter(function (g) { return g.assignmentId === assignmentId; });
}

function membersOf_(g) {
  return parseJson_(g.members, []);
}

function groupOf_(assignmentId, studentId) {
  return find_(groupsOf_(assignmentId), function (g) { return membersOf_(g).indexOf(studentId) >= 0; });
}

function groupRow_(id) {
  var g = find_(rows_('Groups'), function (r) { return r.id === id; });
  if (!g) throw new Error('ไม่พบกลุ่มนี้');
  return g;
}

function groupSubmissionRow_(groupId) {
  return find_(rows_('Submissions'), function (s) { return s.groupId === groupId && !s.studentId; });
}

function newGroupSubmission_(assignmentId, groupId) {
  var s = newSubmission_(assignmentId, '');
  s.groupId = groupId;
  return s;
}

/** ให้คะแนนสมาชิกคนใดคนหนึ่งแล้ว = กลุ่มนี้ตรวจแล้ว */
function groupGraded_(a, g) {
  return membersOf_(g).some(function (id) {
    var s = submissionRow_(a.id, id);
    return s && s.score !== '';
  });
}

function groupView_(a, g) {
  var roster = {};
  rosterOf_(a.courseCode).forEach(function (r) { roster[r.studentId] = r; });
  return {
    id: g.id,
    name: g.name,
    members: membersOf_(g).map(function (id) {
      return { studentId: id, name: roster[id] ? roster[id].name : '(ไม่อยู่ในรายชื่อแล้ว)' };
    }),
    submission: submissionView_(groupSubmissionRow_(g.id))
  };
}

/** แถวที่นักศึกษาเห็นเป็น "งานของฉัน": ไฟล์/ลิงก์ของกลุ่ม + คะแนน/ความเห็นของตัวเอง */
function mergedSubmission_(a, studentId) {
  var own = submissionView_(submissionRow_(a.id, studentId));
  if (!isGroupWork_(a)) return own;
  var g = groupOf_(a.id, studentId);
  var work = g ? submissionView_(groupSubmissionRow_(g.id)) : null;
  if (!work && !own) return null;
  var v = work || submissionView_(newSubmission_(a.id, studentId));
  v.score = own ? own.score : null;
  v.feedback = own ? own.feedback : '';
  v.gradedAt = own ? own.gradedAt : '';
  return v;
}

/**
 * แชร์ไฟล์ของกลุ่มให้สมาชิกที่สมัครแล้ว
 * studentIds: เฉพาะคนเหล่านี้ (ค่าเริ่มต้น = ทุกคนในกลุ่ม) · fileIds: เฉพาะไฟล์เหล่านี้ (ค่าเริ่มต้น = ทุกไฟล์ของกลุ่ม)
 */
function shareGroupFiles_(g, studentIds, fileIds) {
  var ids = (studentIds || membersOf_(g)).filter(function (id) { return membersOf_(g).indexOf(id) >= 0; });
  forGroupFiles_(g, ids, fileIds, shareReader_);
}

/** ถอนสิทธิ์ดูไฟล์ของกลุ่มจากคนที่ไม่ได้อยู่ในกลุ่มแล้ว */
function unshareGroupFiles_(g, studentIds) {
  var ids = studentIds.filter(function (id) { return membersOf_(g).indexOf(id) < 0; });
  forGroupFiles_(g, ids, null, unshareReader_);
}

function forGroupFiles_(g, ids, fileIds, fn) {
  if (!fileIds) {
    var sub = groupSubmissionRow_(g.id);
    fileIds = (sub ? parseJson_(sub.files, []) : []).map(function (f) { return f.id; });
  }
  if (!fileIds.length || !ids.length) return;
  var emails = {};
  rows_('Students').forEach(function (r) {
    if (r.email && ids.indexOf(r.studentId) >= 0) emails[r.email.toLowerCase()] = true;
  });
  Object.keys(emails).forEach(function (e) {
    fileIds.forEach(function (id) { fn(id, e); });
  });
}

/** หลังผูกบัญชี: ให้เห็นไฟล์ของกลุ่มที่เพื่อนส่งไว้ก่อนแล้ว */
function shareGroupFilesWithStudent_(studentId) {
  rows_('Groups').forEach(function (g) {
    if (membersOf_(g).indexOf(studentId) >= 0) shareGroupFiles_(g, [studentId]);
  });
}

function checkGroupEditable_(a) {
  if (a.published !== 'true') throw new Error('งานนี้ยังไม่เปิด');
  if (isPastDue_(a) && a.allowLate !== 'true') throw new Error('เลยกำหนดส่งแล้ว แก้กลุ่มไม่ได้ (ติดต่ออาจารย์)');
}

/* ---------- คำสั่ง ---------- */

/** รายชื่อเพื่อนในวิชาและกลุ่มที่แต่ละคนอยู่ — ใช้ตอนสร้าง/แก้กลุ่ม */
function apiGroupOptions_(user, p) {
  var a = assignmentRow_(p.assignmentId);
  checkEnrolled_(user, a.courseCode);
  if (!isGroupWork_(a)) throw new Error('งานนี้ไม่ใช่งานกลุ่ม');
  if (user.role !== 'teacher' && a.published !== 'true') throw new Error('งานนี้ยังไม่เปิด');
  var groupName = {};
  var groupId = {};
  groupsOf_(a.id).forEach(function (g) {
    membersOf_(g).forEach(function (id) { groupName[id] = g.name; groupId[id] = g.id; });
  });
  return {
    groupMax: Number(a.groupMax),
    students: rosterOf_(a.courseCode).map(function (r) {
      return { studentId: r.studentId, name: r.name, groupId: groupId[r.studentId] || null, groupName: groupName[r.studentId] || null };
    })
  };
}

/**
 * สร้าง/แก้กลุ่ม: { assignmentId, groupId?, name, members: [studentId] }
 * นักศึกษา: ต้องเป็นสมาชิกของกลุ่ม, ไม่เกิน groupMax, เพื่อนที่อยู่กลุ่มอื่นแล้วเลือกไม่ได้, กลุ่มที่ตรวจแล้วแก้ไม่ได้
 * อาจารย์: ย้ายคนจากกลุ่มอื่นได้ และเกิน groupMax ได้
 */
function apiSaveGroup_(user, p) {
  var a = assignmentRow_(p.assignmentId);
  checkEnrolled_(user, a.courseCode);
  if (!isGroupWork_(a)) throw new Error('งานนี้ไม่ใช่งานกลุ่ม');
  var teacher = user.role === 'teacher';
  if (!teacher) {
    requireStudent_(user);
    checkGroupEditable_(a);
  }
  var name = str_(p.name, 100);
  if (!name) throw new Error('กรุณาตั้งชื่อกลุ่ม');

  var members = [];
  (p.members || []).forEach(function (id) {
    id = str_(id, 20);
    if (id && members.indexOf(id) < 0) members.push(id);
  });
  if (!teacher && members.indexOf(user.studentId) < 0) members.unshift(user.studentId);
  if (!members.length) throw new Error('กลุ่มต้องมีสมาชิกอย่างน้อย 1 คน');
  members.forEach(function (id) { checkInRoster_(a.courseCode, id); });
  var max = Number(a.groupMax);
  if (!teacher && members.length > max) throw new Error('กลุ่มมีได้สูงสุด ' + max + ' คน');

  var g;
  var before = [];
  if (p.groupId) {
    g = groupRow_(p.groupId);
    if (g.assignmentId !== a.id) throw new Error('ไม่พบกลุ่มนี้');
    if (!teacher && membersOf_(g).indexOf(user.studentId) < 0) throw new Error('คุณไม่ได้อยู่ในกลุ่มนี้');
    if (!teacher && groupGraded_(a, g)) throw new Error('กลุ่มนี้ตรวจให้คะแนนแล้ว แก้ไม่ได้ (ติดต่ออาจารย์)');
    before = membersOf_(g);
    // นักศึกษาเพิ่มเพื่อนได้อย่างเดียว — เอาคนออกต้องให้คนนั้นกด "ออกจากกลุ่ม" เอง หรือให้อาจารย์ทำ
    if (!teacher && before.some(function (id) { return members.indexOf(id) < 0; })) {
      throw new Error('นำเพื่อนออกจากกลุ่มไม่ได้ — ให้เพื่อนกด "ออกจากกลุ่ม" เอง หรือติดต่ออาจารย์');
    }
  } else if (!teacher && groupOf_(a.id, user.studentId)) {
    throw new Error('คุณอยู่ในกลุ่มอื่นของงานนี้แล้ว');
  }
  if (groupsOf_(a.id).some(function (x) { return x !== g && x.name.toLowerCase() === name.toLowerCase(); })) {
    throw new Error('มีกลุ่มชื่อ "' + name + '" แล้ว');
  }

  var others = groupsOf_(a.id).filter(function (x) { return x !== g; });
  var moved = [];
  members.forEach(function (id) {
    var other = find_(others, function (x) { return membersOf_(x).indexOf(id) >= 0; });
    if (!other) return;
    if (!teacher) throw new Error(id + ' อยู่กลุ่ม "' + other.name + '" แล้ว');
    other.members = JSON.stringify(membersOf_(other).filter(function (m) { return m !== id; }));
    moved.push({ g: other, id: id });
  });

  if (g) {
    g.name = name;
    g.members = JSON.stringify(members);
  } else {
    g = { id: uid_('G'), assignmentId: a.id, name: name, members: JSON.stringify(members), createdAt: now_() };
    rows_('Groups').push(g);
  }
  // กลุ่มที่ถูกย้ายสมาชิกออกจนว่าง และยังไม่มีงาน → ลบทิ้ง
  remove_('Groups', function (x) {
    return x.assignmentId === a.id && !membersOf_(x).length && !hasWork_(groupSubmissionRow_(x.id));
  });
  saveAll_('Groups');
  pruneTasks_();
  shareGroupFiles_(g, members.filter(function (id) { return before.indexOf(id) < 0; }));
  unshareGroupFiles_(g, before);
  moved.forEach(function (m) { unshareGroupFiles_(m.g, [m.id]); });
  return groupView_(a, g);
}

function hasWork_(sub) {
  return !!(sub && (parseJson_(sub.files, []).length || sub.link));
}

function apiLeaveGroup_(user, p) {
  requireStudent_(user);
  var a = assignmentRow_(p.assignmentId);
  checkEnrolled_(user, a.courseCode);
  checkGroupEditable_(a);
  var g = groupOf_(a.id, user.studentId);
  if (!g) throw new Error('คุณยังไม่ได้อยู่ในกลุ่ม');
  if (groupGraded_(a, g)) throw new Error('กลุ่มนี้ตรวจให้คะแนนแล้ว ออกไม่ได้ (ติดต่ออาจารย์)');
  var left = membersOf_(g).filter(function (id) { return id !== user.studentId; });
  if (!left.length && hasWork_(groupSubmissionRow_(g.id))) {
    throw new Error('คุณเป็นสมาชิกคนสุดท้าย — ลบไฟล์/ลิงก์ที่ส่งไว้ก่อนออกจากกลุ่ม');
  }
  g.members = JSON.stringify(left);
  if (left.length) {
    update_('Groups', g);
    unshareGroupFiles_(g, [user.studentId]);
  } else {
    remove_('Submissions', function (s) { return s.groupId === g.id && !s.studentId; });
    remove_('Groups', function (x) { return x.id === g.id; });
    pruneTasks_();
  }
  return { left: g.id };
}

function apiDeleteGroup_(user, p) {
  requireTeacher_(user);
  var g = groupRow_(p.groupId);
  if (hasWork_(groupSubmissionRow_(g.id))) throw new Error('กลุ่มนี้ส่งงานแล้ว ลบไม่ได้ — ย้ายสมาชิกไปกลุ่มอื่นแทน');
  remove_('Submissions', function (s) { return s.groupId === g.id && !s.studentId; });
  remove_('Groups', function (x) { return x.id === g.id; });
  pruneTasks_();
  return { deleted: g.id };
}

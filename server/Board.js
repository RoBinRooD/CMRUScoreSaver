/*
 * Board — บอร์ดกลุ่ม: ป้ายของทุกกลุ่มในงานกลุ่ม + Kanban วางแผนงานของแต่ละกลุ่ม (ต้องทำ / กำลังทำ / เสร็จ)
 * แผนงานเห็นเฉพาะสมาชิกกลุ่มนั้น (แก้ไขได้) และอาจารย์ (ดูอย่างเดียว)
 * กลุ่มอื่นเห็นแค่ชื่อกลุ่มและสมาชิก
 */

var TASK_STATUS = ['todo', 'doing', 'done'];
var MAX_TASKS_PER_GROUP = 200;

function tasksOf_(groupId) {
  return rows_('Tasks').filter(function (t) { return t.groupId === groupId; });
}

function taskView_(t) {
  return {
    id: t.id, title: t.title, note: t.note, status: t.status, assignee: t.assignee, dueAt: t.dueAt,
    createdBy: t.createdBy, createdAt: t.createdAt, updatedAt: t.updatedAt
  };
}

/** ลบแผนงานของกลุ่มที่ไม่มีอยู่แล้ว — เรียกหลังลบกลุ่ม/งาน/วิชา */
function pruneTasks_() {
  var alive = {};
  rows_('Groups').forEach(function (g) { alive[g.id] = true; });
  remove_('Tasks', function (t) { return !alive[t.groupId]; });
}

function isMember_(user, g) {
  return user.role === 'student' && membersOf_(g).indexOf(user.studentId) >= 0;
}

function boardGroup_(user, groupId) {
  var g = groupRow_(groupId);
  var a = assignmentRow_(g.assignmentId);
  checkEnrolled_(user, a.courseCode);
  if (user.role !== 'teacher' && !isMember_(user, g)) throw new Error('ดูได้เฉพาะแผนงานของกลุ่มตัวเอง');
  if (user.role !== 'teacher' && a.published !== 'true') throw new Error('งานนี้ถูกซ่อนอยู่');
  return { g: g, a: a };
}

function taskCounts_(groupId) {
  var c = { todo: 0, doing: 0, done: 0 };
  tasksOf_(groupId).forEach(function (t) { if (c[t.status] !== undefined) c[t.status]++; });
  return c;
}

/** ป้ายของทุกกลุ่ม แยกตามงานกลุ่ม */
function apiBoardGroups_(user, p) {
  checkEnrolled_(user, p.courseCode);
  var teacher = user.role === 'teacher';
  if (!teacher) requireStudent_(user);
  return rows_('Assignments')
    .filter(function (a) { return a.courseCode === p.courseCode && isGroupWork_(a) && (teacher || a.published === 'true'); })
    .sort(byDue_)
    .map(function (a) {
      var groups = groupsOf_(a.id).map(function (g) {
        var v = groupView_(a, g);
        var mine = isMember_(user, g);
        return {
          id: g.id, name: g.name, members: v.members, mine: mine,
          submitted: !!(v.submission && v.submission.submittedAt),
          counts: mine || teacher ? taskCounts_(g.id) : null
        };
      });
      var grouped = {};
      groups.forEach(function (g) { g.members.forEach(function (m) { grouped[m.studentId] = true; }); });
      return {
        assignment: assignmentView_(a),
        groups: groups,
        ungrouped: rosterOf_(a.courseCode).filter(function (r) { return !grouped[r.studentId]; }).length
      };
    });
}

function apiGroupBoard_(user, p) {
  var x = boardGroup_(user, p.groupId);
  return {
    assignment: assignmentView_(x.a),
    group: groupView_(x.a, x.g),
    canEdit: isMember_(user, x.g),
    tasks: tasksOf_(x.g.id).map(taskView_)
  };
}

/** สร้าง (ไม่มี id) หรือแก้บางช่อง (มี id) — คืนบอร์ดทั้งกลุ่ม */
function apiSaveTask_(user, p) {
  requireStudent_(user);
  var x = boardGroup_(user, p.groupId);
  var t;
  if (p.id) {
    t = find_(tasksOf_(x.g.id), function (r) { return r.id === p.id; });
    if (!t) throw new Error('ไม่พบงานย่อยนี้');
  } else {
    if (tasksOf_(x.g.id).length >= MAX_TASKS_PER_GROUP) throw new Error('มีงานย่อยได้สูงสุด ' + MAX_TASKS_PER_GROUP + ' รายการต่อกลุ่ม');
    t = { id: uid_('T'), groupId: x.g.id, title: '', note: '', status: 'todo', assignee: '', dueAt: '', createdBy: user.studentId, createdAt: now_() };
  }
  if (p.title !== undefined) t.title = str_(p.title, 200);
  if (!t.title) throw new Error('กรุณาใส่ชื่องานย่อย');
  if (p.note !== undefined) t.note = str_(p.note, 2000);
  if (p.status !== undefined) {
    if (TASK_STATUS.indexOf(p.status) < 0) throw new Error('สถานะไม่ถูกต้อง');
    t.status = p.status;
  }
  if (p.assignee !== undefined) {
    var who = str_(p.assignee, 20);
    if (who && membersOf_(x.g).indexOf(who) < 0) throw new Error('ผู้รับผิดชอบต้องเป็นสมาชิกกลุ่ม');
    t.assignee = who;
  }
  if (p.dueAt !== undefined) {
    if (p.dueAt && isNaN(new Date(p.dueAt).getTime())) throw new Error('วันกำหนดไม่ถูกต้อง');
    t.dueAt = p.dueAt ? new Date(p.dueAt).toISOString() : '';
  }
  t.updatedAt = now_();
  if (p.id) update_('Tasks', t); else insert_('Tasks', t);
  return apiGroupBoard_(user, { groupId: x.g.id });
}

function apiDeleteTask_(user, p) {
  requireStudent_(user);
  var x = boardGroup_(user, p.groupId);
  var n = remove_('Tasks', function (t) { return t.groupId === x.g.id && t.id === p.id; });
  if (!n) throw new Error('ไม่พบงานย่อยนี้');
  return apiGroupBoard_(user, { groupId: x.g.id });
}

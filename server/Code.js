/*
 * CMRUScoreSaver — Google Apps Script web app (backend)
 * เว็บ (GitHub Pages) เรียกผ่าน POST { action, payload, idToken } แล้วได้ { ok, data | error } กลับไป
 * สคริปต์รันในนามอาจารย์ (Execute as: Me) จึงเขียน Google Sheet และ Drive ของอาจารย์ได้
 */

// คำสั่งที่มีการเขียนข้อมูล — รันภายใต้ lock เพื่อกันการเขียนชนกัน
var WRITE_ACTIONS = {
  register: 1, finalizeUpload: 1, submitLink: 1, removeFile: 1,
  importRoster: 1, upsertAssignment: 1, deleteAssignment: 1, saveGrades: 1,
  saveAttendance: 1, setAttendanceMarks: 1, saveExams: 1, updateCourse: 1, updateSettings: 1,
  setStudentEmail: 1, setStudentNote: 1, addStudent: 1, removeStudent: 1,
  saveGroup: 1, leaveGroup: 1, deleteGroup: 1, deleteCourse: 1,
  saveSyllabus: 1, addSyllabusLink: 1, finalizeSyllabusUpload: 1, removeSyllabusAttachment: 1,
  saveTask: 1, deleteTask: 1,
  submitLeave: 1, finalizeLeaveUpload: 1, cancelLeave: 1, decideLeave: 1,
  // สร้างโฟลเดอร์ใน Drive + Script Properties และนับ rate limit
  startUpload: 1, startLeaveUpload: 1, startSyllabusUpload: 1
};

var hasOwn_ = function (obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); };

function doGet() {
  return json_({ ok: true, data: { service: 'CMRUScoreSaver', time: now_() } });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'คำขอไม่ถูกต้อง' });
  }
  return json_(handleRequest_(req));
}

function handleRequest_(req) {
  try {
    var actions = actions_();
    var name = String((req && req.action) || '');
    var fn = hasOwn_(actions, name) ? actions[name] : null;
    if (!fn) throw new Error('ไม่รู้จักคำสั่ง: ' + name);
    var run = function () {
      resetCache_();
      var user = authenticate_(req.idToken);
      return fn(user, req.payload || {});
    };
    var data = hasOwn_(WRITE_ACTIONS, name) ? withLock_(run) : run();
    return { ok: true, data: data };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

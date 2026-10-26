/*
 * CMRUScoreSaver — Google Apps Script web app (backend)
 * เว็บ (GitHub Pages) เรียกผ่าน POST { action, payload, idToken } แล้วได้ { ok, data | error } กลับไป
 * สคริปต์รันในนามอาจารย์ (Execute as: Me) จึงเขียน Google Sheet และ Drive ของอาจารย์ได้
 */

// คำสั่งที่มีการเขียนข้อมูล — รันภายใต้ lock เพื่อกันการเขียนชนกัน
var WRITE_ACTIONS = {
  register: 1, finalizeUpload: 1, submitLink: 1, removeFile: 1,
  importRoster: 1, upsertAssignment: 1, deleteAssignment: 1, saveGrades: 1,
  saveAttendance: 1, saveExams: 1, updateCourse: 1, updateSettings: 1,
  setStudentEmail: 1, addStudent: 1, removeStudent: 1,
  saveGroup: 1, leaveGroup: 1, deleteGroup: 1, deleteCourse: 1
};

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
    var fn = actions_()[req && req.action];
    if (!fn) throw new Error('ไม่รู้จักคำสั่ง: ' + (req && req.action));
    var run = function () {
      resetCache_();
      var user = authenticate_(req.idToken);
      return fn(user, req.payload || {});
    };
    var data = WRITE_ACTIONS[req.action] ? withLock_(run) : run();
    return { ok: true, data: data };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

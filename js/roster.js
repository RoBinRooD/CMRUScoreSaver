/*
 * Roster — อ่านไฟล์ "รายชื่อนักศึกษาลงทะเบียน" (.xls) ที่ export จากระบบทะเบียน มรภ.เชียงใหม่
 * รับข้อมูลเป็นตาราง 2 มิติ (array ของแถว) ที่ได้จาก SheetJS: XLSX.utils.sheet_to_json(ws, {header: 1})
 */
var Roster = (function () {
  function clean(v) {
    return String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim();
  }

  function parse(rows) {
    var course = { courseCode: '', title: '', credits: '', section: '', term: '', schedule: '', teacher: '' };
    var students = [];
    var seen = {};

    rows.forEach(function (row) {
      var cells = (row || []).map(clean);
      var line = cells.filter(Boolean).join(' | ');

      var m = line.match(/รหัสวิชา\s+(\S+)\s+(.+?)\s+หน่วยกิต\s+(\S+)\s+Sec\s+(\S+)/);
      if (m) {
        course.courseCode = m[1];
        course.title = m[2];
        course.credits = m[3];
        course.section = m[4];
      }
      m = line.match(/ผู้สอน\s+([^|]+)/);
      if (m) course.teacher = m[1].trim();
      m = line.match(/ภาคการศึกษา\s+(\d\/\d{4})/);
      if (m) course.term = m[1];
      m = line.match(/วันเวลาเรียน\s+([^|]+)/);
      if (m) course.schedule = m[1].trim();

      // แถวนักศึกษา: [เลขที่, รหัสประจำตัว, ชื่อ, หมู่เรียน, ...]
      if (/^\d+$/.test(cells[0] || '') && /^\d{8,13}$/.test(cells[1] || '') && cells[2]) {
        if (seen[cells[1]]) return;
        seen[cells[1]] = true;
        students.push({ no: Number(cells[0]), studentId: cells[1], name: cells[2], group: cells[3] || '' });
      }
    });

    if (!course.courseCode) throw new Error('ไม่พบ "รหัสวิชา" ในไฟล์ — ไฟล์นี้อาจไม่ใช่ใบรายชื่อจากระบบทะเบียน');
    if (!students.length) throw new Error('ไม่พบรายชื่อนักศึกษาในไฟล์');
    return { course: course, students: students };
  }

  return { parse: parse };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Roster;

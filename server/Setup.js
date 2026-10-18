/*
 * Setup — รันครั้งเดียวจากตัวแก้ไข Apps Script (เลือกฟังก์ชัน setup แล้วกด Run)
 * สร้างแท็บทั้งหมด, ค่าตั้งต้นใน Settings และโฟลเดอร์เก็บงานใน Drive
 * รันซ้ำได้ — จะไม่ลบข้อมูลเดิม
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('ต้องเปิด Apps Script จากเมนู ส่วนขยาย > Apps Script ของ Google Sheet');
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());

  Object.keys(SCHEMA).forEach(function (name) {
    var cols = SCHEMA[name];
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
  });

  ss.getSheets().forEach(function (sh) {
    if (!SCHEMA[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  resetCache_();
  var me = Session.getEffectiveUser().getEmail();
  var defaults = {
    teacherEmails: me,
    allowedDomains: '',
    allowedOrigins: 'https://robinrood.github.io',
    clientId: '',
    rootFolderId: '',
    gradeCutoffs: JSON.stringify(Grade.DEFAULT_CUTOFFS),
    attendancePoints: JSON.stringify(Grade.DEFAULT_ATTENDANCE_POINTS),
    uploadMaxMB: '2048'
  };
  var have = settings_();
  if (!have.rootFolderId) defaults.rootFolderId = DriveApp.createFolder('CMRUScoreSaver งานนักศึกษา').getId();
  Object.keys(defaults).forEach(function (k) {
    if (have[k] === undefined) insert_('Settings', { key: k, value: defaults[k] });
    else if (k === 'rootFolderId' && !have[k]) {
      var r = find_(rows_('Settings'), function (x) { return x.key === k; });
      r.value = defaults[k];
      update_('Settings', r);
    }
  });

  Logger.log('ตั้งค่าเสร็จแล้ว — ต่อไป: ใส่ clientId และ allowedDomains ในแท็บ Settings แล้ว Deploy เป็น Web app');
}

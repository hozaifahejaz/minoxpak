/**
 * Minoxpak order sheet.
 *
 * Saves every order from the website into this Google Sheet, even when the customer never presses
 * Send in WhatsApp, and lists customers who are due to reorder each morning.
 * Setup steps are in google-sheet/README.md.
 */

var ORDERS = 'Orders';
var DUE = 'Reorder due';
var HEADERS = ['Date', 'Order', 'Status', 'Name', 'Mobile', 'City', 'Address', 'Items', 'Months',
  'Subtotal', 'Delivery', 'Discount', 'Total', 'Payment', 'Reorder due', 'Reminder sent', 'Reminder link', 'Call or chat'];
var STATUS_NEW = 'New: check WhatsApp';
var REMIND_DAYS_EARLY = 5;     // remind this many days before the supply runs out
var WA_SHOP_NAME = 'Minoxpak';

/** Run once from the editor: creates the sheets and a daily 9 am reminder check. */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(ORDERS) || ss.insertSheet(ORDERS);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList([STATUS_NEW, 'Confirmed', 'Shipped', 'Delivered', 'Refused', 'Cancelled'], true)
    .setAllowInvalid(true).build());
  sh.getRange('P2:P').insertCheckboxes();
  if (!ss.getSheetByName(DUE)) ss.insertSheet(DUE);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyReminders') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyReminders').timeBased().everyDays(1).atHour(9).create();
}

/** The website posts each order here as JSON. */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var o = JSON.parse(e.postData.contents);
    if (!/^MP-[A-Z0-9]{4,10}$/.test(o.ref || '') || !/^03\d{9}$/.test(o.phone || '')) return reply_({ ok: false });
    lock.waitLock(10000);
    var sh = SpreadsheetApp.getActive().getSheetByName(ORDERS);
    // ignore the same order sent twice
    var refs = sh.getLastRow() > 1 ? sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues() : [];
    for (var i = 0; i < refs.length; i++) if (refs[i][0] === o.ref) return reply_({ ok: true });

    var now = new Date();
    var months = Math.max(0, Math.min(60, Number(o.months) || 0));
    var due = months ? new Date(now.getTime() + (months * 30 - REMIND_DAYS_EARLY) * 864e5) : '';
    var name = clean_(o.name, 80), phone = o.phone;
    var intl = '92' + phone.slice(1);
    var reminder = 'Assalam o Alaikum ' + name.split(' ')[0] + ', this is ' + WA_SHOP_NAME + '. Your minoxidil should be running low soon. ' +
      'To keep your results, it is important not to miss days. Would you like us to send your next pack?';
    sh.appendRow([
      now, o.ref, STATUS_NEW, name, "'" + phone, clean_(o.city, 60), clean_(o.addr, 300),
      clean_((o.lines || []).join('\n'), 600), months || '', num_(o.sub), num_(o.ship), num_(o.discount), num_(o.total),
      clean_(o.payment, 40), due, false,
      'https://wa.me/' + intl + '?text=' + encodeURIComponent(reminder), 'https://wa.me/' + intl
    ]);
    sh.getRange(sh.getLastRow(), 16).insertCheckboxes();
    return reply_({ ok: true });
  } catch (err) {
    return reply_({ ok: false });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/** Runs every morning: lists customers due to reorder and emails you the list. */
function dailyReminders() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(ORDERS);
  if (sh.getLastRow() < 2) return;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();
  var today = new Date(); today.setHours(23, 59, 59, 0);
  var due = rows.filter(function (r) {
    return r[14] instanceof Date && r[14] <= today && r[15] !== true && /Delivered|Shipped|Confirmed/.test(r[2]);
  });
  var out = ss.getSheetByName(DUE) || ss.insertSheet(DUE);
  out.clear();
  out.getRange(1, 1, 1, 6).setValues([['Name', 'Mobile', 'Last order', 'Due since', 'Send reminder (opens WhatsApp)',
    'After sending, tick "Reminder sent" on the Orders sheet']]).setFontWeight('bold');
  if (!due.length) { out.getRange(2, 1).setValue('Nobody is due today.'); return; }
  out.getRange(2, 1, due.length, 5).setValues(due.map(function (r) { return [r[3], r[4], r[1], r[14], r[16]]; }));
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Minoxpak: ' + due.length + ' customer(s) due to reorder',
    due.map(function (r) { return r[3] + ' (' + r[4] + '): ' + r[16]; }).join('\n\n') +
    '\n\nOpen the sheet: ' + ss.getUrl());
}

// Stops text that starts with = + - @ from being treated as a spreadsheet formula.
function clean_(v, max) {
  v = String(v == null ? '' : v).slice(0, max).trim();
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
function num_(v) { v = Number(v); return isFinite(v) ? Math.round(v) : ''; }
function reply_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

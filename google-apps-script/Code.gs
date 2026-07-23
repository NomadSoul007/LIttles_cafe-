const SHEET_NAME = 'Заявки';
const HEADERS = ['Дата', 'Имя', 'Телефон', 'Количество персон'];

function doGet() {
  return jsonResponse_({
    ok: true,
    service: 'Little Stars reservations'
  });
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;

  try {
    lock.waitLock(10000);
    lockAcquired = true;

    const name = normalizeName_(event && event.parameter && event.parameter.name);
    const phone = normalizePhone_(event && event.parameter && event.parameter.phone);
    const guests = Number(event && event.parameter && event.parameter.guests);

    if (name.length < 2 || name.length > 80) {
      throw new Error('Invalid name');
    }

    if (!phone) {
      throw new Error('Invalid phone');
    }

    if (!Number.isInteger(guests) || guests < 1) {
      throw new Error('Invalid guest count');
    }

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

    if (!spreadsheet) {
      throw new Error('The script must be bound to a Google Sheet');
    }

    let sheet = spreadsheet.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
    }

    ensureHeaders_(sheet);
    sheet.appendRow([new Date(), name, phone, guests]);

    return jsonResponse_({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse_({
      ok: false,
      error: 'Unable to save reservation'
    });
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

function ensureHeaders_(sheet) {
  const currentHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const headersAreCorrect = HEADERS.every(function (header, index) {
    return currentHeaders[index] === header;
  });

  if (!headersAreCorrect) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}

function normalizeName_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizePhone_(value) {
  let digits = String(value || '').replace(/\D/g, '');

  if (digits.length === 11 && digits.indexOf('8') === 0) {
    digits = '7' + digits.slice(1);
  } else if (digits.length === 10 && /^[67]/.test(digits)) {
    digits = '7' + digits;
  }

  return /^7[67]\d{9}$/.test(digits) ? '+' + digits : '';
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

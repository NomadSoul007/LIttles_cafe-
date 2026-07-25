const SPREADSHEET_ID = '1GqeSzHeC03aH9-maK2tb6g_NzcnCAfGHnuK3fYLWPT8';
const SHEET_NAME = 'Заявки';
const HEADERS = [
  '№',
  'Дата и время',
  'Имя',
  'Телефон',
  'Количество гостей'
];
const SECRET_PROPERTY = 'RESERVATION_SECRET';
const TIME_ZONE = 'Asia/Almaty';
const MAX_GUESTS = 100;

function doGet() {
  return jsonResponse_({
    ok: true,
    service: 'Little Stars reservations'
  });
}

function setupSheet() {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;

  try {
    lock.waitLock(10000);
    lockAcquired = true;

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getOrCreateSheet_(spreadsheet);
    prepareSheet_(spreadsheet, sheet);

    return {
      ok: true,
      sheetName: SHEET_NAME
    };
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;

  try {
    const parameters = parseRequestParameters_(event);
    validateReservationSecret_(parameters.secret);

    const name = normalizeName_(parameters.name);
    const phone = normalizePhone_(parameters.phone);
    const guests = Number(parameters.guests);

    if (name.length < 2 || name.length > 80) {
      throw new Error('Invalid name');
    }

    if (!phone) {
      throw new Error('Invalid phone');
    }

    if (!Number.isInteger(guests) || guests < 1 || guests > MAX_GUESTS) {
      throw new Error('Invalid guest count');
    }

    lock.waitLock(10000);
    lockAcquired = true;

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getOrCreateSheet_(spreadsheet);
    prepareSheet_(spreadsheet, sheet);

    const reservationNumber = getNextReservationNumber_(sheet);
    const targetRow = sheet.getLastRow() + 1;
    const submittedAt = new Date();

    if (targetRow > sheet.getMaxRows()) {
      sheet.insertRowsAfter(sheet.getMaxRows(), 100);
    }

    sheet.getRange(targetRow, 1, 1, HEADERS.length).setValues([[
      reservationNumber,
      submittedAt,
      protectUserText_(name),
      phone,
      guests
    ]]);

    sheet.getRange(targetRow, 2).setNumberFormat('dd.MM.yyyy HH:mm:ss');
    sheet.getRange(targetRow, 4).setNumberFormat('@').setValue(phone);
    sheet.getRange(targetRow, 5).setNumberFormat('0');
    SpreadsheetApp.flush();

    return jsonResponse_({
      ok: true,
      reservationNumber: reservationNumber
    });
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

function parseRequestParameters_(event) {
  const formParameters = event && event.parameter
    ? event.parameter
    : {};
  const postData = event && event.postData
    ? event.postData
    : null;

  if (
    postData &&
    /application\/json/i.test(String(postData.type || ''))
  ) {
    try {
      const parsed = JSON.parse(postData.contents || '{}');

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      throw new Error('Invalid JSON');
    }
  }

  return formParameters;
}

function validateReservationSecret_(providedSecret) {
  const configuredSecret = String(
    PropertiesService
      .getScriptProperties()
      .getProperty(SECRET_PROPERTY) || ''
  );
  const candidate = String(providedSecret || '');

  if (
    configuredSecret.length < 32 ||
    candidate.length !== configuredSecret.length ||
    candidate !== configuredSecret
  ) {
    throw new Error('Invalid secret');
  }
}

function getOrCreateSheet_(spreadsheet) {
  return spreadsheet.getSheetByName(SHEET_NAME) ||
    spreadsheet.insertSheet(SHEET_NAME);
}

function prepareSheet_(spreadsheet, sheet) {
  spreadsheet.setSpreadsheetTimeZone(TIME_ZONE);
  migrateLegacyStructure_(sheet);
  ensureHeaders_(sheet);
  backfillReservationNumbers_(sheet);
  formatSheet_(sheet);
}

function migrateLegacyStructure_(sheet) {
  if (sheet.getLastRow() === 0) {
    return;
  }

  const existingHeaders = sheet
    .getRange(1, 1, 1, Math.max(HEADERS.length, sheet.getLastColumn()))
    .getDisplayValues()[0]
    .map(function (value) {
      return String(value || '').trim();
    });

  const alreadyCurrent = HEADERS.every(function (header, index) {
    return existingHeaders[index] === header;
  });

  if (alreadyCurrent) {
    return;
  }

  const isLegacyFourColumnSheet = (
    (existingHeaders[0] === 'Дата' ||
      existingHeaders[0] === 'Дата и время') &&
    existingHeaders[1] === 'Имя' &&
    existingHeaders[2] === 'Телефон' &&
    (existingHeaders[3] === 'Количество персон' ||
      existingHeaders[3] === 'Количество гостей')
  );

  if (isLegacyFourColumnSheet) {
    sheet.insertColumnBefore(1);
  }
}

function ensureHeaders_(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  const existingHeaders = headerRange.getDisplayValues()[0];
  const headersAreCorrect = HEADERS.every(function (header, index) {
    return existingHeaders[index] === header;
  });

  if (!headersAreCorrect) {
    headerRange.setValues([HEADERS]);
  }
}

function backfillReservationNumbers_(sheet) {
  const dataRowCount = sheet.getLastRow() - 1;

  if (dataRowCount < 1) {
    return;
  }

  const reservationNumberRange = sheet.getRange(2, 1, dataRowCount, 1);
  const reservationNumbers = reservationNumberRange.getValues();
  let highestNumber = reservationNumbers.reduce(function (highest, row) {
    const number = Number(row[0]);

    return Number.isInteger(number) && number > highest
      ? number
      : highest;
  }, 0);

  reservationNumbers.forEach(function (row, index) {
    const number = Number(row[0]);

    if (Number.isInteger(number) && number > 0) {
      return;
    }

    highestNumber += 1;
    reservationNumberRange.getCell(index + 1, 1).setValue(highestNumber);
  });
}

function getNextReservationNumber_(sheet) {
  const dataRowCount = sheet.getLastRow() - 1;

  if (dataRowCount < 1) {
    return 1;
  }

  const values = sheet
    .getRange(2, 1, dataRowCount, 1)
    .getValues()
    .flat();
  const highestNumber = values.reduce(function (highest, value) {
    const number = Number(value);
    return Number.isInteger(number) && number > highest
      ? number
      : highest;
  }, 0);

  return highestNumber + 1;
}

function formatSheet_(sheet) {
  const maxRows = sheet.getMaxRows();
  const dataRowCount = Math.max(maxRows - 1, 1);
  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);

  headerRange
    .setBackground('#4f7a65')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);

  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 36);
  sheet.setColumnWidth(1, 70);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 220);
  sheet.setColumnWidth(4, 180);
  sheet.setColumnWidth(5, 170);

  sheet.getRange(2, 1, dataRowCount, 1)
    .setHorizontalAlignment('center');
  sheet.getRange(2, 2, dataRowCount, 1)
    .setNumberFormat('dd.MM.yyyy HH:mm:ss')
    .setHorizontalAlignment('center');
  sheet.getRange(2, 4, dataRowCount, 1)
    .setNumberFormat('@');
  sheet.getRange(2, 5, dataRowCount, 1)
    .setNumberFormat('0')
    .setHorizontalAlignment('center');

  const existingFilter = sheet.getFilter();

  if (existingFilter) {
    const filterRange = existingFilter.getRange();
    const filterIsCurrent = (
      filterRange.getRow() === 1 &&
      filterRange.getColumn() === 1 &&
      filterRange.getNumRows() === maxRows &&
      filterRange.getNumColumns() === HEADERS.length
    );

    if (!filterIsCurrent) {
      existingFilter.remove();
      sheet.getRange(1, 1, maxRows, HEADERS.length).createFilter();
    }
  } else {
    sheet.getRange(1, 1, maxRows, HEADERS.length).createFilter();
  }
}

function normalizeName_(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizePhone_(value) {
  let digits = String(value || '').replace(/\D/g, '');

  if (digits.length === 11 && digits.indexOf('8') === 0) {
    digits = '7' + digits.slice(1);
  } else if (digits.length === 10 && /^[67]/.test(digits)) {
    digits = '7' + digits;
  }

  return /^7[67]\d{9}$/.test(digits)
    ? '+' + digits
    : '';
}

function protectUserText_(value) {
  const text = String(value || '');

  return /^[=+\-@]/.test(text)
    ? "'" + text
    : text;
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

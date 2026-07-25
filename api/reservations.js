'use strict';

const GOOGLE_APPS_SCRIPT_ENV = 'GOOGLE_APPS_SCRIPT_URL';
const GOOGLE_APPS_SCRIPT_SECRET_ENV = 'GOOGLE_APPS_SCRIPT_SECRET';
const GOOGLE_SCRIPT_HOST = 'script.google.com';
const MAX_GUESTS = 100;

function sendJson(response, statusCode, payload) {
  response.status(statusCode).json(payload);
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeKazakhstanPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  } else if (digits.length === 10 && /^[67]/.test(digits)) {
    digits = `7${digits}`;
  }

  return /^7[67]\d{9}$/.test(digits)
    ? `+${digits}`
    : '';
}

function getRequestBody(request) {
  if (typeof request.body === 'string') {
    try {
      return JSON.parse(request.body);
    } catch (error) {
      return {};
    }
  }

  return request.body && typeof request.body === 'object'
    ? request.body
    : {};
}

function isValidAppsScriptUrl(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      url.hostname === GOOGLE_SCRIPT_HOST &&
      /^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)
    );
  } catch (error) {
    return false;
  }
}

function isValidSecret(value) {
  return (
    typeof value === 'string' &&
    value.trim().length >= 32
  );
}

module.exports = async function reservationsHandler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');

    sendJson(response, 405, {
      ok: false,
      error: 'Method not allowed'
    });

    return;
  }

  const body = getRequestBody(request);

  // Honeypot: обычный пользователь это поле не заполняет.
  if (body.company) {
    sendJson(response, 400, {
      ok: false,
      error: 'Invalid request'
    });

    return;
  }

  const name = normalizeName(body.name);
  const phone = normalizeKazakhstanPhone(body.phone);
  const guests = Number(body.guests);

  if (name.length < 2 || name.length > 80) {
    sendJson(response, 400, {
      ok: false,
      error: 'Invalid name'
    });

    return;
  }

  if (!phone) {
    sendJson(response, 400, {
      ok: false,
      error: 'Invalid phone'
    });

    return;
  }

  if (
    !Number.isInteger(guests) ||
    guests < 1 ||
    guests > MAX_GUESTS
  ) {
    sendJson(response, 400, {
      ok: false,
      error: 'Invalid guest count'
    });

    return;
  }

  const appsScriptUrl =
    process.env[GOOGLE_APPS_SCRIPT_ENV];

  const appsScriptSecret =
    process.env[GOOGLE_APPS_SCRIPT_SECRET_ENV];

  if (
    !isValidAppsScriptUrl(appsScriptUrl) ||
    !isValidSecret(appsScriptSecret)
  ) {
    sendJson(response, 500, {
      ok: false,
      error: 'Integration is not configured'
    });

    return;
  }

  const requestBody = new URLSearchParams({
    name,
    phone,
    guests: String(guests),
    secret: appsScriptSecret.trim()
  });

  try {
    const googleResponse = await fetch(appsScriptUrl, {
      method: 'POST',
      body: requestBody,
      redirect: 'follow',
      signal: AbortSignal.timeout(10000)
    });

    const responseText = await googleResponse.text();

    let googleResult = null;

    try {
      googleResult = JSON.parse(responseText);
    } catch (error) {
      googleResult = null;
    }

    const reservationNumber =
      googleResult && Number(googleResult.reservationNumber);

    if (
      !googleResponse.ok ||
      !googleResult ||
      googleResult.ok !== true ||
      !Number.isInteger(reservationNumber) ||
      reservationNumber < 1
    ) {
      sendJson(response, 502, {
        ok: false,
        error: 'Google Sheets did not confirm the write'
      });

      return;
    }

    sendJson(response, 201, {
      ok: true,
      reservationNumber
    });
  } catch (error) {
    console.error('Reservation integration error:', error);

    sendJson(response, 502, {
      ok: false,
      error: 'Google Sheets is unavailable'
    });
  }
};

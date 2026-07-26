(function initializeReservationPage() {
  'use strict';

  const API_ENDPOINT = '/api/reservations';
  const MAX_GUESTS = 100;
  const SUCCESS_CLOSE_DELAY = 2600;

  function isReservationMode() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const params = new URLSearchParams(window.location.search);

    return (
      path === '/add' ||
      params.get('booking') === 'form'
    );
  }

  function preserveReservationModeInLinks() {
    document.querySelectorAll('a[href]').forEach((link) => {
      const href = link.getAttribute('href');

      if (!href || href.startsWith('#')) {
        return;
      }

      const url = new URL(href, window.location.href);

      if (url.origin !== window.location.origin) {
        return;
      }

      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (path === '/' || path.endsWith('/index.html')) {
        link.setAttribute('href', `/add${url.hash}`);
        return;
      }

      if (
        path.endsWith('/packages.html') ||
        path.endsWith('/animator-catalog.html')
      ) {
        url.searchParams.set('booking', 'form');
        link.setAttribute('href', `${url.pathname}${url.search}${url.hash}`);
      }
    });
  }

  if (!isReservationMode()) {
    return;
  }

  preserveReservationModeInLinks();

  if (document.getElementById('reservation-modal')) {
    return;
  }

  const modalMarkup = `
    <div aria-hidden="true" class="reservation-modal" id="reservation-modal">
      <div class="reservation-modal-backdrop" data-reservation-close="true"></div>
      <div
        aria-labelledby="reservation-modal-title"
        aria-modal="true"
        class="reservation-modal-card"
        role="dialog"
      >
        <button
          aria-label="Закрыть форму"
          class="reservation-modal-close"
          data-reservation-close="true"
          type="button"
        >×</button>

        <div data-reservation-form-view>
          <p class="eyebrow">Бронирование</p>
          <h2 id="reservation-modal-title">Оставить заявку</h2>
          <p class="reservation-modal-intro">Заполните форму — мы скоро свяжемся с вами.</p>

          <form class="reservation-form" id="reservation-form" novalidate>
            <div class="reservation-field">
              <label for="reservation-name">Имя</label>
              <input
                autocomplete="name"
                id="reservation-name"
                maxlength="80"
                name="name"
                required
                type="text"
              />
              <p class="reservation-field-error" id="reservation-name-error"></p>
            </div>

            <div class="reservation-field">
              <label for="reservation-phone">Номер телефона</label>
              <input
                autocomplete="tel"
                id="reservation-phone"
                inputmode="tel"
                maxlength="24"
                name="phone"
                placeholder="+7 (___) ___-__-__"
                required
                type="tel"
              />
              <p class="reservation-field-error" id="reservation-phone-error"></p>
            </div>

            <div class="reservation-field">
              <label for="reservation-guests">Количество персон</label>
              <input
                id="reservation-guests"
                inputmode="numeric"
                max="${MAX_GUESTS}"
                min="1"
                name="guests"
                required
                step="1"
                type="number"
              />
              <p class="reservation-field-error" id="reservation-guests-error"></p>
            </div>

            <div class="reservation-honeypot" aria-hidden="true">
              <label for="reservation-company">Компания</label>
              <input
                autocomplete="off"
                id="reservation-company"
                name="company"
                tabindex="-1"
                type="text"
              />
            </div>

            <button class="btn btn-primary reservation-submit" type="submit">
              <span data-submit-label>Отправить заявку</span>
              <span aria-hidden="true" class="reservation-spinner"></span>
            </button>
            <p
              aria-live="polite"
              class="reservation-form-status"
              data-reservation-status
              role="status"
            ></p>
          </form>
        </div>

        <div class="reservation-success" data-reservation-success hidden role="status">
          <div aria-hidden="true" class="reservation-success-mark">✓</div>
          <h2>Спасибо!</h2>
          <p>Мы получили вашу заявку и скоро свяжемся с вами.</p>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalMarkup);

  const modal = document.getElementById('reservation-modal');
  const form = document.getElementById('reservation-form');
  const formView = modal.querySelector('[data-reservation-form-view]');
  const successView = modal.querySelector('[data-reservation-success]');
  const submitButton = form.querySelector('.reservation-submit');
  const submitLabel = form.querySelector('[data-submit-label]');
  const statusMessage = form.querySelector('[data-reservation-status]');
  const closeButtons = Array.from(modal.querySelectorAll('[data-reservation-close]'));
  const fields = {
    name: form.elements.name,
    phone: form.elements.phone,
    guests: form.elements.guests,
    company: form.elements.company
  };

  let previouslyFocusedElement = null;
  let closeTimer = null;
  let isSubmitting = false;

  function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeKazakhstanPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');

    if (digits.length === 11 && digits.startsWith('8')) {
      digits = `7${digits.slice(1)}`;
    } else if (digits.length === 10 && /^[67]/.test(digits)) {
      digits = `7${digits}`;
    }

    return /^7[67]\d{9}$/.test(digits) ? `+${digits}` : '';
  }

  function formatPhone(phone) {
    const digits = phone.replace(/\D/g, '');
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }

  function getErrorElement(fieldName) {
    return document.getElementById(`reservation-${fieldName}-error`);
  }

  function setFieldError(fieldName, message) {
    const field = fields[fieldName];
    const errorElement = getErrorElement(fieldName);
    field.setAttribute('aria-invalid', message ? 'true' : 'false');
    field.setAttribute('aria-describedby', errorElement.id);
    errorElement.textContent = message;
  }

  function validateField(fieldName) {
    if (fieldName === 'name') {
      const name = normalizeName(fields.name.value);
      const error = name.length >= 2 ? '' : 'Введите имя — минимум 2 символа.';
      setFieldError('name', error);
      return !error;
    }

    if (fieldName === 'phone') {
      const phone = normalizeKazakhstanPhone(fields.phone.value);
      const error = phone ? '' : 'Введите корректный номер Казахстана, например +7 707 123 45 67.';
      setFieldError('phone', error);
      return !error;
    }

    if (fieldName === 'guests') {
      const guests = Number(fields.guests.value);
      const isValid = Number.isInteger(guests) && guests >= 1 && guests <= MAX_GUESTS;
      const error = isValid ? '' : `Укажите количество персон от 1 до ${MAX_GUESTS}.`;
      setFieldError('guests', error);
      return !error;
    }

    return true;
  }

  function validateForm() {
    const fieldNames = ['name', 'phone', 'guests'];
    const validity = fieldNames.map(validateField);
    const firstInvalidIndex = validity.indexOf(false);

    if (firstInvalidIndex !== -1) {
      fields[fieldNames[firstInvalidIndex]].focus();
      return false;
    }

    return true;
  }

  function resetModalState() {
    clearTimeout(closeTimer);
    form.reset();
    ['name', 'phone', 'guests'].forEach((fieldName) => setFieldError(fieldName, ''));
    statusMessage.textContent = '';
    submitButton.disabled = false;
    submitButton.classList.remove('is-loading');
    submitLabel.textContent = 'Отправить заявку';
    formView.hidden = false;
    successView.hidden = true;
  }

  function openModal() {
    if (modal.classList.contains('is-open')) {
      return;
    }

    clearTimeout(closeTimer);
    previouslyFocusedElement = document.activeElement;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    window.requestAnimationFrame(() => fields.name.focus());
  }

  function closeModal() {
    if (!modal.classList.contains('is-open') || isSubmitting) {
      return;
    }

    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');

    if (previouslyFocusedElement instanceof HTMLElement) {
      previouslyFocusedElement.focus();
    }

    window.setTimeout(resetModalState, 180);
  }

  function setLoading(isLoading) {
    isSubmitting = isLoading;
    submitButton.disabled = isLoading;
    submitButton.classList.toggle('is-loading', isLoading);
    submitLabel.textContent = isLoading ? 'Отправляем…' : 'Отправить заявку';
    closeButtons.forEach((button) => {
      button.disabled = isLoading;
    });
  }

  function trackMetaContact() {
    if (typeof window.fbq !== 'function') {
      return;
    }

    window.fbq('track', 'Contact');
  }

  async function submitReservation(event) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    statusMessage.textContent = '';

    if (!validateForm()) {
      return;
    }

    const normalizedPhone = normalizeKazakhstanPhone(fields.phone.value);
    fields.name.value = normalizeName(fields.name.value);
    fields.phone.value = formatPhone(normalizedPhone);
    setLoading(true);

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: fields.name.value,
          phone: normalizedPhone,
          guests: Number(fields.guests.value),
          company: fields.company.value
        })
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result || result.ok !== true) {
        throw new Error('Reservation request was not confirmed');
      }

      trackMetaContact();
      form.reset();
      formView.hidden = true;
      successView.hidden = false;
      closeTimer = window.setTimeout(closeModal, SUCCESS_CLOSE_DELAY);
    } catch (error) {
      statusMessage.textContent = 'Не удалось отправить заявку. Попробуйте еще раз немного позже.';
    } finally {
      setLoading(false);
    }
  }

  document.querySelectorAll('[data-booking-cta]').forEach((bookingButton) => {
    bookingButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openModal();
    }, true);
  });

  closeButtons.forEach((closeButton) => {
    closeButton.addEventListener('click', closeModal);
  });

  ['name', 'phone', 'guests'].forEach((fieldName) => {
    fields[fieldName].addEventListener('blur', () => validateField(fieldName));
    fields[fieldName].addEventListener('input', () => {
      if (fields[fieldName].getAttribute('aria-invalid') === 'true') {
        validateField(fieldName);
      }
    });
  });

  fields.phone.addEventListener('blur', () => {
    const phone = normalizeKazakhstanPhone(fields.phone.value);
    if (phone) {
      fields.phone.value = formatPhone(phone);
    }
  });

  form.addEventListener('submit', submitReservation);

  document.addEventListener('keydown', (event) => {
    if (!modal.classList.contains('is-open')) {
      return;
    }

    if (event.key === 'Escape') {
      closeModal();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = Array.from(
      modal.querySelectorAll('button:not([disabled]), input:not([disabled]):not([tabindex="-1"])')
    ).filter((element) => !element.hidden);

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  });
})();

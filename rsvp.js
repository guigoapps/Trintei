(function () {
  'use strict';

  const PHONE_STORAGE_KEY = 'guigo_guest_phone';

  let supabaseClient = null;
  function getClient() {
    if (supabaseClient) return supabaseClient;
    if (!window.supabase || !window.__SUPABASE_URL__ || !window.__SUPABASE_ANON_KEY__) return null;
    if (window.__SUPABASE_URL__.includes('COLE_SUA_URL_AQUI')) return null;
    supabaseClient = window.supabase.createClient(window.__SUPABASE_URL__, window.__SUPABASE_ANON_KEY__);
    return supabaseClient;
  }

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let loginForm, phoneInput, loginBtn;
  let rsvpForm, submitBtn, saveNote, toastEl, guestNameEl;
  let currentPhone = null;

  function init() {
    loginForm = $('#login-form');
    phoneInput = $('#phone-input');
    loginBtn = $('#login-btn');
    rsvpForm = $('#rsvp-form');
    submitBtn = $('#submit-btn');
    saveNote = $('#save-note');
    toastEl = $('#toast');
    guestNameEl = $('#guest-name');

    fillHourSelect($('#f-arrival-hour'), 9, 23);
    fillHourSelect($('#f-departure-hour'), 7, 23);

    loginForm.addEventListener('submit', onLogin);
    rsvpForm.addEventListener('submit', onSubmitRsvp);

    $$('.summary-cell').forEach((btn) => {
      btn.addEventListener('click', () => onDayCellClick(btn));
    });

    if (!getClient()) {
      showToast('O site ainda não está conectado ao banco de dados. Veja o README para configurar o Supabase.', true);
    }

    const savedPhone = localStorage.getItem(PHONE_STORAGE_KEY);
    if (savedPhone) {
      attemptLogin(savedPhone, true);
    }
  }

  // ---------------------------------------------------------
  // TIME OPTIONS (hora e minuto em campos separados)
  // ---------------------------------------------------------
  function fillHourSelect(selectEl, startHour, endHour) {
    if (!selectEl) return;
    const frag = document.createDocumentFragment();
    for (let h = startHour; h <= endHour; h++) {
      const hh = String(h).padStart(2, '0');
      const opt = document.createElement('option');
      opt.value = hh;
      opt.textContent = hh;
      frag.appendChild(opt);
    }
    selectEl.appendChild(frag);
  }

  // ---------------------------------------------------------
  // TOAST
  // ---------------------------------------------------------
  let toastTimer = null;
  function showToast(message, isError) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.toggle('is-error', !!isError);
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4000);
  }

  // ---------------------------------------------------------
  // LOGIN
  // ---------------------------------------------------------
  async function onLogin(e) {
    e.preventDefault();
    const raw = phoneInput.value.trim();
    const errEl = document.querySelector('[data-error-for="phone"]');
    errEl.textContent = '';
    if (!raw) {
      errEl.textContent = 'Ops! Informe seu número de telefone.';
      return;
    }
    await attemptLogin(raw, false);
  }

  async function attemptLogin(rawPhone, silent) {
    const client = getClient();
    if (!client) {
      if (!silent) showToast('O site ainda não está conectado ao banco de dados. Veja o README para configurar o Supabase.', true);
      return;
    }
    const errEl = document.querySelector('[data-error-for="phone"]');
    setLoginLoading(true);
    try {
      const { data, error } = await client.rpc('get_guest_by_phone', { p_phone: rawPhone });
      if (error) throw error;
      const guest = Array.isArray(data) ? data[0] : data;
      if (!guest) {
        if (!silent) {
          errEl.textContent = 'Não encontramos esse número na lista de convidados. Confira e tente de novo.';
        }
        localStorage.removeItem(PHONE_STORAGE_KEY);
        return;
      }
      currentPhone = rawPhone;
      localStorage.setItem(PHONE_STORAGE_KEY, rawPhone);
      prefillGuest(guest);

      if (window.__enterApp__) {
        window.__enterApp__();
      }
      loadSummary();
    } catch (err) {
      console.error(err);
      if (!silent) showToast('Ops! Algo deu errado ao entrar. Tente de novo em instantes.', true);
    } finally {
      setLoginLoading(false);
    }
  }

  function setLoginLoading(isLoading) {
    loginBtn.disabled = isLoading;
    loginBtn.querySelector('.btn-spinner').hidden = !isLoading;
    loginBtn.querySelector('.btn-label').textContent = isLoading ? 'Entrando...' : 'Entrar';
  }

  function prefillGuest(guest) {
    guestNameEl.textContent = guest.name;
    rsvpForm.reset();
    saveNote.hidden = true;
    rsvpForm.elements['day_saturday'].checked = !!guest.day_saturday;
    rsvpForm.elements['day_sunday'].checked = !!guest.day_sunday;
    rsvpForm.elements['day_monday'].checked = !!guest.day_monday;
    if (guest.arrival_time) {
      const [hh, mm] = guest.arrival_time.split(':');
      if (hh) rsvpForm.elements['arrival_hour'].value = hh;
      if (mm) rsvpForm.elements['arrival_minute'].value = (mm === '30') ? '30' : '00';
    }
    if (guest.departure_time) {
      const [hh, mm] = guest.departure_time.split(':');
      if (hh) rsvpForm.elements['departure_hour'].value = hh;
      if (mm) rsvpForm.elements['departure_minute'].value = (mm === '30') ? '30' : '00';
    }
  }

  // ---------------------------------------------------------
  // SUBMIT RSVP
  // ---------------------------------------------------------
  function clearFormErrors() {
    document.querySelectorAll('#rsvp-form .field-error').forEach((el) => { el.textContent = ''; });
  }

  async function onSubmitRsvp(e) {
    e.preventDefault();
    clearFormErrors();
    saveNote.hidden = true;

    const raw = new FormData(rsvpForm);
    const daySaturday = rsvpForm.elements['day_saturday'].checked;
    const daySunday = rsvpForm.elements['day_sunday'].checked;
    const dayMonday = rsvpForm.elements['day_monday'].checked;
    const arrivalHour = raw.get('arrival_hour');
    const arrivalMinute = raw.get('arrival_minute');
    const arrivalTime = (arrivalHour && arrivalMinute) ? `${arrivalHour}:${arrivalMinute}` : null;
    const departureHour = raw.get('departure_hour');
    const departureMinute = raw.get('departure_minute');
    const departureTime = (departureHour && departureMinute) ? `${departureHour}:${departureMinute}` : null;

    if (!daySaturday && !daySunday && !dayMonday) {
      document.querySelector('[data-error-for="arrival_day"]').textContent = 'Ops! Marque pelo menos um dia.';
      return;
    }
    if (!arrivalTime) {
      document.querySelector('[data-error-for="form"]').textContent = 'Ops! Parece que faltou informar quando você pretende chegar.';
      return;
    }
    if (!departureTime) {
      document.querySelector('[data-error-for="form"]').textContent = 'Ops! Parece que faltou informar quando você pretende ir embora.';
      return;
    }

    const client = getClient();
    if (!client) {
      showToast('O site ainda não está conectado ao banco de dados.', true);
      return;
    }

    setSubmitLoading(true);
    try {
      const { error } = await client.rpc('submit_rsvp', {
        p_phone: currentPhone,
        p_day_saturday: daySaturday,
        p_day_sunday: daySunday,
        p_day_monday: dayMonday,
        p_arrival_time: arrivalTime,
        p_departure_time: departureTime,
      });
      if (error) throw error;
      saveNote.hidden = false;
      showToast('Presença confirmada. Valeu!');
      loadSummary();
    } catch (err) {
      console.error(err);
      document.querySelector('[data-error-for="form"]').textContent = 'Ops! Algo deu errado ao salvar. Tente de novo em instantes.';
    } finally {
      setSubmitLoading(false);
    }
  }

  function setSubmitLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.querySelector('.btn-spinner').hidden = !isLoading;
    submitBtn.querySelector('.btn-label').textContent = isLoading ? 'Salvando...' : 'Confirmar presença';
  }

  let activeDayCell = null;

  async function onDayCellClick(btn) {
    const day = btn.dataset.day;
    const panel = $('#day-guests');

    if (activeDayCell === day) {
      panel.hidden = true;
      btn.classList.remove('is-active');
      activeDayCell = null;
      return;
    }

    $$('.summary-cell').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    activeDayCell = day;

    const client = getClient();
    if (!client) return;

    const dayLabel = { saturday: 'Sábado', sunday: 'Domingo', monday: 'Segunda' }[day];
    $('#day-guests-title').textContent = dayLabel;
    const list = $('#day-guests-list');
    list.innerHTML = '<li class="day-guests-empty">Carregando...</li>';
    panel.hidden = false;

    try {
      const { data, error } = await client.rpc('get_guests_by_day', { p_day: day });
      if (error) throw error;
      const guests = data || [];
      list.innerHTML = '';
      if (guests.length === 0) {
        list.innerHTML = '<li class="day-guests-empty">Ninguém confirmado ainda para esse dia.</li>';
        return;
      }
      guests.forEach((g) => {
        const li = document.createElement('li');
        li.textContent = `${g.name} — ${dayGuestLabel(g, day)}`;
        list.appendChild(li);
      });
    } catch (err) {
      console.error(err);
      list.innerHTML = '<li class="day-guests-empty">Ops! Não consegui carregar a lista agora.</li>';
    }
  }

  // Ordem cronológica dos dias do fim de semana, usada para achar o
  // primeiro e o último dia marcado por cada convidado.
  const DAY_ORDER = ['saturday', 'sunday', 'monday'];

  function formatTimeShort(timeStr) {
    if (!timeStr) return '';
    const [hh, mm] = timeStr.split(':');
    const hour = String(parseInt(hh, 10));
    return (mm === '30') ? `${hour}h30` : `${hour}h`;
  }

  function dayGuestLabel(guest, day) {
    const selected = DAY_ORDER.filter((d) => guest[`day_${d}`]);
    const firstDay = selected[0];
    const lastDay = selected[selected.length - 1];

    if (selected.length === 1 && day === firstDay) {
      const arr = formatTimeShort(guest.arrival_time);
      const dep = formatTimeShort(guest.departure_time);
      if (arr && dep) return `A partir de ${arr} / Até ${dep}`;
      if (arr) return `A partir de ${arr}`;
      if (dep) return `Até ${dep}`;
      return 'O dia todo';
    }
    if (day === firstDay) {
      const t = formatTimeShort(guest.arrival_time);
      return t ? `A partir de ${t}` : 'O dia todo';
    }
    if (day === lastDay) {
      const t = formatTimeShort(guest.departure_time);
      return t ? `Até ${t}` : 'O dia todo';
    }
    return 'O dia todo';
  }

  // ---------------------------------------------------------
  // SUMMARY (aggregate only, no names)
  // ---------------------------------------------------------
  async function loadSummary() {
    const client = getClient();
    if (!client) return;
    try {
      const { data, error } = await client.rpc('get_attendance_summary');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return;
      $('#summary-count').textContent = row.total || 0;
      $('#count-saturday').textContent = row.saturday || 0;
      $('#count-sunday').textContent = row.sunday || 0;
      $('#count-monday').textContent = row.monday || 0;
    } catch (err) {
      console.error(err);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

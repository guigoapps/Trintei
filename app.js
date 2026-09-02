(function () {
  'use strict';

  // ---------------------------------------------------------
  // CONFIG / CONSTANTS
  // ---------------------------------------------------------
  const DAYS = {
    saturday: { date: '2026-09-05', label: 'Sábado' },
    sunday: { date: '2026-09-06', label: 'Domingo' },
    monday: { date: '2026-09-07', label: 'Segunda' },
  };

  const STATUS_LABEL = {
    confirmed_weekend: 'Confirmado',
    confirmed_sunday_only: 'Confirmado',
    tbd: 'A confirmar',
  };

  const POLL_INTERVAL_MS = 30000;
  const EDIT_TOKEN_STORAGE_KEY = 'rsvp_edit_token';

  // ---------------------------------------------------------
  // SUPABASE CLIENT
  // ---------------------------------------------------------
  let supabase = null;
  function getClient() {
    if (supabase) return supabase;
    if (!window.supabase || !window.__SUPABASE_URL__ || !window.__SUPABASE_ANON_KEY__) {
      return null;
    }
    if (window.__SUPABASE_URL__.includes('COLE_SUA_URL_AQUI')) {
      return null;
    }
    supabase = window.supabase.createClient(window.__SUPABASE_URL__, window.__SUPABASE_ANON_KEY__);
    return supabase;
  }

  // ---------------------------------------------------------
  // DOM SHORTCUTS
  // ---------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const form = $('#rsvp-form');
  const formSection = $('#form-section');
  const confirmationSection = $('#confirmation-section');
  const submitBtn = $('#submit-btn');
  const editModeNote = $('#edit-mode-note');
  const toastEl = $('#toast');

  let editingToken = null; // set when the form is in "edit an existing response" mode

  // ---------------------------------------------------------
  // TIME OPTIONS (30-minute increments)
  // ---------------------------------------------------------
  function fillTimeSelect(selectEl, startHour, endHour) {
    const frag = document.createDocumentFragment();
    for (let h = startHour; h <= endHour; h++) {
      for (const m of [0, 30]) {
        if (h === endHour && m === 30) continue;
        const hh = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        const opt = document.createElement('option');
        opt.value = `${hh}:${mm}`;
        opt.textContent = `${hh}:${mm}`;
        frag.appendChild(opt);
      }
    }
    selectEl.appendChild(frag);
  }
  fillTimeSelect($('#f-arrival-time'), 12, 23);
  fillTimeSelect($('#f-departure-time'), 7, 20);

  // ---------------------------------------------------------
  // TOAST
  // ---------------------------------------------------------
  let toastTimer = null;
  function showToast(message, isError) {
    toastEl.textContent = message;
    toastEl.classList.toggle('is-error', !!isError);
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4000);
  }

  // ---------------------------------------------------------
  // VALIDATION
  // ---------------------------------------------------------
  function clearErrors() {
    $$('.field-error').forEach((el) => { el.textContent = ''; });
    $$('.has-error').forEach((el) => el.classList.remove('has-error'));
  }

  function setError(fieldName, message) {
    const el = document.querySelector(`[data-error-for="${fieldName}"]`);
    if (el) el.textContent = message;
    const input = form.querySelector(`[name="${fieldName}"]`);
    if (input) input.classList.add('has-error');
  }

  function validate(data) {
    clearErrors();
    let ok = true;

    if (!data.name || !data.name.trim()) {
      setError('name', 'Ops! Parece que faltou seu nome.');
      ok = false;
    }

    if (!data.attendance_status) {
      setError('attendance_status', 'Ops! Escolha uma das opções acima.');
      ok = false;
    }

    if (data.attendance_status && data.attendance_status !== 'tbd') {
      if (!data.arrival_time) {
        setError('form', 'Ops! Parece que faltou informar quando você pretende chegar.');
        ok = false;
      }
      if (!data.departure_time) {
        setError('form', 'Ops! Parece que faltou informar quando você pretende ir embora.');
        ok = false;
      }
      if (ok && data.arrival_date > data.departure_date) {
        setError('form', 'Ops! A data de saída não pode ser antes da data de chegada.');
        ok = false;
      }
    }

    return ok;
  }

  // ---------------------------------------------------------
  // FORM SUBMIT
  // ---------------------------------------------------------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const client = getClient();
    if (!client) {
      showToast('O site ainda não está conectado ao banco de dados. Veja o README para configurar o Supabase.', true);
      return;
    }

    const raw = new FormData(form);
    const isTbd = raw.get('attendance_status') === 'tbd';
    const data = {
      name: (raw.get('name') || '').toString(),
      attendance_status: raw.get('attendance_status'),
      arrival_date: raw.get('arrival_date'),
      arrival_time: isTbd ? null : raw.get('arrival_time'),
      departure_date: raw.get('departure_date'),
      departure_time: isTbd ? null : raw.get('departure_time'),
    };
    if (isTbd) {
      data.arrival_date = raw.get('arrival_time') ? raw.get('arrival_date') : null;
      data.departure_date = raw.get('departure_time') ? raw.get('departure_date') : null;
    }

    if (!validate(data)) return;

    setLoading(true);
    try {
      let result;
      if (editingToken) {
        result = await client.rpc('update_guest_by_token', {
          p_edit_token: editingToken,
          p_name: data.name,
          p_attendance_status: data.attendance_status,
          p_arrival_date: data.arrival_date,
          p_arrival_time: data.arrival_time,
          p_departure_date: data.departure_date,
          p_departure_time: data.departure_time,
        });
        if (result.error) throw result.error;
        showConfirmation(data, editingToken);
      } else {
        result = await client.rpc('create_guest', {
          p_name: data.name,
          p_attendance_status: data.attendance_status,
          p_arrival_date: data.arrival_date,
          p_arrival_time: data.arrival_time,
          p_departure_date: data.departure_date,
          p_departure_time: data.departure_time,
        });
        if (result.error) throw result.error;
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        const token = row && row.edit_token;
        if (token) localStorage.setItem(EDIT_TOKEN_STORAGE_KEY, token);
        showConfirmation(data, token);
      }
      loadGuests();
    } catch (err) {
      console.error(err);
      showToast('Ops! Algo deu errado ao salvar sua presença. Tente de novo em instantes.', true);
    } finally {
      setLoading(false);
    }
  });

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.querySelector('.btn-spinner').hidden = !isLoading;
    submitBtn.querySelector('.btn-label').textContent = isLoading ? 'Salvando...' : (editingToken ? 'Salvar alterações' : 'Confirmar presença');
  }

  // ---------------------------------------------------------
  // CONFIRMATION SCREEN
  // ---------------------------------------------------------
  function formatDay(dateStr) {
    if (!dateStr) return '';
    const map = { '2026-09-05': 'Sábado', '2026-09-06': 'Domingo', '2026-09-07': 'Segunda' };
    return map[dateStr] || dateStr;
  }

  function showConfirmation(data, token) {
    formSection.hidden = true;
    confirmationSection.hidden = false;
    confirmationSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const isTbd = data.attendance_status === 'tbd';
    $('#confirmation-message').textContent = isTbd
      ? 'Anotamos seu nome! Quando tiver certeza, é só atualizar sua resposta. ❤️'
      : 'Agora já sabemos quando você pretende chegar. ❤️';

    $('#confirm-arrival').textContent = (!isTbd && data.arrival_date && data.arrival_time)
      ? `${formatDay(data.arrival_date)} • ${data.arrival_time}`
      : 'A confirmar';
    $('#confirm-departure').textContent = (!isTbd && data.departure_date && data.departure_time)
      ? `${formatDay(data.departure_date)} • ${data.departure_time}`
      : 'A confirmar';

    const editUrl = new URL(window.location.href);
    editUrl.hash = '';
    editUrl.search = '';
    if (token) editUrl.searchParams.set('edit', token);
    $('#edit-link-input').value = editUrl.toString();

    editingToken = token || editingToken;
  }

  $('#copy-link-btn').addEventListener('click', async () => {
    const input = $('#edit-link-input');
    input.select();
    try {
      await navigator.clipboard.writeText(input.value);
      showToast('Link copiado! ❤️');
    } catch {
      showToast('Não consegui copiar automaticamente — selecione e copie manualmente.', true);
    }
  });

  $('#edit-response-btn').addEventListener('click', () => {
    confirmationSection.hidden = true;
    formSection.hidden = false;
    formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---------------------------------------------------------
  // EDIT MODE VIA ?edit=TOKEN
  // ---------------------------------------------------------
  async function checkForEditLink() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('edit');
    if (!token) return;

    const client = getClient();
    if (!client) return;

    try {
      const { data, error } = await client.rpc('get_guest_by_token', { p_edit_token: token });
      if (error) throw error;
      const guest = Array.isArray(data) ? data[0] : data;
      if (!guest) {
        showToast('Não encontramos uma resposta para esse link.', true);
        return;
      }
      editingToken = token;
      prefillForm(guest);
      editModeNote.hidden = false;
      setLoading(false);
    } catch (err) {
      console.error(err);
      showToast('Não foi possível carregar sua resposta anterior.', true);
    }
  }

  function prefillForm(guest) {
    form.elements['name'].value = guest.name || '';
    const radio = form.querySelector(`[name="attendance_status"][value="${guest.attendance_status}"]`);
    if (radio) radio.checked = true;
    if (guest.arrival_date) form.elements['arrival_date'].value = guest.arrival_date;
    if (guest.arrival_time) form.elements['arrival_time'].value = guest.arrival_time.slice(0, 5);
    if (guest.departure_date) form.elements['departure_date'].value = guest.departure_date;
    if (guest.departure_time) form.elements['departure_time'].value = guest.departure_time.slice(0, 5);
  }

  // ---------------------------------------------------------
  // GUEST LIST / SUMMARY / TRACKLIST / DAY VIEW
  // ---------------------------------------------------------
  let allGuests = [];
  let activeDayFilter = 'all';
  let activeStatusFilter = 'all';

  async function loadGuests() {
    const client = getClient();
    if (!client) return;
    try {
      const { data, error } = await client
        .from('guests_public')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      allGuests = data || [];
      renderAll();
    } catch (err) {
      console.error(err);
    }
  }

  function isPresentOnDay(guest, dateStr) {
    if (!guest.arrival_date || !guest.departure_date) return false;
    return guest.arrival_date <= dateStr && guest.departure_date >= dateStr;
  }

  function renderAll() {
    renderSummary();
    renderHotelNow();
    renderTracklist();
    renderDayView();
  }

  function renderSummary() {
    $('#summary-count').textContent = allGuests.length;
    Object.entries(DAYS).forEach(([key, day]) => {
      const count = allGuests.filter((g) => isPresentOnDay(g, day.date)).length;
      $(`#count-${key}`).textContent = count;
    });
  }

  function renderHotelNow() {
    const container = $('#hotel-now-content');
    container.innerHTML = '';
    let any = false;

    Object.values(DAYS).forEach((day) => {
      const already = allGuests.filter((g) => g.arrival_date && g.arrival_date < day.date && g.departure_date && g.departure_date >= day.date).length;
      const arriving = allGuests.filter((g) => g.arrival_date === day.date).length;
      if (already === 0 && arriving === 0) return;
      any = true;
      const p1 = document.createElement('p');
      p1.innerHTML = `<strong>${day.label}</strong>`;
      container.appendChild(p1);
      if (already > 0) {
        const p = document.createElement('p');
        p.textContent = `${already} ${already === 1 ? 'pessoa já estará' : 'pessoas já estarão'} no hotel pela manhã`;
        container.appendChild(p);
      }
      if (arriving > 0) {
        const p = document.createElement('p');
        p.textContent = `${arriving} ${arriving === 1 ? 'chega' : 'chegam'} ao longo do dia`;
        container.appendChild(p);
      }
    });

    $('#hotel-now').hidden = !any;
  }

  function renderTracklist() {
    const container = $('#tracklist');
    const emptyState = $('#list-empty');

    const filtered = allGuests.filter((g) => {
      if (activeStatusFilter === 'confirmed' && g.attendance_status === 'tbd') return false;
      if (activeStatusFilter === 'tbd' && g.attendance_status !== 'tbd') return false;
      if (activeDayFilter !== 'all' && !isPresentOnDay(g, activeDayFilter)) return false;
      return true;
    });

    container.querySelectorAll('.track').forEach((el) => el.remove());

    if (filtered.length === 0) {
      emptyState.hidden = false;
      emptyState.textContent = allGuests.length === 0
        ? 'Ninguém confirmou presença ainda. Seja a primeira faixa do álbum!'
        : 'Nenhuma faixa encontrada com esse filtro.';
      return;
    }
    emptyState.hidden = true;

    filtered.forEach((g, i) => {
      const track = document.createElement('article');
      track.className = 'track';

      const num = document.createElement('span');
      num.className = 'track-num';
      num.textContent = `FAIXA ${String(i + 1).padStart(2, '0')}`;

      const body = document.createElement('div');
      body.className = 'track-body';

      const name = document.createElement('p');
      name.className = 'track-name';
      name.textContent = `👤 ${g.name}`;

      const times = document.createElement('p');
      times.className = 'track-times';
      if (g.attendance_status === 'tbd' && !g.arrival_date) {
        times.textContent = 'A confirmar';
      } else {
        const arr = g.arrival_date ? `${formatDay(g.arrival_date)} • ${(g.arrival_time || '').slice(0, 5)}` : 'A confirmar';
        const dep = g.departure_date ? `${formatDay(g.departure_date)} • ${(g.departure_time || '').slice(0, 5)}` : 'A confirmar';
        times.textContent = `${arr} → ${dep}`;
      }

      body.appendChild(name);
      body.appendChild(times);

      const status = document.createElement('span');
      status.className = `track-status ${g.attendance_status === 'tbd' ? 'tbd' : 'confirmed'}`;
      status.textContent = STATUS_LABEL[g.attendance_status] || 'A confirmar';

      track.appendChild(num);
      track.appendChild(body);
      track.appendChild(status);
      container.appendChild(track);
    });
  }

  function renderDayView() {
    Object.entries(DAYS).forEach(([key, day]) => {
      const list = $(`#day-list-${key}`);
      list.innerHTML = '';
      const present = allGuests
        .filter((g) => isPresentOnDay(g, day.date))
        .sort((a, b) => {
          const aArriving = a.arrival_date === day.date;
          const bArriving = b.arrival_date === day.date;
          if (aArriving === bArriving) return (a.arrival_time || '').localeCompare(b.arrival_time || '');
          return aArriving ? 1 : -1; // already-there guests first
        });

      if (present.length === 0) {
        const li = document.createElement('li');
        li.className = 'day-empty';
        li.textContent = 'Ninguém ainda';
        list.appendChild(li);
        return;
      }

      present.forEach((g) => {
        const li = document.createElement('li');
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `👤 ${g.name}`;
        const timeSpan = document.createElement('span');
        timeSpan.textContent = g.arrival_date === day.date
          ? (g.arrival_time || '').slice(0, 5)
          : 'já estará';
        li.appendChild(nameSpan);
        li.appendChild(timeSpan);
        list.appendChild(li);
      });
    });
  }

  // ---------------------------------------------------------
  // FILTERS
  // ---------------------------------------------------------
  $$('.filter-chip[data-filter-day]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeDayFilter = btn.dataset.filterDay;
      $$('.filter-chip[data-filter-day]').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderTracklist();
    });
  });

  $$('.filter-chip[data-filter-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeStatusFilter = btn.dataset.filterStatus;
      $$('.filter-chip[data-filter-status]').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderTracklist();
    });
  });

  // ---------------------------------------------------------
  // INIT
  // ---------------------------------------------------------
  async function init() {
    if (!getClient()) {
      showToast('O site ainda não está conectado ao banco de dados. Veja o README para configurar o Supabase.', true);
    }
    await checkForEditLink();
    await loadGuests();
    setInterval(loadGuests, POLL_INTERVAL_MS);
  }

  window.addEventListener('DOMContentLoaded', init);
})();

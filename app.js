// ===================== Общие утилиты =====================
const STATUS_LABELS = {
  todo: 'Цель',
  in_progress: 'В процессе',
  partial: 'Частично выполнено',
  done: 'Полностью выполнено',
  failed: 'Не выполнено',
};

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }
function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function uid() { return 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

// ===================== Прямая работа с Google Apps Script (без сервера) =====================
// Сайт полностью статический: HTML/CSS/JS без сборки и без бэкенда.
// Работает одинаково, если открыть файл напрямую (file://), через Live Server/любой статический
// хостинг или через GitHub Pages — всё общение с Google Таблицей идёт прямо из браузера.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxWfmzfLxqiD80L34ZOMKLumH6M4j9oty4j7WPIKW8Yn3NGlIei-HximbXGMbWUMc_F/exec';

function asGet(params) {
  const url = new URL(APPS_SCRIPT_URL);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  return fetch(url.toString()).then((r) => r.json());
}
function asPost(payload) {
  // Content-Type: text/plain — чтобы браузер не слал CORS preflight (Apps Script его не обрабатывает).
  // Apps Script всё равно читает e.postData.contents и парсит как JSON — тип содержимого ему не важен.
  return fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(payload),
  }).then((r) => r.json());
}

// ===================== Кастомный dropdown (замена нативного <select>) =====================
function initDropdown(rootId, onChange) {
  const root = document.getElementById(rootId);
  const toggle = root.querySelector('.dropdown-toggle');
  const valueEl = root.querySelector('.dropdown-value');
  const options = Array.from(root.querySelectorAll('.dropdown-option'));

  function close() { root.classList.remove('open'); }
  function open() {
    $all('.dropdown.open').forEach((d) => { if (d !== root) d.classList.remove('open'); });
    root.classList.add('open');
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    root.classList.contains('open') ? close() : open();
  });
  options.forEach((opt) => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      options.forEach((o) => o.classList.remove('active'));
      opt.classList.add('active');
      valueEl.textContent = opt.textContent;
      close();
      if (onChange) onChange(opt.dataset.value);
    });
  });

  return {
    get value() {
      const active = options.find((o) => o.classList.contains('active'));
      return active ? active.dataset.value : null;
    },
    set(value) {
      const opt = options.find((o) => o.dataset.value === value);
      if (!opt) return;
      options.forEach((o) => o.classList.remove('active'));
      opt.classList.add('active');
      valueEl.textContent = opt.textContent;
    },
  };
}
// Закрываем любой открытый dropdown при клике снаружи или на Escape
document.addEventListener('click', () => $all('.dropdown.open').forEach((d) => d.classList.remove('open')));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $all('.dropdown.open').forEach((d) => d.classList.remove('open'));
});

// ===================== Тема (тёмная / светлая) =====================
const THEME_KEY = 'gm_theme';
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}
(function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(saved);
})();
function updateThemeButtons() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  $all('.theme-opt').forEach((b) => b.classList.toggle('active', b.dataset.theme === current));
}
$all('.theme-opt').forEach((btn) => {
  btn.addEventListener('click', () => {
    applyTheme(btn.dataset.theme);
    updateThemeButtons();
  });
});

// ===================== Табы =====================
$all('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $all('.tab-btn').forEach((b) => b.classList.remove('active'));
    $all('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $('#tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ===================== Модалки =====================
function openModal(name) {
  $('#' + name + 'ModalOverlay').classList.add('open');
}
function closeModal(name) {
  $('#' + name + 'ModalOverlay').classList.remove('open');
}
$all('.js-close-modal').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});
$all('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $all('.modal-overlay.open').forEach((o) => o.classList.remove('open'));
});

$('#openAddModalBtn').addEventListener('click', () => openModal('add'));
$('#fabAdd').addEventListener('click', () => openModal('add'));

// ===================== Ключ ИИ — OpenRouter (хранится только в этом браузере) =====================
// OpenRouter даёт бесплатные модели без привязки карты и, в отличие от Google/Gemini,
// поддерживает прямые запросы из браузера (CORS) — то, что нужно для полностью статического сайта.
const GEMINI_KEY_STORAGE = 'gm_openrouter_key';
const AI_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
function getGeminiKey() { return localStorage.getItem(GEMINI_KEY_STORAGE) || ''; }

$('#settingsBtn').addEventListener('click', () => {
  updateThemeButtons();
  $('#s-current-password').style.display = authState.passwordSet ? 'block' : 'none';
  $('#s-current-password').value = '';
  $('#s-new-password').value = '';
  $('#s-new-password-confirm').value = '';
  $('#passwordError').style.display = 'none';
  $('#passwordSaved').style.display = 'none';
  $('#s-gemini-key').value = getGeminiKey();
  $('#geminiKeySaved').style.display = 'none';
  openModal('settings');
});

$('#saveGeminiKeyBtn').addEventListener('click', () => {
  const val = $('#s-gemini-key').value.trim();
  if (val) localStorage.setItem(GEMINI_KEY_STORAGE, val);
  else localStorage.removeItem(GEMINI_KEY_STORAGE);
  loadStatus();
  const okEl = $('#geminiKeySaved');
  okEl.style.display = 'block';
  setTimeout(() => (okEl.style.display = 'none'), 2500);
});

// ===================== Вход по паролю (гейт интерфейса, соль/хэш сверяются через Apps Script) =====================
// Важно: это UI-уровневая защита от случайного просмотра, а не серверная security-граница —
// сайт полностью статический, отдельного бэкенда, который мог бы реально скрыть данные, нет.
async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const SESSION_KEY = 'gm_session_expiry';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

let authSalt = null;
let authState = { passwordSet: false, authenticated: true };

async function checkAuthStatus() {
  try {
    const r = await asGet({ type: 'settings' });
    const passwordSet = !!(r && r.data && r.data.passwordSet);
    authSalt = (r && r.data && r.data.authSalt) || null;
    const expiry = Number(localStorage.getItem(SESSION_KEY) || 0);
    const authenticated = !passwordSet || Date.now() < expiry;
    authState = { ok: true, passwordSet, authenticated };
  } catch (e) {
    authState = { ok: false, passwordSet: false, authenticated: true };
  }
  return authState;
}
function markSessionActive() {
  localStorage.setItem(SESSION_KEY, String(Date.now() + SESSION_TTL_MS));
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function showLock() {
  $('#lockOverlay').classList.add('open');
  setTimeout(() => $('#lockPassword') && $('#lockPassword').focus(), 50);
}
function hideLock() {
  $('#lockOverlay').classList.remove('open');
}

$('#lockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#lockError');
  errEl.style.display = 'none';
  const password = $('#lockPassword').value;
  try {
    if (!authSalt) await checkAuthStatus();
    const hash = await sha256Hex((authSalt || '') + ':' + password);
    const r = await asPost({ action: 'checkPassword', hash });
    if (r && r.match) {
      markSessionActive();
      $('#lockPassword').value = '';
      authState.authenticated = true;
      hideLock();
      startApp();
    } else {
      errEl.textContent = 'Неверный пароль';
      errEl.style.display = 'block';
    }
  } catch (err) {
    errEl.textContent = 'Нет связи с Google Таблицей';
    errEl.style.display = 'block';
  }
});

$('#savePasswordBtn').addEventListener('click', async () => {
  const errEl = $('#passwordError');
  const okEl = $('#passwordSaved');
  errEl.style.display = 'none';
  okEl.style.display = 'none';
  const currentPassword = $('#s-current-password').value;
  const newPassword = $('#s-new-password').value;
  const confirmPassword = $('#s-new-password-confirm').value;
  if (newPassword.trim().length < 4) {
    errEl.textContent = 'Пароль должен быть не короче 4 символов';
    errEl.style.display = 'block';
    return;
  }
  if (newPassword !== confirmPassword) {
    errEl.textContent = 'Пароли не совпадают';
    errEl.style.display = 'block';
    return;
  }
  try {
    if (!authSalt) await checkAuthStatus();
    if (authState.passwordSet) {
      const curHash = await sha256Hex((authSalt || '') + ':' + currentPassword);
      const check = await asPost({ action: 'checkPassword', hash: curHash });
      if (!check || !check.match) {
        errEl.textContent = 'Текущий пароль указан неверно';
        errEl.style.display = 'block';
        return;
      }
    }
    const newHash = await sha256Hex((authSalt || '') + ':' + newPassword);
    await asPost({ action: 'setPassword', hash: newHash });
    authState.passwordSet = true;
    authState.authenticated = true;
    markSessionActive();
    $('#s-current-password').style.display = 'block';
    $('#s-current-password').value = '';
    $('#s-new-password').value = '';
    $('#s-new-password-confirm').value = '';
    okEl.style.display = 'block';
    setTimeout(() => (okEl.style.display = 'none'), 3000);
  } catch (e) {
    errEl.textContent = 'Нет связи с Google Таблицей';
    errEl.style.display = 'block';
  }
});

$('#logoutBtn').addEventListener('click', () => {
  clearSession();
  authState.authenticated = false;
  closeModal('settings');
  showLock();
});

// ===================== Статус ИИ =====================
function loadStatus() {
  const pill = $('#statusPill');
  const hasKey = !!getGeminiKey();
  if (hasKey) {
    pill.textContent = 'ИИ подключен';
    pill.className = 'status-pill ok';
  } else {
    pill.textContent = 'ИИ: нужен ключ';
    pill.className = 'status-pill warn';
  }
  const notice = $('#aiNotice');
  if (notice) {
    notice.textContent = hasKey
      ? 'ИИ подключен через OpenRouter. Можешь запускать анализ.'
      : 'ИИ ещё не настроен: добавь бесплатный ключ OpenRouter в Настройках (шестерёнка справа вверху). Ключ хранится только в этом браузере.';
  }
}

// ===================== ЦЕЛИ: локальный кэш + фоновая синхронизация =====================
const GOALS_CACHE_KEY = 'gm_goals_cache_v1';
const SYNC_INTERVAL_MS = 20000;

function loadGoalsCache() {
  try { return JSON.parse(localStorage.getItem(GOALS_CACHE_KEY)) || []; } catch (e) { return []; }
}
function saveGoalsCache(goals) {
  localStorage.setItem(GOALS_CACHE_KEY, JSON.stringify(goals));
}

let allGoals = loadGoalsCache();
let editingId = null; // если открыта модалка редактирования — не перерисовываем поверх

async function syncGoalsFromServer() {
  try {
    const r = await asGet({ type: 'goals' });
    if (r && r.ok) {
      const fresh = r.data || [];
      const changed = JSON.stringify(fresh) !== JSON.stringify(allGoals);
      allGoals = fresh;
      saveGoalsCache(fresh);
      if (!editingId) renderGoals();
      return changed;
    }
  } catch (e) {
    // нет связи — молча остаёмся на локальном кэше
  }
  return false;
}

function scheduleBackgroundSync() {
  setInterval(() => syncGoalsFromServer(), SYNC_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncGoalsFromServer();
  });
  window.addEventListener('focus', () => syncGoalsFromServer());
}

// ===================== Рендер целей =====================
const BUCKETS = [
  { key: 'active', label: 'Цели на год', match: (s) => s !== 'done' && s !== 'partial' && s !== 'failed' },
  { key: 'partial', label: 'Частично выполнено', match: (s) => s === 'partial' },
  { key: 'done', label: 'Полностью выполнено', match: (s) => s === 'done' },
  { key: 'failed', label: 'Не выполнено', match: (s) => s === 'failed' },
];

// ===================== Умный анализатор: статистика + прогноз =====================
function daysInYear(y) {
  return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365;
}
function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d - start) / 86400000) + 1;
}

function computeGoalStats() {
  const total = allGoals.length;
  const done = allGoals.filter((g) => g.status === 'done').length;
  const partial = allGoals.filter((g) => g.status === 'partial').length;
  const failed = allGoals.filter((g) => g.status === 'failed').length;
  const active = total - done - partial - failed; // todo + in_progress

  const donePct = total ? Math.round((done / total) * 100) : 0;

  // Прогноз: только по целям текущего года, по текущему темпу выполнения экстраполируем на весь год.
  const now = new Date();
  const year = now.getFullYear();
  const yearGoals = allGoals.filter((g) => Number(g.year) === year);
  const yearTotal = yearGoals.length;
  const yearDone = yearGoals.filter((g) => g.status === 'done').length;
  const yearWeighted = yearGoals.reduce((sum, g) => {
    if (g.status === 'done') return sum + 1;
    if (g.status === 'partial') return sum + (Number(g.progress) || 50) / 100;
    return sum;
  }, 0);

  const elapsedFraction = Math.min(1, dayOfYear(now) / daysInYear(year));
  let forecastPct = 0;
  if (yearTotal > 0 && elapsedFraction > 0.02) {
    const pace = yearWeighted / yearTotal / elapsedFraction; // текущий темп относительно прошедшей доли года
    forecastPct = Math.max(0, Math.min(100, Math.round(pace * 100)));
  }
  const forecastCount = yearTotal ? Math.round((forecastPct / 100) * yearTotal) : 0;

  return { total, done, partial, active, failed, donePct, year, yearTotal, yearDone, forecastPct, forecastCount, elapsedFraction };
}

function statRingSvg(pct) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
  return `<svg viewBox="0 0 100 100" class="stat-ring">
    <defs>
      <linearGradient id="goalRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="var(--accent)"/>
        <stop offset="100%" stop-color="var(--accent-2)"/>
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="${r}" class="stat-ring-track"></circle>
    <circle cx="50" cy="50" r="${r}" class="stat-ring-fill" stroke-dasharray="${c}" stroke-dashoffset="${offset}"></circle>
  </svg>`;
}

function renderStats() {
  const box = $('#goalStats');
  if (!box) return;
  if (!allGoals.length) {
    box.innerHTML = '';
    return;
  }
  const s = computeGoalStats();

  const forecastNote = s.yearTotal === 0
    ? `Нет целей на ${s.year} год ещё.`
    : s.elapsedFraction < 0.03
      ? 'Год только начался — рано строить прогноз.'
      : s.forecastPct >= 100
        ? `Отличный темп — на пути закрыть все ${s.yearTotal} целей ${s.year} года.`
        : s.forecastPct >= 70
          ? `Хороший темп — на конец года ожидается ~${s.forecastCount} из ${s.yearTotal} целей.`
          : `Темп ниже среднего — по нему выйдет ~${s.forecastCount} из ${s.yearTotal} целей к концу года.`;

  box.innerHTML = `
    <div class="stat-card">
      <div class="stat-ring-block">
        <div class="stat-ring-wrap">
          ${statRingSvg(s.donePct)}
          <div class="stat-ring-center">${s.donePct}%</div>
        </div>
        <div class="stat-ring-cap">целей выполнено</div>
      </div>
      <div class="stat-grid">
        <div class="stat-item"><span class="stat-num">${s.total}</span><span class="stat-lbl">всего целей</span></div>
        <div class="stat-item"><span class="stat-num stat-done">${s.done}</span><span class="stat-lbl">полностью</span></div>
        <div class="stat-item"><span class="stat-num stat-partial">${s.partial}</span><span class="stat-lbl">частично</span></div>
        <div class="stat-item"><span class="stat-num stat-active">${s.active}</span><span class="stat-lbl">в работе</span></div>
        <div class="stat-item"><span class="stat-num stat-failed">${s.failed}</span><span class="stat-lbl">не выполнено</span></div>
      </div>
      <div class="stat-forecast">
        <div class="stat-forecast-head">
          <svg class="icon" viewBox="0 0 24 24" fill="none"><path d="M3 17l6-6 4 4 8-8M21 7v6M21 7h-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Прогноз на ${s.year} год
        </div>
        <p class="muted small">${forecastNote}</p>
      </div>
    </div>`;
}

function renderGoals() {
  renderStats();
  const box = $('#goalGroups');
  const filter = filterStatusDropdown.value;
  const filtered = filter === 'all' ? allGoals : allGoals.filter((g) => (g.status || 'todo') === filter);

  if (!filtered.length) {
    box.innerHTML = '<p class="muted">Пока пусто. Нажми «Добавить цель», чтобы начать.</p>';
    return;
  }

  const buckets = BUCKETS.map((b) => ({ ...b, items: filtered.filter((g) => b.match(g.status || 'todo')) }));

  box.innerHTML = buckets
    .filter((b) => b.items.length)
    .map((b) => {
      const items = b.items.map((g) => goalItemHtml(g)).join('');
      return `
        <div class="goal-group">
          <h3><span class="dot dot-${b.key}"></span> ${b.label} <span class="count">${b.items.length}</span></h3>
          <div class="goal-grid">${items}</div>
        </div>`;
    })
    .join('');

  $all('.goal-item').forEach((el) => {
    const id = el.dataset.id;
    el.querySelector('.check-circle').addEventListener('click', (e) => {
      e.stopPropagation();
      const goal = allGoals.find((g) => g.id === id);
      if (!goal) return;
      const isDone = goal.status === 'done';
      applyGoalUpdate(id, { status: isDone ? 'in_progress' : 'done', progress: isDone ? goal.progress || 50 : 100 });
    });
    el.querySelector('.js-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Удалить эту цель?')) applyGoalDelete(id);
    });
    el.addEventListener('click', () => openEditModal(id));
  });
}

function goalItemHtml(g) {
  const progress = Number(g.progress) || 0;
  const isDone = g.status === 'done';
  return `
    <div class="goal-item ${isDone ? 'is-done' : ''}" data-id="${g.id}">
      <div class="goal-item-top">
        <button class="check-circle ${isDone ? 'checked' : ''}" title="Отметить выполненной">
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="goal-main">
          <div class="goal-title ${isDone ? 'done-text' : ''}">${escapeHtml(g.title)}</div>
          <div class="goal-meta">${escapeHtml(g.category || '—')} · ${escapeHtml(String(g.year || ''))}${g.tags ? ' · ' + escapeHtml(g.tags) : ''}</div>
          ${g.description ? `<div class="goal-desc">${escapeHtml(g.description)}</div>` : ''}
          <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
          ${g.comment ? `<div class="goal-comment-preview">${escapeHtml(g.comment)}</div>` : ''}
        </div>
        <button class="icon-btn js-delete" title="Удалить">
          <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>`;
}

// ===================== Оптимистичные операции (мгновенно локально, потом фоном в Таблицу) =====================
function applyGoalAdd(fields) {
  const optimistic = {
    id: uid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'todo',
    progress: 0,
    comment: '',
    ...fields,
  };
  allGoals = [optimistic, ...allGoals];
  saveGoalsCache(allGoals);
  renderGoals();

  asPost({ action: 'addGoal', ...fields })
    .then(() => syncGoalsFromServer())
    .catch(() => {});
}

function applyGoalUpdate(id, fields) {
  allGoals = allGoals.map((g) => (g.id === id ? { ...g, ...fields, updatedAt: new Date().toISOString() } : g));
  saveGoalsCache(allGoals);
  renderGoals();

  asPost({ action: 'updateGoal', id, ...fields }).catch(() => {});
}

function applyGoalDelete(id) {
  allGoals = allGoals.filter((g) => g.id !== id);
  saveGoalsCache(allGoals);
  renderGoals();

  asPost({ action: 'deleteGoal', id }).catch(() => {});
}

// ===================== Модалка добавления =====================
$('#goalForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#g-title').value.trim();
  if (!title) return;
  const fields = {
    title,
    description: $('#g-description').value.trim(),
    category: $('#g-category').value.trim(),
    year: $('#g-year').value,
    tags: $('#g-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
  };
  applyGoalAdd(fields);
  e.target.reset();
  $('#g-year').value = new Date().getFullYear();
  closeModal('add');
});

// ===================== Модалка редактирования прогресса =====================
const eProgress = $('#e-progress');
eProgress.addEventListener('input', () => {
  $('#e-progress-val').textContent = eProgress.value + '%';
});

function updateRolloverVisibility() {
  $('#editRolloverBtn').style.display = eStatusDropdown.value === 'failed' ? 'flex' : 'none';
}

const eStatusDropdown = initDropdown('eStatusDropdown', (value) => {
  if (value === 'done') {
    eProgress.value = 100;
    $('#e-progress-val').textContent = '100%';
  }
  updateRolloverVisibility();
});

function openEditModal(id) {
  const goal = allGoals.find((g) => g.id === id);
  if (!goal) return;
  editingId = id;
  $('#editGoalTitle').textContent = goal.title;
  $('#editGoalMeta').textContent = [goal.category, goal.year].filter(Boolean).join(' · ') || '—';
  eStatusDropdown.set(goal.status || 'todo');
  eProgress.value = Number(goal.progress) || 0;
  $('#e-progress-val').textContent = (Number(goal.progress) || 0) + '%';
  $('#e-comment').value = goal.comment || '';
  updateRolloverVisibility();
  openModal('edit');
}

$('#editSaveBtn').addEventListener('click', () => {
  if (!editingId) return;
  applyGoalUpdate(editingId, {
    status: eStatusDropdown.value,
    progress: Number(eProgress.value),
    comment: $('#e-comment').value.trim(),
  });
  editingId = null;
  closeModal('edit');
});

$('#editRolloverBtn').addEventListener('click', () => {
  if (!editingId) return;
  const goal = allGoals.find((g) => g.id === editingId);
  const nextYear = (Number(goal && goal.year) || new Date().getFullYear()) + 1;
  applyGoalUpdate(editingId, { status: 'todo', progress: 0, year: nextYear });
  editingId = null;
  closeModal('edit');
});

$('#editDeleteBtn').addEventListener('click', () => {
  if (!editingId) return;
  if (confirm('Удалить эту цель?')) {
    applyGoalDelete(editingId);
    editingId = null;
    closeModal('edit');
  }
});

$('#addModalOverlay').addEventListener('click', () => {});
$('#editModalOverlay').addEventListener('transitionend', () => {});
// Сбрасываем editingId, если модалку закрыли крестиком/оверлеем/Esc
['editModalOverlay'].forEach((id) => {
  $('#' + id).addEventListener('click', (e) => {
    if (e.target.id === id || e.target.closest('.js-close-modal')) editingId = null;
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') editingId = null;
});

const filterStatusDropdown = initDropdown('filterStatusDropdown', () => renderGoals());
$('#refreshGoals').addEventListener('click', () => syncGoalsFromServer());

// ===================== НАСТРОЕНИЕ =====================
['m-mood', 'm-energy', 'm-sleep'].forEach((id) => {
  const el = $('#' + id);
  el.addEventListener('input', () => {
    $('#' + id + '-val').textContent = el.value;
  });
});

const selectedMoodTags = new Set();
$all('#moodTags .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    chip.classList.toggle('active');
    const tag = chip.dataset.tag;
    if (selectedMoodTags.has(tag)) selectedMoodTags.delete(tag);
    else selectedMoodTags.add(tag);
  });
});

$('#moodForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    moodScore: Number($('#m-mood').value),
    energy: Number($('#m-energy').value),
    sleep: Number($('#m-sleep').value),
    tags: Array.from(selectedMoodTags),
    note: $('#m-note').value.trim(),
  };
  asPost({ action: 'addMood', ...payload }).catch(() => {});

  e.target.reset();
  $('#m-mood-val').textContent = 5;
  $('#m-energy-val').textContent = 5;
  $('#m-sleep-val').textContent = 5;
  selectedMoodTags.clear();
  $all('#moodTags .chip').forEach((c) => c.classList.remove('active'));

  const conf = $('#moodSaved');
  conf.style.display = 'block';
  setTimeout(() => (conf.style.display = 'none'), 4000);
});

// ===================== Фильтры по датам (используются и для графика, и для ИИ-анализа) =====================
function filterByDate(items, dateField, from, to) {
  if (!from && !to) return items;
  const fromTime = from ? new Date(from).getTime() : -Infinity;
  const toTime = to ? new Date(to).getTime() : Infinity;
  return items.filter((item) => {
    const raw = item[dateField];
    if (!raw) return false;
    const t = new Date(raw).getTime();
    return t >= fromTime && t <= toTime;
  });
}
function filterByMonths(items, dateField, months) {
  if (!months || !months.length) return items;
  const monthSet = new Set(months);
  return items.filter((item) => {
    const raw = item[dateField];
    if (!raw) return false;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return false;
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    return monthSet.has(key);
  });
}
function summarizeByMonth(items, dateField) {
  const counts = {};
  items.forEach((item) => {
    const raw = item[dateField];
    if (!raw) return;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return;
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.keys(counts)
    .sort()
    .map((month) => ({ month, count: counts[month] }));
}

// ===================== Промпты для ИИ-анализа (OpenRouter) =====================
// Данные о настроении никогда не показываются напрямую пользователю в интерфейсе — только через выжимку ИИ.
const AI_STATUS_TEXT = {
  todo: 'цель поставлена, ещё не начата',
  in_progress: 'в процессе выполнения',
  partial: 'частично выполнена',
  done: 'полностью выполнена',
  failed: 'не выполнена в этом периоде (кандидат на перенос на следующий год)',
};

function fmtGoalsForPrompt(goals) {
  if (!goals.length) return 'За выбранный период целей нет.';
  return goals
    .map((g, i) => {
      const statusText = AI_STATUS_TEXT[g.status] || g.status || 'не начато';
      return `${i + 1}. «${g.title || ''}» — статус: ${statusText} (категория: ${g.category || '—'}, год цели: ${
        g.year || '—'
      }, прогресс: ${g.progress || 0}%)\n   Создана: ${g.createdAt || '—'}, последнее изменение: ${g.updatedAt || '—'}\n   Описание: ${
        g.description || '—'
      }\n   Комментарий пользователя: ${g.comment || '—'}`;
    })
    .join('\n');
}
function fmtMoodForPrompt(entries) {
  if (!entries.length) return 'За выбранный период записей о состоянии нет.';
  return entries
    .map((m) => {
      return `- ${m.timestamp}: настроение ${m.moodScore || '—'}/10, энергия ${m.energy || '—'}/10, сон ${
        m.sleep || '—'
      }/10, теги: ${m.tags || '—'}. Заметка: ${m.note || '—'}`;
    })
    .join('\n');
}
function fmtPeriodForPrompt(period) {
  if (!period) return 'весь период наблюдений';
  const { periodLabel, from, to } = period;
  let text = periodLabel || 'выбранный период';
  if (from || to) {
    text += ` (с ${from ? new Date(from).toLocaleDateString('ru-RU') : 'начала записей'} по ${
      to ? new Date(to).toLocaleDateString('ru-RU') : 'сегодня'
    })`;
  }
  return text;
}

const AI_BASE_PERSONA = `Ты — тёплый, внимательный и честный личный ИИ-помощник по саморазвитию для пользователя Влада.
Ты помогаешь ему отслеживать цели/мечты на год и своё внутреннее состояние (настроение, энергию, самочувствие) во времени.
Твой тон: поддерживающий, но не приторный; конкретный, без воды и клише; ты не психотерапевт и не даёшь медицинских советов.
Ты всегда опираешься только на данные, которые тебе передали — не выдумывай факты и не додумывай то, чего нет в данных.
Важно: пользователь сам выбрал период и тип анализа перед отправкой запроса — учитывай это как осознанный выбор с конкретной целью
(например, если это конец года — вероятно, хочет подвести итоги; если начало года — вероятно, планирует; если конкретный месяц —
скорее всего вспоминает именно тот отрезок времени). Явно ориентируйся на даты записей, чтобы понимать, какой это период и почему
пользователь мог обратиться именно к нему.`;

function moodAnalysisPrompt(entries, userMessage, period) {
  return `${AI_BASE_PERSONA}

ПЕРИОД АНАЛИЗА: ${fmtPeriodForPrompt(period)}. Ниже приведены ТОЛЬКО записи из этого периода, отсортированные по времени —
самая старая запись отражает состояние "было", самая новая — "стало":
${fmtMoodForPrompt(entries)}

Комментарий/контекст от пользователя (может быть пустым, тогда ориентируйся только на данные): "${userMessage || '—'}"

Задача: сделай выжимку "было → стало" именно за указанный период. Ответь по структуре:
1. Что изменилось за этот период (кратко, по фактам из данных, с опорой на конкретные даты/тренды).
2. Что стало лучше / легче.
3. Что всё ещё беспокоит или не решено.
4. Один конкретный, поддерживающий вывод или мягкая рекомендация с учётом периода (без давления, без "просто думай позитивно").
Пиши на русском, живым языком, 150-250 слов, без списков markdown со звёздочками — обычным текстом с абзацами.`;
}

function goalsAnalysisPrompt(goals, userMessage, period) {
  return `${AI_BASE_PERSONA}

ПЕРИОД АНАЛИЗА: ${fmtPeriodForPrompt(period)}. Ниже список целей/мечт, созданных или обновлённых в этот период, с их статусами и комментариями:
${fmtGoalsForPrompt(goals)}

Статусы целей означают: "todo" — цель только поставлена; "in_progress" — в процессе; "partial" — частично выполнена;
"done" — полностью выполнена; "failed" — не выполнена в этом периоде и является кандидатом на перенос на следующий год.

Комментарий/контекст от пользователя (может быть пустым): "${userMessage || '—'}"

Задача:
1. Раздели цели на группы по статусу и дай короткий комментарий по каждой группе с опорой на прогресс/комментарии пользователя.
2. Отдельно отметь цели со статусом "failed" — предложи, стоит ли переносить их на следующий год или отпустить.
3. Отметь, если какая-то цель "зависла" без изменений долго (updatedAt близко к createdAt при низком прогрессе) — мягко обрати внимание.
4. Заверши коротким мотивирующим, но честным выводом с учётом периода — без пустых похвал.
Пиши на русском, структурированно, но без markdown-разметки со звёздочками (обычные абзацы и подзаголовки текстом).`;
}

// ===================== Прямой вызов ИИ через OpenRouter (ключ хранится только в этом браузере) =====================
async function callGeminiDirect(prompt) {
  const key = getGeminiKey();
  if (!key) {
    return {
      ok: false,
      needsKey: true,
      error: 'ИИ пока не настроен. Добавь свой бесплатный ключ OpenRouter в Настройках (шестерёнка справа вверху).',
    };
  }
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
      }),
    }).then((x) => x.json());
    const text = r && r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
    if (text) {
      return { ok: true, text };
    }
    return { ok: false, error: (r && r.error && r.error.message) || 'Ошибка ответа от ИИ' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ===================== ИИ: тип анализа + период (график) + запрос =====================
const MONTH_NAMES_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

let aiKind = 'goals'; // 'goals' | 'mood'
let aiRange = { from: null, to: null, label: 'всё время' };
let aiChartData = [];
let selectedMonths = new Set(); // многовыборный набор месяцев 'YYYY-M', выбранных кликом по столбикам графика

function monthKeyLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return MONTH_NAMES_NOM[m - 1] + ' ' + y;
}

function setAiLoading(msg) {
  const box = $('#aiResult');
  box.className = 'ai-result loading';
  box.textContent = msg || 'Думаю…';
}
function setAiResult(text) {
  const box = $('#aiResult');
  box.className = 'ai-result';
  box.textContent = text;
}

$all('.ai-type-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $all('.ai-type-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    aiKind = btn.dataset.kind;
    loadAiChart();
  });
});

$all('.ai-period-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $all('.ai-period-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMonths.clear(); // быстрые пресеты сбрасывают точечный выбор месяцев на графике
    const now = new Date();
    if (btn.dataset.range === 'all') {
      aiRange = { from: null, to: null, label: 'всё время' };
    } else if (btn.dataset.range === 'month') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      aiRange = { from: from.toISOString(), to: now.toISOString(), label: 'текущий месяц (' + MONTH_NAMES_NOM[now.getMonth()] + ' ' + now.getFullYear() + ')' };
    } else if (btn.dataset.range === 'year') {
      const from = new Date(now.getFullYear(), 0, 1);
      aiRange = { from: from.toISOString(), to: now.toISOString(), label: 'текущий год (' + now.getFullYear() + ')' };
    }
    updateAiPeriodLabel();
    highlightChartBar();
  });
});

function updateAiPeriodLabel() {
  if (selectedMonths.size) {
    const labels = Array.from(selectedMonths).sort().map(monthKeyLabel);
    $('#aiPeriodLabel').textContent = 'Период: ' + labels.join(', ') + (labels.length > 1 ? ` (${labels.length} мес.)` : '');
  } else {
    $('#aiPeriodLabel').textContent = 'Период: ' + aiRange.label;
  }
}

function renderAiChart() {
  const box = $('#aiChart');
  if (!aiChartData.length) {
    box.innerHTML = '<p class="muted small">Пока нет данных за какой-либо период.</p>';
    return;
  }
  const max = Math.max(...aiChartData.map((d) => d.count));
  box.innerHTML = `<div class="chart-bars">${aiChartData
    .map((d) => {
      const [y, m] = d.month.split('-').map(Number);
      const h = Math.max(6, Math.round((d.count / max) * 64));
      return `<button type="button" class="chart-bar" data-month="${d.month}" title="${MONTH_NAMES_NOM[m - 1]} ${y}: ${d.count}">
        <span class="chart-bar-fill" style="height:${h}px"></span>
        <span class="chart-bar-label">${MONTH_NAMES_NOM[m - 1].slice(0, 3)}</span>
      </button>`;
    })
    .join('')}</div>`;

  $all('.chart-bar').forEach((bar) => {
    bar.addEventListener('click', () => {
      const key = bar.dataset.month;
      // Клик по столбику переключает его в/из выборки — можно выбрать сразу несколько месяцев.
      if (selectedMonths.has(key)) selectedMonths.delete(key);
      else selectedMonths.add(key);
      $all('.ai-period-btn').forEach((b) => b.classList.remove('active'));
      updateAiPeriodLabel();
      highlightChartBar();
    });
  });
  highlightChartBar();
}

function highlightChartBar() {
  $all('.chart-bar').forEach((bar) => {
    bar.classList.toggle('active', selectedMonths.has(bar.dataset.month));
  });
}

async function loadAiChart() {
  const box = $('#aiChart');
  box.innerHTML = '<p class="muted small">Загрузка графика…</p>';
  try {
    if (aiKind === 'goals') {
      // Считаем по локально кэшированным целям — они и так видны пользователю.
      const counts = {};
      allGoals.forEach((g) => {
        if (!g.createdAt) return;
        const d = new Date(g.createdAt);
        if (isNaN(d.getTime())) return;
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        counts[key] = (counts[key] || 0) + 1;
      });
      aiChartData = Object.keys(counts).sort().map((month) => ({ month, count: counts[month] }));
    } else {
      const r = await asGet({ type: 'mood' });
      const entries = (r && r.data) || [];
      aiChartData = summarizeByMonth(entries, 'timestamp');
    }
  } catch (e) {
    aiChartData = [];
  }
  renderAiChart();
}

async function callAi(userMessage) {
  setAiLoading();
  try {
    const isGoals = aiKind === 'goals';
    const r = isGoals ? await asGet({ type: 'goals' }) : await asGet({ type: 'mood' });
    const all = (r && r.data) || [];
    const dateField = isGoals ? 'createdAt' : 'timestamp';
    let filtered;
    let period;
    if (selectedMonths.size) {
      const months = Array.from(selectedMonths).sort();
      filtered = filterByMonths(all, dateField, months);
      period = { periodLabel: months.map(monthKeyLabel).join(', ') };
    } else {
      filtered = filterByDate(all, dateField, aiRange.from, aiRange.to);
      period = { periodLabel: aiRange.label, from: aiRange.from, to: aiRange.to };
    }
    const prompt = isGoals
      ? goalsAnalysisPrompt(filtered, userMessage || '', period)
      : moodAnalysisPrompt(filtered, userMessage || '', period);
    const result = await callGeminiDirect(prompt);
    if (result.ok) setAiResult(result.text);
    else setAiResult(result.error || 'Не удалось получить ответ от ИИ.');
  } catch (e) {
    setAiResult('Ошибка запроса: ' + e.message);
  }
}

$('#btnAskAi').addEventListener('click', () => {
  const text = $('#ai-input').value.trim();
  callAi(text);
});

// ===================== Инициализация =====================
function startApp() {
  $('#g-year').value = new Date().getFullYear();
  renderGoals(); // мгновенно из кэша
  loadStatus();
  updateAiPeriodLabel();
  loadAiChart();
  syncGoalsFromServer().then(() => {
    if (aiKind === 'goals') loadAiChart();
  }); // затем свежие данные из Таблицы в фоне
  scheduleBackgroundSync();
}

(async function initAuthGate() {
  await checkAuthStatus();
  if (authState.passwordSet && !authState.authenticated) {
    showLock();
  } else {
    startApp();
  }
})();

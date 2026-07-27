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
$('#themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
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

// ===================== Статус ИИ / таблицы =====================
async function loadStatus() {
  const pill = $('#statusPill');
  try {
    const r = await fetch('/api/status').then((x) => x.json());
    if (r.aiConfigured) {
      pill.textContent = 'ИИ подключен';
      pill.className = 'status-pill ok';
    } else {
      pill.textContent = 'ИИ: нужен ключ';
      pill.className = 'status-pill warn';
    }
    const notice = $('#aiNotice');
    if (notice) {
      notice.textContent = r.aiConfigured
        ? 'ИИ подключен через Google Gemini. Можешь запускать анализ.'
        : 'ИИ ещё не настроен: добавь бесплатный ключ Google Gemini в файл config.json (поле geminiApiKey) и перезапусти сервер. Данные уже сохраняются и будут доступны для анализа сразу после подключения ключа.';
    }
  } catch (e) {
    pill.textContent = 'Нет связи с сервером';
    pill.className = 'status-pill warn';
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

// Синхронизация идёт молча в фоне — никаких надписей "обновлено HH:MM" в интерфейсе.
function setSyncHint() {}

async function syncGoalsFromServer() {
  try {
    const r = await fetch('/api/goals').then((x) => x.json());
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
  setInterval(() => syncGoalsFromServer(false), SYNC_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncGoalsFromServer(false);
  });
  window.addEventListener('focus', () => syncGoalsFromServer(false));
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

// ===================== Оптимистичные операции (мгновенно локально, потом фоном на сервер) =====================
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

  fetch('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add', ...fields }),
  })
    .then((r) => r.json())
    .then(() => syncGoalsFromServer(false))
    .catch(() => setSyncHint('Не удалось сохранить — попробуй обновить'));
}

function applyGoalUpdate(id, fields) {
  allGoals = allGoals.map((g) => (g.id === id ? { ...g, ...fields, updatedAt: new Date().toISOString() } : g));
  saveGoalsCache(allGoals);
  renderGoals();

  fetch('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'update', id, ...fields }),
  }).catch(() => setSyncHint('Не удалось сохранить — попробуй обновить'));
}

function applyGoalDelete(id) {
  allGoals = allGoals.filter((g) => g.id !== id);
  saveGoalsCache(allGoals);
  renderGoals();

  fetch('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', id }),
  }).catch(() => setSyncHint('Не удалось сохранить — попробуй обновить'));
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
$('#refreshGoals').addEventListener('click', () => syncGoalsFromServer(true));

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
  fetch('/api/mood', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});

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

// ===================== ИИ: тип анализа + период (график) + запрос =====================
const MONTH_NAMES = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
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

function monthRangeFromKey(key) {
  const [y, m] = key.split('-').map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 0, 23, 59, 59);
  return { from: from.toISOString(), to: to.toISOString() };
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
      const r = await fetch('/api/mood/summary').then((x) => x.json());
      aiChartData = (r && r.data) || [];
    }
  } catch (e) {
    aiChartData = [];
  }
  renderAiChart();
}

async function callAi(userMessage) {
  setAiLoading();
  const endpoint = aiKind === 'goals' ? '/api/ai/goals-analysis' : '/api/ai/mood-analysis';
  const payload = { userMessage: userMessage || '' };
  if (selectedMonths.size) {
    const months = Array.from(selectedMonths).sort();
    payload.months = months;
    payload.periodLabel = months.map(monthKeyLabel).join(', ');
  } else {
    payload.from = aiRange.from;
    payload.to = aiRange.to;
    payload.periodLabel = aiRange.label;
  }
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((x) => x.json());
    if (r.ok) setAiResult(r.text);
    else setAiResult(r.error || 'Не удалось получить ответ от ИИ.');
  } catch (e) {
    setAiResult('Ошибка запроса к серверу: ' + e.message);
  }
}

$('#btnAskAi').addEventListener('click', () => {
  const text = $('#ai-input').value.trim();
  callAi(text);
});

// ===================== Инициализация =====================
$('#g-year').value = new Date().getFullYear();
renderGoals(); // мгновенно из кэша
loadStatus();
updateAiPeriodLabel();
loadAiChart();
syncGoalsFromServer(true).then(() => {
  if (aiKind === 'goals') loadAiChart();
}); // затем свежие данные с сервера в фоне
scheduleBackgroundSync();

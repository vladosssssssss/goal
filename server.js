// Локальный сервер сайта "Цели / Настроение". Без внешних зависимостей — только встроенный Node.js.
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { URL } = require('url');

function getLanIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

const CONFIG_PATH = path.join(__dirname, 'config.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('Не удалось прочитать config.json:', e.message);
    return { sheetWebAppUrl: '', geminiApiKey: '', geminiModel: 'gemini-2.0-flash', port: 3838 };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ===================== Пароль / сессии (простая защита входа на сайт) =====================
// Соль хранится локально в config.json — генерируется один раз при первой установке пароля.
function ensureAuthSalt(cfg) {
  if (!cfg.authSalt) {
    cfg.authSalt = crypto.randomBytes(16).toString('hex');
    saveConfig(cfg);
  }
  return cfg.authSalt;
}
function hashPassword(cfg, password) {
  const salt = ensureAuthSalt(cfg);
  return crypto.createHash('sha256').update(salt + ':' + String(password)).digest('hex');
}

const sessions = new Map(); // token -> время истечения (мс)
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней
function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}
function isValidSession(token) {
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    sessions.delete(token);
    return false;
  }
  return true;
}
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}
function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `gm_session=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Lax`
  );
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'gm_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}

// Кэшируем "пароль установлен?" в памяти, чтобы не дёргать Google Apps Script на каждый запрос.
let passwordSetCache = null;
async function getPasswordSet(cfg) {
  if (passwordSetCache !== null) return passwordSetCache;
  const data = await sheetGet(cfg, { type: 'settings' });
  passwordSetCache = !!(data && data.data && data.data.passwordSet);
  return passwordSetCache;
}
async function checkAuthorized(req, cfg) {
  const passwordSet = await getPasswordSet(cfg);
  if (!passwordSet) return true; // пароль ещё не настроен — доступ открыт
  const cookies = parseCookies(req);
  return isValidSession(cookies.gm_session);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Прокси-запрос к веб-приложению Google Apps Script (GET с query-параметрами)
function sheetGet(cfg, params) {
  return new Promise((resolve, reject) => {
    const url = new URL(cfg.sheetWebAppUrl);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
        let data = '';
        r.on('data', (c) => (data += c));
        r.on('end', () => {
          // Google Apps Script делает редирект (302) на googleusercontent для отдачи содержимого
          if (r.statusCode === 302 || r.statusCode === 301) {
            https.get(r.headers.location, (r2) => {
              let d2 = '';
              r2.on('data', (c) => (d2 += c));
              r2.on('end', () => resolve(safeParse(d2)));
              r2.on('error', reject);
            }).on('error', reject);
          } else {
            resolve(safeParse(data));
          }
        });
      })
      .on('error', reject);
  });
}

function sheetPost(cfg, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(cfg.sheetWebAppUrl);
    const body = JSON.stringify(payload);
    const opts = {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'Mozilla/5.0',
      },
    };
    const doReq = (targetUrl, isRedirectFollow) => {
      const req = https.request(targetUrl, isRedirectFollow ? { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } } : opts, (r) => {
        let data = '';
        r.on('data', (c) => (data += c));
        r.on('end', () => {
          if ((r.statusCode === 302 || r.statusCode === 301) && r.headers.location) {
            doReq(new URL(r.headers.location), true);
          } else {
            resolve(safeParse(data));
          }
        });
      });
      req.on('error', reject);
      if (!isRedirectFollow) req.write(body);
      req.end();
    };
    doReq(url, false);
  });
}

// Группировка записей по месяцу (YYYY-MM) для графика в ИИ-вкладке — отдаём только количество, без содержимого.
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

// Фильтр записей по диапазону дат [from, to] (ISO-строки). Если from/to не заданы — вернуть всё.
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

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'Некорректный ответ от Google Apps Script', raw: text.slice(0, 500) };
  }
}

// Вызов Gemini API
function callGemini(cfg, prompt) {
  return new Promise((resolve, reject) => {
    if (!cfg.geminiApiKey) {
      resolve({
        ok: false,
        needsKey: true,
        error:
          'ИИ пока не настроен. Добавь свой бесплатный ключ Google Gemini в config.json (поле geminiApiKey), затем перезапусти сервер.',
      });
      return;
    }
    const model = cfg.geminiModel || 'gemini-2.0-flash';
    const url = new URL(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.geminiApiKey}`
    );
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    });
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (r) => {
        let data = '';
        r.on('data', (c) => (data += c));
        r.on('end', () => {
          const parsed = safeParse(data);
          if (parsed && parsed.candidates && parsed.candidates[0]) {
            const text = parsed.candidates[0].content.parts.map((p) => p.text).join('\n');
            resolve({ ok: true, text });
          } else {
            resolve({ ok: false, error: 'Ошибка ответа Gemini', raw: parsed });
          }
        });
      }
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.write(body);
    req.end();
  });
}

const PROMPTS = require('./prompts.js');

const server = http.createServer(async (req, res) => {
  // CORS открыт полностью — чтобы можно было спокойно работать локально
  // (открывать фронтенд с другого порта/инструмента и всё равно достучаться до API).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const cfg = loadConfig();
  const parsed = new URL(req.url, 'http://localhost');
  const pathname = parsed.pathname;

  try {
    // ---- Защита паролем: гейт для всех /api/* кроме /api/auth/* и /api/status ----
    const isAuthRoute = pathname.startsWith('/api/auth/');
    if (pathname.startsWith('/api/') && !isAuthRoute && pathname !== '/api/status') {
      const authorized = await checkAuthorized(req, cfg);
      if (!authorized) {
        return sendJson(res, 401, { ok: false, error: 'Нужен пароль для доступа', needsAuth: true });
      }
    }

    // ---- Auth: статус / вход / смена пароля / выход ----
    if (pathname === '/api/auth/status' && req.method === 'GET') {
      const passwordSet = await getPasswordSet(cfg);
      const cookies = parseCookies(req);
      const authenticated = !passwordSet || isValidSession(cookies.gm_session);
      return sendJson(res, 200, { ok: true, passwordSet, authenticated });
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const hash = hashPassword(cfg, body.password || '');
      const check = await sheetPost(cfg, { action: 'checkPassword', hash });
      if (check && check.match) {
        const token = createSession();
        setSessionCookie(res, token);
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 401, { ok: false, error: 'Неверный пароль' });
    }

    if (pathname === '/api/auth/set-password' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const passwordSet = await getPasswordSet(cfg);
      if (passwordSet) {
        const currentHash = hashPassword(cfg, body.currentPassword || '');
        const check = await sheetPost(cfg, { action: 'checkPassword', hash: currentHash });
        if (!check || !check.match) {
          return sendJson(res, 401, { ok: false, error: 'Текущий пароль указан неверно' });
        }
      }
      if (!body.newPassword || String(body.newPassword).trim().length < 4) {
        return sendJson(res, 400, { ok: false, error: 'Пароль слишком короткий (минимум 4 символа)' });
      }
      const newHash = hashPassword(cfg, body.newPassword);
      await sheetPost(cfg, { action: 'setPassword', hash: newHash });
      passwordSetCache = true;
      const token = createSession();
      setSessionCookie(res, token);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const cookies = parseCookies(req);
      if (cookies.gm_session) sessions.delete(cookies.gm_session);
      clearSessionCookie(res);
      return sendJson(res, 200, { ok: true });
    }

    // ---- API: Цели ----
    if (pathname === '/api/goals' && req.method === 'GET') {
      const data = await sheetGet(cfg, { type: 'goals' });
      return sendJson(res, 200, data);
    }
    if (pathname === '/api/goals' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const action = body.action === 'update' ? 'updateGoal' : body.action === 'delete' ? 'deleteGoal' : 'addGoal';
      const data = await sheetPost(cfg, { ...body, action });
      return sendJson(res, 200, data);
    }

    // ---- API: Настроение / состояние (пишется в таблицу, пользователю не показывается) ----
    if (pathname === '/api/mood' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const data = await sheetPost(cfg, { ...body, action: 'addMood' });
      return sendJson(res, 200, data);
    }

    // ---- Сводка по месяцам (для графика в ИИ-вкладке). Настроение отдаётся ТОЛЬКО как счётчики — без содержимого. ----
    if (pathname === '/api/mood/summary' && req.method === 'GET') {
      const moodData = await sheetGet(cfg, { type: 'mood' });
      const entries = (moodData && moodData.data) || [];
      return sendJson(res, 200, { ok: true, data: summarizeByMonth(entries, 'timestamp') });
    }
    if (pathname === '/api/goals/summary' && req.method === 'GET') {
      const goalsData = await sheetGet(cfg, { type: 'goals' });
      const goals = (goalsData && goalsData.data) || [];
      return sendJson(res, 200, { ok: true, data: summarizeByMonth(goals, 'createdAt') });
    }

    // ---- ИИ-анализ настроения (с фильтром по периоду: диапазон дат ИЛИ список конкретных месяцев) ----
    if (pathname === '/api/ai/mood-analysis' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const moodData = await sheetGet(cfg, { type: 'mood' });
      const all = (moodData && moodData.data) || [];
      const entries = body.months && body.months.length
        ? filterByMonths(all, 'timestamp', body.months)
        : filterByDate(all, 'timestamp', body.from, body.to);
      const prompt = PROMPTS.moodAnalysisPrompt(entries, body.userMessage || '', {
        periodLabel: body.periodLabel || 'всё время',
        from: body.from,
        to: body.to,
      });
      const result = await callGemini(cfg, prompt);
      return sendJson(res, 200, result);
    }

    // ---- ИИ-анализ целей (с фильтром по периоду: диапазон дат ИЛИ список конкретных месяцев) ----
    if (pathname === '/api/ai/goals-analysis' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const goalsData = await sheetGet(cfg, { type: 'goals' });
      const all = (goalsData && goalsData.data) || [];
      const goals = body.months && body.months.length
        ? filterByMonths(all, 'createdAt', body.months)
        : filterByDate(all, 'createdAt', body.from, body.to);
      const prompt = PROMPTS.goalsAnalysisPrompt(goals, body.userMessage || '', {
        periodLabel: body.periodLabel || 'всё время',
        from: body.from,
        to: body.to,
      });
      const result = await callGemini(cfg, prompt);
      return sendJson(res, 200, result);
    }

    // ---- ИИ: свободный запрос (объединяет цели + настроение) ----
    if (pathname === '/api/ai/free' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const [goalsData, moodData] = await Promise.all([
        sheetGet(cfg, { type: 'goals' }),
        sheetGet(cfg, { type: 'mood' }),
      ]);
      const prompt = PROMPTS.freeformPrompt(
        (goalsData && goalsData.data) || [],
        (moodData && moodData.data) || [],
        body.userMessage || ''
      );
      const result = await callGemini(cfg, prompt);
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/status' && req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        sheetConfigured: !!cfg.sheetWebAppUrl,
        aiConfigured: !!cfg.geminiApiKey,
      });
    }

    // ---- Статика ----
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(PUBLIC_DIR, filePath);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<h1>404 — файл не найден</h1>');
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(content);
    });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { ok: false, error: String(err) });
  }
});

const cfg = loadConfig();
const PORT = cfg.port || 3838;
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('========================================');
  console.log('  Сайт "Цели / Настроение" запущен!');
  console.log('  На этом компьютере: http://localhost:' + PORT);
  const ips = getLanIps();
  if (ips.length) {
    console.log('  С телефона (та же Wi-Fi сеть):');
    ips.forEach((ip) => console.log('    http://' + ip + ':' + PORT));
  }
  console.log('========================================');
  console.log('');
});

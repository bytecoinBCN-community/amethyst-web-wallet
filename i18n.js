// Interface languages. Texts live in lang/<code>.txt ("key = text" lines, the same format as BCN Wallet for Windows).
// index.html keeps the English text in place, so the page reads fine before (or without) a language file.
// Plain ES2017 on purpose: it runs in SeaMonkey and other old engines (no ?., ??, replaceAll, fromEntries).
'use strict';
const LANGS = {
  en: 'English', uk: 'Українська', es: 'Español', pt: 'Português',
  tr: 'Türkçe', id: 'Bahasa Indonesia', vi: 'Tiếng Việt', zh: '中文',
};
const LOCALES = { en: 'en-US', uk: 'uk-UA', es: 'es-ES', pt: 'pt-BR', tr: 'tr-TR', id: 'id-ID', vi: 'vi-VN', zh: 'zh-CN' };
const LANG_KEY = 'aww-lang';
let LANG = 'en', LOCALE = 'en-US', STRINGS = {}, EN_STRINGS = {};

function pickLang() {
  let saved = null;
  try { saved = localStorage.getItem(LANG_KEY); } catch (e) { /* private mode */ }
  if (saved && LANGS[saved]) return saved;
  const wanted = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
  for (let i = 0; i < wanted.length; i++) {
    let code = String(wanted[i]).toLowerCase().split('-')[0];
    if (code === 'in') code = 'id';  // old code for Indonesian
    if (LANGS[code]) return code;
  }
  return 'en';
}

function parseLang(text) {
  const out = {};
  text.split(/\r?\n/).forEach(function (line) {
    if (!line.trim() || line.trim().charAt(0) === '#') return;
    const eq = line.indexOf(' = ');
    if (eq < 0) return;
    out[line.slice(0, eq).trim()] = line.slice(eq + 3).replace(/\\n/g, '\n');
  });
  return out;
}

function loadLang(code) {
  // no-cache: never an old text from the HTTP cache after an update (a cheap 304 otherwise)
  return fetch('lang/' + code + '.txt', { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }).then(parseLang);
}

// t('send.short', {n: 6}) → text of the current language, English if missing, the key itself as a last resort.
function t(key, vars) {
  let s = STRINGS[key] !== undefined ? STRINGS[key] : EN_STRINGS[key] !== undefined ? EN_STRINGS[key] : key;
  if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(String(vars[k])); });
  return s;
}

// data-i18n → text, data-i18n-placeholder → placeholder, data-i18n-title → title (never HTML).
function applyLang(root) {
  const scope = root || document;
  const map = [['data-i18n', 'textContent'], ['data-i18n-placeholder', 'placeholder'], ['data-i18n-title', 'title']];
  map.forEach(function (m) {
    const nodes = scope.querySelectorAll('[' + m[0] + ']');
    for (let i = 0; i < nodes.length; i++) {
      const key = nodes[i].getAttribute(m[0]);
      if (STRINGS[key] !== undefined || EN_STRINGS[key] !== undefined) nodes[i][m[1]] = t(key);
    }
  });
  document.documentElement.lang = LANG;
}

// Loads English (fallback for missing keys) and the chosen language; never fails, at worst stays English.
function setLang(code) {
  LANG = LANGS[code] ? code : 'en';
  LOCALE = LOCALES[LANG];
  const en = Object.keys(EN_STRINGS).length ? Promise.resolve(EN_STRINGS) : loadLang('en').catch(function () { return {}; });
  return en.then(function (e) {
    EN_STRINGS = e;
    return LANG === 'en' ? e : loadLang(LANG).catch(function () { return {}; });
  }).then(function (s) {
    STRINGS = s;
    applyLang();
  });
}

const I18N_READY = setLang(pickLang());

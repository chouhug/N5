/* 資料與複習規則（所有語言頁共用）
   日文頁（index.html）和語言頁（lang-app.js）寫的是同一份進度 n5:progress，
   所以作答怎麼算、複習間隔、備份碼、合併紀錄一定要一模一樣：全部放在這裡，只改一個地方。
   這個檔在 <head> 載入（sync.js 後面），裡面的東西都是全域的，頁面直接用。

   紀錄 rec：{ s:'new'|'queued'|'learned'|'excluded', n:作答次數, w:{mc,fill,kana,dict} 1＝錯題／2＝以前錯過,
              lv:複習等級, due:到期日, st:連續答對（假名）, t:最後修改時間, q:開始學的時間, rv:{模式:上次錯題複習時間}, dd:今天做過到期複習 }
   source：'learn'（學習中／待考）| 'wrong'（錯題）| 'review'（錯題複習）| 'due'（到期複習）| 'learned'（複習已學會）| 'all' */
'use strict';

// ---- 日期 ----
function ymd(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
const today = () => ymd();
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n, 12);
  return ymd(dt);
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---- 進度規則 ----
// 複習間隔（天）；7 天以上加 ±15% 隨機，同一天學的字之後才不會全部擠在同一天到期
const SRS = [1, 3, 7, 14, 30, 60];
const spread = n => n < 7 ? n : Math.max(1, n + Math.round((Math.random() * 0.3 - 0.15) * n));
function blankRec() { return { s: 'new', n: 0, w: {}, lv: 0, due: '', st: 0, t: 0 }; }
// 只有填空（日文還有五十音）答對才算學會；到期複習答對才延長間隔；學會的字答錯降兩級
function applyAnswer(rec, mode, correct, source, today, now) {
  rec = JSON.parse(JSON.stringify(rec || blankRec()));
  rec.w = rec.w || {};
  rec.n = (rec.n || 0) + 1;
  rec.t = now;
  // w：1＝錯題（現在還不會）、2＝以前錯過（錯題複習會輪流抽）
  // 答錯 → 錯題；在任何地方答對一次 → 離開錯題，留在錯題複習；錯題複習答錯 → 回到錯題
  const w = rec.w[mode] || 0;
  if (!correct) rec.w[mode] = 1;
  else if (w === 1) rec.w[mode] = 2;
  if (!rec.w[mode]) delete rec.w[mode];
  if (source === 'review') { rec.rv = rec.rv || {}; rec.rv[mode] = now; }   // 上次在錯題複習出現的時間，用來輪流抽
  if (source === 'due') rec.dd = today;                                    // 今天做過到期複習（算每日上限）

  const learn = () => { rec.s = 'learned'; rec.lv = 0; rec.due = addDays(today, SRS[0]); };
  // 學會的字答錯：降兩級（不是直接打回第一級），避免複習量一下子爆掉
  const reset = () => { rec.lv = Math.max(0, (rec.lv || 0) - 2); rec.due = addDays(today, SRS[rec.lv]); };

  if (mode === 'fill') {
    if (correct) {
      if (rec.s === 'learned') {
        if (source === 'due' && rec.due && rec.due <= today) { rec.lv = Math.min((rec.lv || 0) + 1, SRS.length - 1); rec.due = addDays(today, spread(SRS[rec.lv])); }
      } else if (rec.s !== 'excluded') learn();
    } else if (rec.s === 'learned') reset();
  }
  if (mode === 'kana') {
    if (correct) {
      rec.st = (rec.st || 0) + 1;
      if (rec.s === 'learned') {
        if (source === 'due' && rec.due && rec.due <= today) { rec.lv = Math.min((rec.lv || 0) + 1, SRS.length - 1); rec.due = addDays(today, spread(SRS[rec.lv])); }
      } else if (rec.st >= 2 || source === 'review') learn();
    } else {
      rec.st = 0;
      if (rec.s === 'learned') reset();
    }
  }
  return rec;
}

// ---- 出題：先錯題，再作答次數少的，同分隨機；選好再打亂 ----
// randomOnly（錯題複習）：照上次在錯題複習出現的時間由舊到新輪流抽
function pickRound(items, getRec, mode, size, randomOnly) {
  if (randomOnly) {
    const last = it => (((getRec(it.id) || {}).rv) || {})[mode] || 0;
    return shuffle(shuffle(items).sort((a, b) => last(a) - last(b)).slice(0, size));
  }
  const scored = items.map(it => { const r = getRec(it.id) || blankRec(); return { it, wrong: (r.w && r.w[mode]) ? 0 : 1, n: r.n || 0, rnd: Math.random() }; });
  scored.sort((a, b) => a.wrong - b.wrong || a.n - b.n || a.rnd - b.rnd);
  return shuffle(scored.slice(0, size).map(x => x.it));
}

// ---- 合併兩份進度（每個字留修改時間比較新的那筆；每日題數見 sync.js 的 SyncDays）----
function mergeState(a, b) {
  const out = { items: {}, days: {} };
  const ia = (a && a.items) || {}, ib = (b && b.items) || {};
  for (const id of new Set([...Object.keys(ia), ...Object.keys(ib)])) {
    const x = ia[id], y = ib[id];
    out.items[id] = !x ? y : !y ? x : ((y.t || 0) > (x.t || 0) ? y : x);
  }
  return SyncDays.merge(out, a, b);   // 每日題數：各裝置加總（sync.js）
}

// ---- 精簡備份碼 ----
// 格式：N5.<最近7天題數>~<紀錄;紀錄;...>，日文頁和語言頁同一種格式，同一串碼兩邊都能匯入（各自只取自己的字）
// 每筆紀錄：<4碼代號><狀態>,<作答次數>,<錯題>,<等級>,<到期日>,<連對>,<修改時間>（尾端空欄省略，數字用 36 進位）
const PACK_EPOCH = Date.UTC(2026, 0, 1);
const ST2C = { new: 'n', queued: 'q', learned: 'l', excluded: 'x' }, C2ST = { n: 'new', q: 'queued', l: 'learned', x: 'excluded' };
function shortKey(id) {
  let h = 0x811c9dc5;
  for (const ch of id) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h % 1679616).toString(36).padStart(4, '0');
}
function dayNum(d) { const [y, m, dd] = d.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, dd) - PACK_EPOCH) / 864e5); }
function numDay(n) { const d = new Date(PACK_EPOCH + n * 864e5); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
function packState(st, todayStr) {
  const b36 = n => (n ? Math.max(0, Math.round(n)).toString(36) : '');
  const days = Object.keys(st.days || {}).filter(d => d > addDays(todayStr, -7) && st.days[d] > 0).sort()
    .map(d => b36(dayNum(d)) + ':' + b36(st.days[d])).join(',');
  const recs = [];
  for (const id in st.items || {}) {
    const r = st.items[id]; if (!r) continue;
    const w = r.w || {};
    const blank = (r.s || 'new') === 'new' && !r.n && !w.mc && !w.fill && !w.kana;
    if (blank && !r.t) continue;
    const wc = (w.mc || 0) + 3 * (w.fill || 0) + 9 * (w.kana || 0);
    const f = [b36(r.n), wc ? wc.toString(36) : '', b36(r.lv), r.due ? b36(dayNum(r.due) + 1) : '', b36(r.st), b36((r.t || 0) - PACK_EPOCH > 0 ? ((r.t - PACK_EPOCH) / 6e4) : 0), b36((r.q || 0) - PACK_EPOCH > 0 ? ((r.q - PACK_EPOCH) / 6e4) : 0)];
    while (f.length && f[f.length - 1] === '') f.pop();
    recs.push(shortKey(id) + (ST2C[r.s] || 'n') + f.join(','));
  }
  return 'N5.' + days + '~' + recs.join(';');
}
function unpackState(code, allIds) {
  code = String(code).replace(/\s+/g, '');
  const m = code.match(/^N5\.([^~]*)~(.*)$/);
  if (!m) return null;
  const byKey = {}; for (const id of allIds) byKey[shortKey(id)] = id;
  const p = x => (x ? parseInt(x, 36) : 0);
  const days = {};
  if (m[1]) for (const part of m[1].split(',')) { const [d, n] = part.split(':'); days[numDay(p(d))] = p(n); }
  const items = {}; let unknown = 0;
  if (m[2]) for (const rec of m[2].split(';')) {
    const id = byKey[rec.slice(0, 4)];
    if (!id || !C2ST[rec[4]]) { unknown++; continue; }
    const [n, wc, lv, due, st, t, q] = rec.slice(5).split(',');
    const wv = p(wc), w = {};
    if (wv % 3) w.mc = wv % 3; if (Math.floor(wv / 3) % 3) w.fill = Math.floor(wv / 3) % 3; if (Math.floor(wv / 9) % 3) w.kana = Math.floor(wv / 9) % 3;
    items[id] = { s: C2ST[rec[4]], n: p(n), w, lv: p(lv), due: due ? numDay(p(due) - 1) : '', st: p(st), t: t ? PACK_EPOCH + p(t) * 6e4 : 0 };
    if (q) items[id].q = PACK_EPOCH + p(q) * 6e4;
  }
  return { items, days, unknown };
}
// 備份碼太長時用 deflate 壓縮成 N5Z.…（瀏覽器不支援就用原本的碼）
async function zipCode(code) {
  try {
    if (typeof CompressionStream === 'undefined') return code;
    const buf = await new Response(new Blob([code]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    let bin = ''; const u8 = new Uint8Array(buf);
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    const z = 'N5Z.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return z.length < code.length ? z : code;
  } catch (e) { return code; }
}
async function unzipCode(z) {
  if (typeof DecompressionStream === 'undefined') throw new Error('nozip');
  let b = z.slice(4).replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '=';
  const bin = atob(b), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
}

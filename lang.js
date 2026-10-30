/* 多語言：切換語言、鎖定（同時只學幾個語言）、打開 App 時回到上次的語言
   每個語言頁都在 <head> 載入這個檔，並用 data-lang 標出自己是哪個語言：
   <script src="lang.js" data-lang="ja"></script> */
(function () {
  'use strict';
  const me = document.currentScript;
  const CUR = (me && me.dataset.lang) || 'ja';
  const ROOT = new URL('.', me ? me.src : location.href).href;   // lang.js 所在的資料夾＝App 根目錄
  const LANGS = [
    { id: 'ja', name: '日語', sub: 'N5', glyph: 'あ', path: 'index.html', ready: true },
    { id: 'it', name: '義大利文', sub: 'A1', glyph: 'à', path: 'it.html', ready: true },
    { id: 'es', name: '西班牙文', sub: 'A1', glyph: 'ñ', path: 'es.html', ready: true },
    { id: 'de', name: '德文', sub: '', glyph: 'ß', path: 'de.html', ready: false },
    { id: 'ru', name: '俄文', sub: '', glyph: 'Я', path: 'ru.html', ready: false },
    { id: 'en', name: '英文', sub: 'B2', glyph: 'Aa', path: 'en.html', ready: false }
  ];
  const BY = Object.fromEntries(LANGS.map(l => [l.id, l]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const ready = LANGS.filter(l => l.ready).map(l => l.id);
  const cfg = () => {
    const c = Object.assign({ active: ready.slice(0, 2), max: 2, lock: true, note: '' }, store.get('langs:v1', {}));
    c.active = c.active.filter(id => BY[id] && BY[id].ready);
    if (!c.active.length) c.active = [CUR];
    return c;
  };
  const saveCfg = c => store.set('langs:v1', c);
  const urlOf = id => ROOT + BY[id].path + (id === 'ja' ? '?l=ja' : '');

  // ---- 打開 App 時回到上次學的語言 ----
  const params = new URLSearchParams(location.search);
  if (params.get('l')) {
    store.set('langs:last', params.get('l'));
    params.delete('l');
    const q = params.toString();
    try { history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch (e) {}
  } else if (CUR === 'ja') {
    const last = store.get('langs:last', 'ja');
    let fromApp = false;
    try { fromApp = !!document.referrer && new URL(document.referrer).href.startsWith(ROOT); } catch (e) {}
    const c = cfg();
    if (last !== 'ja' && BY[last] && BY[last].ready && !fromApp && (!c.lock || c.active.includes(last))) { location.replace(ROOT + BY[last].path); return; }
    store.set('langs:last', 'ja');
  } else store.set('langs:last', CUR);

  // ---- 面板 ----
  const X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let back = null, el = null;
  function sheet(title, html, opts = {}) {
    if (!el) {
      back = document.createElement('div'); back.className = 'pk-back'; back.hidden = true;
      el = document.createElement('div'); el.className = 'pk lg-pk'; el.hidden = true;
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
      document.body.append(back, el);
    }
    back.onclick = opts.locked ? null : close;
    el.setAttribute('aria-label', title);
    el.innerHTML = `<div class="pk-grab" aria-hidden="true"></div><div class="pk-top"><b>${esc(title)}</b>${opts.locked ? '' : `<button class="pk-x" aria-label="關閉">${X}</button>`}</div><div class="pk-list lg-list">${html}</div>`;
    const x = el.querySelector('.pk-x'); if (x) x.onclick = close;
    back.hidden = false; el.hidden = false;
    requestAnimationFrame(() => { back.classList.add('in'); el.classList.add('in'); const f = el.querySelector('.pk-opt.on, .pk-opt:not([disabled]), button'); if (f) f.focus({ preventScroll: true }); });
    return el;
  }
  function close() {
    if (!el || el.hidden) return;
    back.classList.remove('in'); el.classList.remove('in');
    setTimeout(() => { back.hidden = true; el.hidden = true; }, 180);
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && el && !el.hidden && el.querySelector('.pk-x')) { e.stopPropagation(); close(); } }, true);
  // 用 replace 換頁：不留下上一個語言的紀錄，按手機返回鍵不會跳回去
  const go = id => { if (id === CUR) return close(); location.replace(urlOf(id)); };
  const row = (l, extra = '', attrs = '', plain) => { const on = !plain && l.id === CUR; return `<button class="pk-opt${on ? ' on' : ''}" ${attrs}><span class="lg-g" aria-hidden="true">${esc(l.glyph)}</span><span class="pk-n">${esc(l.name)}${l.sub ? ` <small>${esc(l.sub)}</small>` : ''}</span>${extra}<span class="pk-ck" aria-hidden="true">${on ? OK : ''}</span></button>`; };

  function openPicker() {
    const c = cfg();
    const act = c.lock ? c.active.map(id => BY[id]) : LANGS.filter(l => l.ready);
    const paused = c.lock ? LANGS.filter(l => l.ready && !c.active.includes(l.id)) : [];
    const soon = LANGS.filter(l => !l.ready);
    const html = `
      <div class="lg-h">${c.lock ? `學習中（最多 ${c.max} 個）` : '語言'}</div>
      ${act.map(l => row(l, '', `data-go="${l.id}"`)).join('')}
      ${paused.length ? `<div class="lg-h">暫停中</div>${paused.map(l => row(l, '<span class="pk-c">換進來</span>', `data-swap="${l.id}"`)).join('')}` : ''}
      ${soon.length ? `<div class="lg-h">之後會加入</div>${soon.map(l => row(l, '<span class="pk-c">準備中</span>', 'disabled')).join('')}` : ''}
      <div class="lg-set">
        <div class="lg-line"><div><b>鎖定語言</b><div class="lg-m">只開放幾個語言，想開新的要先暫停一個</div></div><button class="chip" id="lgLock" aria-pressed="${c.lock}">${c.lock ? '開' : '關'}</button></div>
        ${c.lock ? `<div class="lg-line"><div><b>同時學習</b></div><div class="seg" role="group" aria-label="同時學習的語言數" style="min-width:150px">${[1, 2, 3].map(n => `<button data-max="${n}" aria-pressed="${c.max === n}">${n} 個</button>`).join('')}</div></div>
        <div class="lg-line"><div><b>鎖定的理由</b><div class="lg-m">${c.note ? '「' + esc(c.note) + '」' : '寫一句話提醒自己，想換語言時會先看到它'}</div></div><button class="chip" id="lgNote">${c.note ? '修改' : '寫下'}</button></div>` : ''}
      </div>`;
    const s = sheet('切換語言', html);
    s.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    s.querySelectorAll('[data-swap]').forEach(b => b.onclick = () => askSwap(b.dataset.swap));
    s.querySelector('#lgLock').onclick = () => { const c2 = cfg(); c2.lock = !c2.lock; if (c2.lock) trim(c2); saveCfg(c2); openPicker(); };
    s.querySelectorAll('[data-max]').forEach(b => b.onclick = () => { const c2 = cfg(); c2.max = +b.dataset.max; trim(c2); saveCfg(c2); openPicker(); });
    const nb = s.querySelector('#lgNote'); if (nb) nb.onclick = editNote;
  }
  // 上限變小時，先保留目前這個語言，其他的從後面開始暫停
  function trim(c) {
    if (c.active.length <= c.max) return;
    const keep = [CUR].concat(c.active.filter(id => id !== CUR)).slice(0, c.max);
    const off = c.active.filter(id => !keep.includes(id));
    c.active = keep;
    if (off.length) flash('已暫停：' + off.map(id => BY[id].name).join('、'));
  }
  function editNote() {
    const c = cfg();
    const s = sheet('鎖定的理由', `<p class="lg-m" style="margin:0">例如：「先把日文和義大利文學到能用再說」。想換語言時，會先看到這句話。</p>
      <textarea id="lgNoteIn" maxlength="120" style="min-height:90px;font-family:inherit;font-size:16px" aria-label="鎖定的理由">${esc(c.note)}</textarea>
      <div class="lg-btns"><button class="btn quiet" id="lgNoteCancel">取消</button><button class="btn solid" id="lgNoteSave">儲存</button></div>`);
    s.querySelector('#lgNoteCancel').onclick = openPicker;
    s.querySelector('#lgNoteSave').onclick = () => { const c2 = cfg(); c2.note = s.querySelector('#lgNoteIn').value.trim(); saveCfg(c2); openPicker(); };
  }
  function askSwap(id, locked) {
    const c = cfg(), t = BY[id];
    if (c.active.length < c.max) { c.active.push(id); saveCfg(c); return go(id); }
    const s = sheet(`換成${t.name}`, `
      ${c.note ? `<div class="lg-note"><div class="lg-m">你鎖定時寫下的理由</div><b>「${esc(c.note)}」</b></div>` : ''}
      <p class="lg-m" style="margin:2px 0">要開始學${esc(t.name)}，得先暫停一個語言。暫停的語言進度都會保留。</p>
      ${c.active.map(a => row(BY[a], '<span class="pk-c">暫停它</span>', `data-off="${a}"`, true)).join('')}
      <div class="lg-btns"><button class="btn quiet" id="lgCancel">${locked ? '回到' + esc(BY[c.active[0]].name) : '先不要換'}</button></div>`, { locked });
    s.querySelectorAll('[data-off]').forEach(b => b.onclick = () => {
      const c2 = cfg(); c2.active = c2.active.filter(x => x !== b.dataset.off).concat(id); saveCfg(c2);
      if (id === CUR) { close(); flash(`已暫停${BY[b.dataset.off].name}`); } else go(id);
    });
    s.querySelector('#lgCancel').onclick = locked ? () => go(c.active[0]) : openPicker;
  }
  function flash(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.className = 'toast on';
    clearTimeout(flash.t); flash.t = setTimeout(() => { t.className = 'toast'; }, 2200);
  }

  function boot() {
    const st = document.createElement('style');
    st.textContent = `html{touch-action:manipulation}
      .goal span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--fg);opacity:.85}
      .brand.lg-btn{cursor:pointer;display:inline-flex;align-items:center;gap:2px;border-radius:10px;padding:4px 6px;margin:-4px -6px;-webkit-tap-highlight-color:transparent}
      .brand.lg-btn:active{background:var(--pri-soft)}
      .brand.lg-btn .lg-chev{width:12px;height:12px;color:var(--muted);flex:none}
      .lg-list{gap:8px}
      .lg-h{font-size:13px;color:var(--muted);font-weight:600;margin:6px 2px 0}
      .lg-g{flex:none;width:34px;height:34px;border-radius:9px;background:var(--btn);color:var(--pri);display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:17px}
      .pk-opt.on .lg-g{background:rgba(255,255,255,.2);color:var(--fill-ink)}
      .pk-opt small{font-weight:500;opacity:.75;margin-left:2px}
      .pk-opt[disabled]{opacity:.55;box-shadow:none;cursor:default}
      .lg-set{margin-top:10px;border-top:1px solid var(--line);padding-top:6px;display:flex;flex-direction:column}
      .lg-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 2px}
      .lg-line + .lg-line{border-top:1px solid var(--line)}
      .lg-line b{font-size:15px}
      .lg-m{font-size:13px;color:var(--muted)}
      .lg-note{background:var(--amb);border:1px solid var(--amb-edge);color:var(--amb-ink);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:2px}
      .lg-note .lg-m{color:inherit;opacity:.85}
      .lg-btns{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:8px;margin-top:4px}`;
    document.head.appendChild(st);
    const brand = document.querySelector('.brand');
    if (brand) {
      brand.classList.add('lg-btn');
      brand.setAttribute('role', 'button'); brand.setAttribute('tabindex', '0');
      brand.setAttribute('aria-label', `目前是${BY[CUR].name}，點一下切換語言`); brand.title = '切換語言';
      brand.insertAdjacentHTML('beforeend', '<svg class="lg-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>');
      brand.addEventListener('click', openPicker);
      brand.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } });
    }
    // 直接打開了一個暫停中的語言：先決定要換進來還是回去
    const c = cfg();
    if (c.lock && !c.active.includes(CUR)) setTimeout(() => askSwap(CUR, true), 300);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  // 鍵盤收起來（例如按手機返回鍵）但輸入框還留著焦點時，底部分頁會一直藏著：偵測畫面高度恢復，就把分頁叫回來
  if (window.visualViewport) {
    const vv = window.visualViewport;
    let full = vv.height, timer = 0;
    const back = () => {
      const b = document.body;
      if (!b || !b.classList.contains('typing') || vv.height < full * 0.85) return;
      const a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) a.blur();
      b.classList.remove('typing');
    };
    vv.addEventListener('resize', () => {
      if (vv.height > full) full = vv.height;
      clearTimeout(timer);
      if (vv.height >= full * 0.85) timer = setTimeout(back, 400);
    });
    addEventListener('orientationchange', () => { full = 0; setTimeout(() => { full = vv.height; }, 600); });
  }
  window.AppLangs = { open: openPicker, current: CUR, list: LANGS };
})();

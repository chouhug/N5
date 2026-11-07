/* 共用的介面零件（所有語言頁共用）：音效、震動、提示訊息、下拉選單面板、滑動開關、圖示、小按鈕
   這個檔在 <body> 裡、頁面主程式前面載入（要用到 document.body）。
   需要頁面設定的地方（音效大小 sfx、震動 vib、介面翻譯）由頁面接上：UIKit.bind({ SET, t })
   給頁面用的名稱都放在 window 上：esc、store、ICON、iconPlay、playBtn、verdict、toast、pillSelect、
   Sfx、buzz、testBuzz、canVibrate、inFrame、Picker */
(function () {
'use strict';
const K = window.UIKit = { SET: {}, t: s => s, bind(o) { Object.assign(K, o); } };
const $ = (s, r = document) => r.querySelector(s);

// ================= 基本工具 =================
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 存不了也能用 */ } }
};
const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  ng: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  sys: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>'
};
const playBtn = (text, label, extra = '') => `<button class="play" data-say="${esc(text)}" ${extra}>${ICON.play}${esc(label)}</button>`;
const iconPlay = (text, label) => `<button class="iplay" data-say="${esc(text)}" aria-label="${esc(label)}">${ICON.play}</button>`;
// warn：答對但要注意（拼寫、重音）
function verdict(ok, extra = '', warn) { return `<div class="verdict ${ok ? (warn ? 'warn' : 'ok') : 'ng'}">${ok ? ICON.ok + '答對了' : ICON.ng + '答錯了'}${extra}</div>`; }
let toastT = 0;
function toast(msg, goal = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast on' + (goal ? ' goal' : '');
  clearTimeout(toastT); toastT = setTimeout(() => t.className = 'toast' + (goal ? ' goal' : ''), goal ? 3200 : 1800);
}
function pillSelect(id, label, opts, val) {
  return `<span class="pw"><select class="pill" id="${id}" aria-label="${label}">${opts.map(([k, l]) => `<option value="${k}"${k === val ? ' selected' : ''}>${l}</option>`).join('')}</select></span>`;
}

// ================= 音效（用 Web Audio 即時合成，不需要音檔） =================
const Sfx = {
  ctx: null,
  vol() { return { on: 1, low: 0.45, off: 0 }[K.SET.sfx] ?? 1; },
  ac() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  },
  // 一個音：頻率、長度、波形、音量、結束頻率、延遲
  tone(f, dur, type = 'sine', v = 0.08, f2 = 0, at = 0) {
    const k = this.vol(); if (!k) return;
    const c = this.ac(); if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v * k, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  buf(c) { if (!this.nbuf) { const n = c.sampleRate * 0.2; this.nbuf = c.createBuffer(1, n, c.sampleRate); const d = this.nbuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; } return this.nbuf; },
  // 短促的雜訊：真正的「喀」聲是雜訊，不是有音高的嗶聲
  noise(dur, freq, q, v, at = 0) {
    const k = this.vol(); if (!k) return;
    const c = this.ac(); if (!c) return;
    this.buf(c);
    const t = c.currentTime + at, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.nbuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(v * k, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination); src.start(t); src.stop(t + dur + 0.02);
  },
  // ---- 各類按鈕的聲音（同一類用同一個聲音，名稱見 SFX_KIND） ----
  // 輕聲「嘎」：次要按鈕
  soft() { this.noise(0.045, 1100, 0.9, 0.14); this.tone(130, 0.045, 'sine', 0.07, 85); },
  // 青軸鍵盤「ガッヅ」：按下的清脆咔＋鍵身＋回彈的小咔
  blue() {
    this.noise(0.008, 4200, 2.5, 0.55); this.noise(0.022, 1900, 1.1, 0.22);
    this.tone(210, 0.035, 'triangle', 0.09, 120);
    this.noise(0.010, 3300, 2.2, 0.30, 0.055); this.tone(160, 0.025, 'sine', 0.05, 110, 0.055);
  },
  // 木魚「咚」：底部分頁
  wood() { this.tone(820, 0.07, 'sine', 0.11, 620); this.tone(1640, 0.03, 'sine', 0.03, 1240); this.noise(0.01, 2000, 1, 0.08); },
  // 開關「嗶啵」：上升＝開、下降＝關
  toggle(on) { const a = on ? 660 : 990, b = on ? 990 : 660; this.tone(a, 0.05, 'sine', 0.07); this.tone(b, 0.07, 'sine', 0.07, 0, 0.055); },
  // 篩選標籤「滴」
  tick() { this.noise(0.012, 5200, 2, 0.18); this.tone(1900, 0.025, 'sine', 0.035); },
  // 五十音格子：柔和的木琴音，依母音（あいうえお）換音高
  mallet(col) { const f = [523.3, 587.3, 659.3, 784, 880][col % 5] || 659.3; this.tone(f, 0.22, 'sine', 0.09); this.tone(f * 4, 0.05, 'sine', 0.025); },
  // 翻頁：打開文法、詞性、清單、設定
  flip() {
    const k = this.vol(); if (!k) return; const c = this.ac(); if (!c) return;
    const t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.buf(c); f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.09);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * k, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    src.connect(f).connect(g).connect(c.destination); src.start(t); src.stop(t + 0.13);
  },
  // 點單字看意思「啾」
  peek() { this.tone(1200, 0.05, 'sine', 0.05, 1700); },
  slide() { this.noise(0.06, 1800, 0.8, 0.12); this.tone(150, 0.035, 'sine', 0.1, 100, 0.05); this.noise(0.015, 3000, 1.2, 0.25, 0.05); },
  pop() { this.tone(520, 0.06, 'sine', 0.08, 900); this.noise(0.012, 2600, 1.5, 0.18); },
  unpop() { this.tone(900, 0.06, 'sine', 0.07, 480); },
  tap() { this.soft(); },
  ok() { this.tone(880, 0.12, 'sine', 0.09); this.tone(1318.5, 0.2, 'sine', 0.09, 0, 0.09); },
  ng() { this.tone(240, 0.22, 'triangle', 0.09, 150); },
  done() { [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(f, 0.18, 'sine', 0.08, 0, i * 0.09)); }
};
// 依按鈕的功能決定聲音；答題、播放發音另外處理
function sfxKind(el) {
  if (el.closest('.opt, [data-say], .iplay, .play, #fillGo, [data-sfx]')) return '';
  if (el.closest('.pk-opt')) return '';
  if (el.closest('.tk')) return 'peek';
  if (el.closest('.tabbar')) return 'wood';
  if (el.closest('.seg')) return 'slide';
  if (el.classList.contains('pw')) return 'pop';
  if (el.closest('.gl-x, .pk-x')) return 'unpop';
  if (el.closest('.iconbtn')) return 'toggle';
  if (el.closest('.kc')) return 'mallet';
  if (el.closest('summary, .gr-row, .rc-tile, .rc-w, .posbtn, .gbtn, .gp-more, [data-forms], [data-word], [data-gram], .gl-back, .gr-back')) return 'flip';
  if (el.closest('.chip, [data-list], .chips button')) return 'tick';
  if (el.closest('.btn.solid, .btn.known, [data-a], [data-next], [data-q], [data-go], #again, .gbtn-signin')) return 'blue';
  return 'soft';
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-sfx]');
  if (t) { const k = t.dataset.sfx; return k === 'toggle' ? Sfx.toggle(true) : k === 'mallet' ? [0, 1, 2, 3, 4].forEach(i => setTimeout(() => Sfx.mallet(i), i * 140)) : Sfx[k](); }
  const el = e.target.closest('button, .pw, summary, .tk');
  if (!el || el.disabled) return;
  const k = sfxKind(el);
  if (k === 'toggle') { const on = el.getAttribute('aria-pressed'); return Sfx.toggle(on !== 'true'); }
  if (k === 'mallet') { const cells = [...el.parentElement.children]; return Sfx.mallet(Math.max(0, cells.indexOf(el))); }
  if (k) Sfx[k]();
}, true);
// 設定裡的下拉選單（不是自訂面板的）換選項時「滴」一聲
document.addEventListener('change', e => { if (e.target.matches('select') && !e.target.closest('.pw') && e.target.id !== 'sfxSel') Sfx.tick(); });

// 震動：答對短震一下，答錯震兩下（Android 支援；iPhone 的網頁不支援，會自動略過）
const canVibrate = 'vibrate' in navigator;
const inFrame = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();
function buzz(ok) { if (K.SET.vib === 'on' && canVibrate) try { navigator.vibrate(ok ? 45 : [70, 80, 70]); } catch (e) {} }
// 測試震動：直接告訴使用者這台手機、這種開法能不能震
function testBuzz() {
  if (!canVibrate) return toast('這個瀏覽器不支援震動（iPhone 的網頁都不支援）');
  let ok = false;
  try { ok = navigator.vibrate([200, 100, 200]); } catch (e) {}
  if (!ok) toast(inFrame ? '在預覽裡不能震動，請用 Chrome 或主畫面上的 App 開' : '瀏覽器擋下了震動，請檢查勿擾模式或震動設定');
  else toast(inFrame ? '已送出震動；如果沒感覺，請改用主畫面上的 App 開' : '已送出震動；如果沒感覺，請關掉勿擾模式，並確認系統的震動有開');
}

// ================= 下拉選單：點 .pw 打開底部面板 =================
const Picker = {
  el: null, back: null, sel: null,
  build() {
    this.back = document.createElement('div'); this.back.className = 'pk-back'; this.back.hidden = true;
    this.el = document.createElement('div'); this.el.className = 'pk'; this.el.hidden = true;
    this.el.setAttribute('role', 'dialog'); this.el.setAttribute('aria-modal', 'true');
    document.body.append(this.back, this.el);
    this.back.onclick = () => this.close();
    this.el.addEventListener('click', e => {
      if (e.target.closest('.pk-x')) return this.close();
      const b = e.target.closest('[data-v]');
      if (!b || !this.sel) return;
      Sfx.tick(); const sel = this.sel; this.close();
      if (sel.value !== b.dataset.v) { sel.value = b.dataset.v; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  },
  open(sel) {
    if (!this.el) this.build();
    this.sel = sel;
    const title = sel.getAttribute('aria-label') || K.t('選擇');
    const rows = [...sel.options].map(o => {
      const m = o.textContent.match(/^(.*?)\s+(\d+)$/);
      let name = m ? m[1] : o.textContent; const n = m ? +m[2] : null;
      if (o.value === 'all' && sel.hasAttribute('data-possel')) name = K.t('全部');
      const on = o.value === sel.value;
      return `<button class="pk-opt${on ? ' on' : ''}${n === 0 ? ' zero' : ''}" data-v="${esc(o.value)}" role="option" aria-selected="${on}">
        <span class="pk-n">${esc(name)}</span>${n !== null ? `<span class="pk-c">${n}</span>` : ''}<span class="pk-ck" aria-hidden="true">${on ? ICON.ok : ''}</span></button>`;
    }).join('');
    this.el.setAttribute('aria-label', title);
    this.el.innerHTML = `<div class="pk-grab" aria-hidden="true"></div><div class="pk-top"><b>${esc(title)}</b><button class="pk-x" aria-label="關閉">${ICON.ng}</button></div><div class="pk-list" role="listbox">${rows}</div>`;
    this.back.hidden = false; this.el.hidden = false;
    requestAnimationFrame(() => { this.back.classList.add('in'); this.el.classList.add('in'); const cur = $('.pk-opt.on', this.el); (cur || $('.pk-opt', this.el)).focus({ preventScroll: true }); if (cur) cur.scrollIntoView({ block: 'nearest' }); });
  },
  close() {
    if (!this.el || this.el.hidden) return;
    this.back.classList.remove('in'); this.el.classList.remove('in');
    const sel = this.sel; this.sel = null;
    setTimeout(() => { this.back.hidden = true; this.el.hidden = true; }, 180);
    if (sel && document.contains(sel)) sel.focus({ preventScroll: true });
  }
};
document.addEventListener('click', e => {
  const w = e.target.closest('.pw');
  if (!w) return;
  const sel = $('select', w);
  if (sel && !sel.disabled) { e.preventDefault(); Picker.open(sel); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && Picker.el && !Picker.el.hidden) { e.stopPropagation(); Picker.close(); } }, true);

// ================= 滑動開關：記住上一個位置，重畫後從舊位置滑到新位置 =================
const segPrev = {};
new MutationObserver(() => {
  // 先把所有新的開關放到「上一次的位置」且不播動畫，統一排版一次，再一起滑到新位置；
  // 這樣沒換選項的開關（例如切平假名時的「五十音表／練習」）就不會跳動。
  const todo = [];
  document.querySelectorAll('.seg').forEach(seg => {
    const btns = [...seg.children].filter(b => b.tagName === 'BUTTON');
    const idx = btns.findIndex(b => b.getAttribute('aria-pressed') === 'true');
    if (idx < 0 || seg.dataset.segi === String(idx)) return;
    const key = seg.getAttribute('aria-label') || '', prev = segPrev[key];
    seg.dataset.segi = idx; segPrev[key] = idx;
    seg.style.setProperty('--n', btns.length);
    seg.classList.add('seg-noanim');
    seg.style.setProperty('--i', prev != null ? prev : idx);
    todo.push([seg, idx]);
  });
  if (!todo.length) return;
  void document.body.offsetWidth;
  for (const [seg, idx] of todo) { seg.classList.remove('seg-noanim'); seg.style.setProperty('--i', idx); }
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });

Object.assign(window, { esc, store, ICON, playBtn, iconPlay, verdict, toast, pillSelect, Sfx, buzz, testBuzz, canVibrate, inFrame, Picker });
})();

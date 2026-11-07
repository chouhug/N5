/* 雲端同步（所有語言頁共用）
   進度存在 Firestore：
   - users/{uid}            每天的題數 days、版本 v、更新時間 updated
   - users/{uid}/p/{語言-0..3}  各語言的單字紀錄 items，每個語言分成 4 份（日文是 ja-0…ja-3）
   一份文件最多 1 MB，以前所有語言擠在 users/{uid} 一份裡，字一多就會存不進去；
   分開之後每份只有一兩百 KB，而且每次只寫有改到的字，不再整份重傳。
   舊版頁面寫在 users/{uid}.items 的紀錄，新版會收進分開的文件後刪掉（舊頁之後再寫進來也會再搬一次）。
   如果 Firestore 規則還不允許寫 users/{uid}/p/…，會自動退回舊的整份格式，不會壞掉。
   用法：const Cloud = makeCloud({ getS, setS, saveLocal, merge, refresh, toast, renderAuth, reload }) */
(function () {
  'use strict';
  const LANG_IDS = ['it', 'es', 'de', 'ru', 'en'];
  const SHARDS = 4;
  const hash = id => { let h = 0x811c9dc5; for (const ch of id) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
  const bucketOf = id => { const p = id.split(':')[0]; return (LANG_IDS.includes(p) ? p : 'ja') + '-' + (hash(id) % SHARDS); };
  const tOf = r => (r && r.t) || 0;
  const clone = o => JSON.parse(JSON.stringify(o));
  const isEmpty = o => { for (const k in o) return false; return true; };

  window.makeCloud = function (h) {
    const $ = (sel, root) => (root || document).querySelector(sel);
    const reload = () => { if (h.reload) h.reload(); };
    const C = {
      // ref 不是 null＝有連上帳號（介面用來判斷）；layout：split＝分開存，single＝舊的整份格式
      ref: null, state: 'local', mode: 'local', user: null, fb: null, layout: 'split',
      timer: 0, writing: false, again: false, unsubs: [],
      remote: null,                       // single：{items, days}
      root: null, rootRemote: null, buckets: null, rootReady: false, bucketsReady: false, noSplit: false,
      label() {
        return {
          local: '進度只存在這台裝置',
          signedout: '還沒登入。登入 Google 後，進度會存到雲端，換手機也能接著練。',
          connecting: '正在連線帳號…',
          synced: this.mode === 'google' ? `已同步到 Google 帳號${this.user && this.user.email ? `（${this.user.email}）` : ''}` : '已同步到你的帳號',
          saving: '正在同步…',
          error: '暫時無法同步，進度仍存在這台裝置',
          readonly: '這個連結無法寫入你的帳號，進度只存在這台裝置'
        }[this.state];
      },
      chip() { return this.ref ? (this.mode === 'google' ? '已登入' : '已連帳號') : (this.mode === 'google' ? '未登入' : '只存本機'); },
      set(st) {
        this.state = st;
        const el = $('#syncState');
        if (el) { el.className = 'n sync' + (this.ref ? ' on' : ''); const sp = $('span', el); if (sp) sp.textContent = this.chip(); }
        const lg = $('#syncLong'); if (lg) lg.textContent = this.label();
        if (h.renderAuth) h.renderAuth();
      },
      async init() {
        if (await this.initClaude()) return;
        this.initFirebase();
      },
      // 在 claude.ai 裡預覽時用 claude 的資料庫（舊的整份格式）
      async initClaude() {
        try {
          if (!window.claude || typeof window.claude.use !== 'function') return false;
          const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
          if (!db || !user) return false;
          const uid = await user.id();
          if (!uid) return false;
          this.mode = 'claude';
          this.attachSingle(db.collection('data/users/' + uid).doc('progress'));
          return true;
        } catch (e) { return false; }
      },
      initFirebase() {
        try {
          if (!window.firebase || !window.N5_FIREBASE) return;
          if (!firebase.apps.length) firebase.initializeApp(window.N5_FIREBASE);
          this.fb = { auth: firebase.auth(), db: firebase.firestore() };
          this.mode = 'google';
          this.set('signedout');
          this.fb.auth.getRedirectResult().catch(e => this.authError(e));
          this.fb.auth.onAuthStateChanged(u => {
            if (u) {
              this.user = u;
              const ref = this.fb.db.collection('users').doc(u.uid);
              if (this.noSplit) this.attachSingle(ref); else this.attachSplit(ref);
            } else { this.detach(); this.user = null; this.set('signedout'); }
          });
        } catch (e) { this.mode = 'local'; this.set('local'); }
      },
      async signIn() {
        if (!this.fb) return;
        const prov = new firebase.auth.GoogleAuthProvider();
        prov.setCustomParameters({ prompt: 'select_account' });
        try { await this.fb.auth.signInWithPopup(prov); }
        catch (e) {
          if (e && /popup-blocked|operation-not-supported/.test(e.code || '')) { try { await this.fb.auth.signInWithRedirect(prov); } catch (e2) { this.authError(e2); } }
          else this.authError(e);
        }
      },
      async signOut() {
        if (!this.fb) return;
        await this.upload();
        await this.fb.auth.signOut();
        if (h.toast) h.toast('已登出，進度仍保留在這台裝置');
      },
      authError(e) {
        const c = (e && e.code) || '';
        if (/popup-closed|cancelled-popup/.test(c)) return;
        const msg = /unauthorized-domain/.test(c) ? '登入失敗：Firebase 還沒允許這個網址，請到 Authentication → Settings → Authorized domains 加入 chouhug.github.io'
          : /network/.test(c) ? '登入失敗：請確認網路連線'
          : /operation-not-allowed/.test(c) ? '登入失敗：Firebase 還沒打開 Google 登入'
          : '登入失敗，請再試一次';
        if (h.toast) h.toast(msg);
      },
      detach() {
        for (const u of this.unsubs) { try { u(); } catch (e) {} }
        this.unsubs = [];
        clearTimeout(this.timer);
        this.ref = null; this.remote = null; this.root = null; this.rootRemote = null; this.buckets = null;
        this.rootReady = false; this.bucketsReady = false;
      },
      // 把雲端的紀錄併進本機（每個字留時間比較新的那筆）
      absorb(remote) {
        reload();
        const S = h.getS();
        const merged = h.merge(S, remote);
        if (JSON.stringify(merged) === JSON.stringify({ items: S.items, days: S.days })) return;
        h.setS(merged); h.saveLocal(); if (h.refresh) h.refresh();
      },
      schedule(ms = 2500) { if (!this.ref) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.upload(), ms); },
      upload() { return this.layout === 'split' ? this.uploadSplit() : this.uploadSingle(); },
      writeFailed(e) {
        if (e && (e.code === 'invalid_argument' || e.code === 'permission-denied')) this.set(this.mode === 'google' ? 'error' : 'readonly');
        else if (e && e.code === 'unavailable') { this.set('error'); setTimeout(() => this.schedule(500), 3000 + Math.random() * 2000); }
        else this.set('error');
      },

      // ---- 新格式：每個語言分開存 ----
      attachSplit(root) {
        this.detach();
        this.layout = 'split'; this.root = root; this.ref = root; this.buckets = {};
        this.set('connecting');
        this.unsubs.push(root.onSnapshot(snap => {
          const d = snap && snap.exists ? (snap.data() || {}) : {};
          this.rootRemote = { items: d.items || {}, days: d.days || {} };
          this.rootReady = true; this.onRemote();
        }, () => this.set('error')));
        this.unsubs.push(root.collection('p').onSnapshot(qs => {
          qs.docChanges().forEach(ch => {
            if (ch.type === 'removed') delete this.buckets[ch.doc.id];
            else this.buckets[ch.doc.id] = (ch.doc.data() || {}).items || {};
          });
          this.bucketsReady = true; this.onRemote();
        }, e => { if (e && e.code === 'permission-denied') this.fallback(); else this.set('error'); }));
      },
      // Firestore 規則還不允許分開存：改用舊的整份格式
      fallback() {
        if (this.layout !== 'split' || !this.root) return;
        console.warn('[sync] Firestore 規則不允許 users/{uid}/p，改用舊的整份格式');
        const ref = this.root;
        this.noSplit = true;
        this.attachSingle(ref);
      },
      remoteState() {
        const items = {};
        for (const b in this.buckets) Object.assign(items, this.buckets[b]);
        const old = (this.rootRemote && this.rootRemote.items) || {};
        for (const id in old) if (tOf(old[id]) > tOf(items[id])) items[id] = old[id];
        return { items, days: (this.rootRemote && this.rootRemote.days) || {} };
      },
      onRemote() {
        if (!this.rootReady || !this.bucketsReady) return;
        this.absorb(this.remoteState());
        if (this.state === 'connecting' || this.state === 'error') this.set('synced');
        this.schedule(300);
      },
      async uploadSplit() {
        if (!this.root || !this.rootReady || !this.bucketsReady) return;
        if (this.writing) { this.again = true; return; }
        const root = this.root, buckets = this.buckets, rr = this.rootRemote;   // 中途登出或換帳號時，不要寫到新的狀態裡
        // 先把雲端最新的收進來（包含舊頁面寫在 users/{uid}.items 的），再算要寫哪些
        this.absorb(this.remoteState());
        const S = h.getS();
        const byB = {}; let n = 0;
        for (const id in S.items) {
          const b = bucketOf(id), r = (this.buckets[b] || {})[id];
          if (!r || tOf(S.items[id]) > tOf(r)) { (byB[b] = byB[b] || {})[id] = S.items[id]; n++; }
        }
        const rd = rr.days || {}, days = {};
        for (const d in S.days) if ((S.days[d] || 0) > (rd[d] || 0)) days[d] = S.days[d];
        const legacy = !isEmpty(this.rootRemote.items || {});
        if (!n && isEmpty(days) && !legacy) return;
        this.writing = true; this.set('saving');
        try {
          const FS = firebase.firestore, FP = FS.FieldPath;
          const batch = this.fb.db.batch();
          for (const b in byB) {
            const items = clone(byB[b]);
            // mergeFields：只換掉有改的字（整筆換掉，不會留下舊欄位），其他字不動
            batch.set(root.collection('p').doc(b), { items }, { mergeFields: Object.keys(items).map(id => new FP('items', id)) });
          }
          const rootData = { days: clone(days), v: 2, updated: Date.now() };
          const fields = Object.keys(days).map(d => new FP('days', d)).concat(['v', 'updated']);
          // 舊格式的紀錄都已經寫進分開的文件了，從 users/{uid} 拿掉
          if (legacy) { rootData.items = FS.FieldValue.delete(); fields.push('items'); }
          batch.set(root, rootData, { mergeFields: fields });
          await batch.commit();
          for (const b in byB) buckets[b] = Object.assign(buckets[b] || {}, clone(byB[b]));
          Object.assign(rd, days);
          if (legacy) rr.items = {};
          if (this.root === root) this.set('synced');
        } catch (e) {
          if (this.root !== root) return;
          if (e && e.code === 'permission-denied') { this.again = false; this.fallback(); return; }
          this.writeFailed(e);
        } finally {
          this.writing = false;
          if (this.again) { this.again = false; this.schedule(800); }
        }
      },

      // ---- 舊格式：整份存在一個文件（claude.ai 預覽、或 Firestore 規則還沒更新時用）----
      attachSingle(ref) {
        this.detach();
        this.layout = 'single'; this.ref = ref; this.remote = null;
        this.set('connecting');
        this.unsubs.push(ref.onSnapshot(snap => {
          const d = snap && snap.exists ? (snap.data() || {}) : {};
          this.remote = { items: d.items || {}, days: d.days || {} };
          this.absorb(this.remote);
          if (this.state === 'connecting' || this.state === 'error') this.set('synced');
          this.schedule(300);
        }, () => this.set('error')));
      },
      needsUpload() {
        if (!this.remote) return false;
        reload();
        const S = h.getS(), ri = this.remote.items, rd = this.remote.days;
        for (const id in S.items) { const a = S.items[id], b = ri[id]; if (!b || tOf(a) > tOf(b)) return true; }
        for (const d in S.days) if ((S.days[d] || 0) > (rd[d] || 0)) return true;
        return false;
      },
      async uploadSingle() {
        if (!this.ref || !this.remote || this.state === 'readonly') return;
        if (this.writing) { this.again = true; return; }
        if (!this.needsUpload()) return;
        this.writing = true; this.set('saving');
        try {
          const snap = await this.ref.get();
          const d = snap && snap.exists ? (snap.data() || {}) : {};
          reload();
          const S = h.merge(h.getS(), { items: d.items || {}, days: d.days || {} });
          h.setS(S); h.saveLocal();
          await this.ref.set({ items: S.items, days: S.days, v: 1, updated: Date.now() });
          this.remote = clone({ items: S.items, days: S.days });
          this.set('synced');
        } catch (e) { this.writeFailed(e); }
        finally {
          this.writing = false;
          if (this.again) { this.again = false; this.schedule(800); }
        }
      }
    };
    return C;
  };
  window.makeCloud.bucketOf = bucketOf;
})();

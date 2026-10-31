# 語言學習 App 交接說明

把這個檔案和 `n5-src.zip` 一起丟給新對話，說「接續這個專案」。

## 專案是什麼

- 原本是日語 N5 學習 PWA（GitHub：`chouhug/N5`，用 GitHub Pages 發布），現在擴充成多語言學習 App，名稱「語言學習」。
- 已完成的語言：**日語 N5**（index.html）、**義大利文 A1**（it.html）、**西班牙文 A1**（es.html）、**德文 A1**（de.html）。
- 準備中（選單裡顯示但還不能點）：俄文、英文。
- 介面是繁體中文，外觀、音效、震動、每輪題數、單字意思、介面語言這些設定，各語言共用。

## 上傳方式（重要）

- 使用者用 **iPad 的 GitHub 網頁版**上傳，**不能上傳資料夾、GitHub 不會解壓縮 zip**。
- 所以網站上的檔案全部平放在根目錄，交付時直接傳單一檔案，請使用者「上傳覆蓋舊檔」。
- Claude 沒有權限直接 push 到 repo。

## 網站上的檔案（repo 根目錄）

| 檔案 | 說明 |
|---|---|
| index.html | 日語 N5 頁（使用者原本的檔案，約 523KB），開頭有 `<script src="lang.js" data-lang="ja">` |
| it.html / es.html / de.html | 由 build.js 產生的義大利文、西班牙文、德文頁 |
| lang.js | 所有頁共用：語言選單、語言鎖定（最多幾個語言＋自己寫的理由）、記住上次的語言並自動跳轉、換頁用 location.replace（返回鍵不會跳回上個語言）、鍵盤收起時恢復底部分頁、`html{touch-action:manipulation}`（防止連點放大） |
| sw.js | 離線快取。自己網站的檔案「網路優先、3 秒逾時用快取」；字體和 Firebase 程式庫「快取優先」。目前 `CACHE = 'n5-v51'`（CORE 已加入 de.html） |
| manifest.json | 名稱「語言學習」 |
| icon-192.png、icon-512.png、apple-touch-icon.png | 藍底＋白色對話框「A」＋黃色對話框「文」 |

## 原始碼（n5-src.zip 解開後）

```
n5src/
  build.js            產生語言頁：node build.js <輸出資料夾> it es de
  lang-template.html  語言頁的 HTML 樣板
  lang-app.js         語言頁的共用程式（約 1450 行），用 window.LANGCFG（設定）和 window.LX（各語言引擎與資料）
  lang-style.css      語言頁額外的樣式
  it/  義大利文：config、engine、data1–5、grammar、quiz、test
  es/  西班牙文：config、engine、data1–5、grammar、quiz、test
  de/  德文：config、engine、data1–5、grammar、quiz、test
n5work/               目前網站上的所有檔案（含 index.html）
```

- build.js 會從 `n5work/index.html` 抽出日語頁的 CSS 和 Firebase 設定，所以語言頁外觀和日語頁一致。
- 每個語言有自己的背景插畫（義大利：絲柏、托斯卡尼小鎮；西班牙：風車、橄欖樹；德國：阿爾卑斯雪山、城堡、桁架屋、冷杉）。
- 測試：`node n5src/it/test.js`（20047 項）、`node n5src/es/test.js`（19928 項）、`node n5src/de/test.js`（30411 項），目前全部通過。
- 單字格式：`[單字, 詞性, 性別, 複數或變化, 中文, 英文, 例句, 例句中文, 填空答案]`。
- 德文的差異：
  - 名詞性別 m／f／n／pl（只有複數，如 Eltern），名詞一律大寫。弱變化名詞（Herr → Herrn）列在 engine.js 的 `WEAK`。
  - 動詞第 4 欄是規格 `key=value;…`：`pp`（過去分詞）、`aux=sein`、`sep`（分離前綴）、`du`（母音變化，er 自動推算）、`er`、`imp`、`nopast`、`noimp`。詞性 v／v-st／v-irr／v-mod；反身動詞寫成 `sich freuen`。
  - 形容詞第 4 欄：`cmp`、`sup`（不含 am）、`att`（名詞前詞幹，如 hoch → hoh）、`nocmp`、`inv`、`pred`。
  - 冠詞題分兩種：只看名詞選 der／die／das（性別題），或從例句挖冠詞（含格的說明，例如「den：Tisch 是陽性單數，這裡是受格」）。雙向介係詞後面不會出另一個格的干擾選項。
  - 填空：變音可以打 ae／oe／ue／ss，算「對但注意拼寫」；名詞小寫開頭也會提醒。
- lang-app.js 新增的掛勾（語言包有提供才用，義、西不受影響）：`LX.GENDER`、`LX.formsTable`（單字頁變化表）、`LX.demoTable`（規則頁示範表）、冠詞題的 `info`、`checkAnswer` 第三個參數、`LANGCFG.accentNote`。

## 資料與同步

- 進度存在 localStorage `n5:progress`，Google 登入後同步到 Firestore `users/{uid}`。
- 各語言的 id 有前綴（`it:`、`es:`），日語沒有前綴。
- 設定在 `n5:settings`（共用），語言頁自己的語音設定在 `it:settings`、`es:settings`。
- 語言鎖定設定在 `langs:v1`，上次使用的語言在 `langs:last`。
- 複習間隔：1／3／7／14／30／60 天。只有填空答對才算「學會」。

## 最近做過的改動

- **德文語言包**：834 個字（名詞 360、動詞 172、形容詞 110）、47 個文法點、9 頁變化規則；名詞三格表、形容詞比較級與詞尾、動詞現在式／完成式（haben／sein）／命令式，含分離動詞、反身動詞、母音變化。
- 西班牙文語言包：841 個字、45 個文法點、8 頁變化規則、完整動詞變化引擎（含詞幹變化、反身動詞命令式重音）。
- 點字查詢面板改版：放大字、每個意思附例句。
- 設定頁統一：三種語言分區一樣（發音、音效、練習、介面語言、單字意思、同步與備份）。
- 日語填空：提示改成按了才顯示（設定可改回一開始就顯示）；接受漢字寫法，約 80 個平常寫假名的字（だれ→誰、おいしい→美味しい，動詞變化形也可以）。
- sw.js 改成網路優先，上傳後重新打開就會更新。

## 待辦和點子

1. **好友對戰**（使用者的點子）：用邀請碼加好友，從兩人都學會的字出題，先做非同步挑戰，再做即時對戰。只用邀請碼，不開放隨機配對陌生人和聊天。需要寫好 Firestore 安全規則。
2. **通知**：定時推播需要 Firebase Blaze（要綁付款方式，需要家長協助）＋ Cloud Functions。比較簡單的替代：主畫面圖示顯示到期字數、App 內提醒。
3. **假名筆順動畫**：可用 KanjiVG（CC BY-SA 3.0，要註明來源），可能需要使用者自己下載檔案，因為 Claude 的環境連不到 GitHub 原始檔。
4. 義、西、德填空加特殊字母按鈕（à è é ñ ¿ ¡ ä ö ü ß）。
5. 選單裡「準備中」的語言可以先藏起來（使用者看到會不舒服）。
6. 義、西頁的英文介面、使用導覽。
7. 之後的語言：俄文。
8. 德文可以再加：屬格、形容詞受格／與格詞尾的專門練習題。

## 使用者偏好

- 用繁體中文溝通，回覆要直接、好讀。
- 喜歡平面幾何風格的插畫，不喜歡典型 AI 生成圖。
- 使用 iPad 和 Android 手機（三星）測試，畫面要在 360–412px 寬、淺色和深色主題都檢查。
- 交付檔案時，說清楚要上傳哪幾個檔案。

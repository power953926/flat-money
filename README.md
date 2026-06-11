# 哺哺公積金

租屋處共用的收入與支出紀錄 App。第一版先專注電腦網頁版，是無套件依賴的靜態網頁，可本機使用，也可接 Firebase + Cloudflare Pages 給室友線上共用。

## 本機執行

Codex 桌面環境可用 bundled Node：

```bash
/Users/jaytsai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/dev-server.mjs
```

開啟 `http://localhost:4173`。

## 目前功能

- 月份總覽：保留餘額重點顯示。
- 新增與刪除收支紀錄。
- 收入金額顯示綠色，支出金額顯示紅色。
- 修改紀錄 audit log。
- 匯出目前資料為 JSON。
- 可設定 Firebase Authentication + Firestore 做雲端同步。
- 雲端模式下，必須登入才能觀看帳本；登入 email 綁定成員後才能編輯。

未設定 Firebase 時，資料會存在瀏覽器 `localStorage`。設定 Firebase 後，登入即可同步到雲端。

## 雲端共享

設定步驟見 `docs/deploy-cloudflare-firebase.md`。

## 過往 Numbers 紀錄

目前資料夾內有 `六張犁租屋公積金 V.Jun08.numbers`。建議用 Numbers 匯出成 Excel 或 CSV，再做匯入，會比直接解析 `.numbers` 內部格式穩定。

CSV 欄位可使用中文或英文欄名：`日期/date`、`類型/type`、`項目/title`、`金額/amount`、`成員/member`、`分類/category`、`備註/note`。

```bash
/Users/jaytsai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/import-csv.mjs exported-records.csv
```

工具會輸出整理後的 JSON，包含 `members`、`transactions`。

## 測試

```bash
/Users/jaytsai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check src/app.js
```

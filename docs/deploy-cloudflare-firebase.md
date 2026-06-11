# Cloudflare Pages + Firebase 設定

## 1. Firebase

1. 到 Firebase Console 建立專案。
2. 啟用 Authentication，登入方式選 Email/Password。
3. 建立 Firestore Database。
4. Firestore Rules 使用專案根目錄的 `firestore.rules`。
5. 建立 Web App，複製 Firebase config。
6. 編輯 `src/firebase-config.js`：

```js
export const firebaseConfig = {
  enabled: true,
  apiKey: "你的 apiKey",
  authDomain: "你的專案.firebaseapp.com",
  projectId: "你的 projectId",
  appId: "你的 appId"
};
```

## 2. Cloudflare Pages

1. 把這個資料夾推到 GitHub repository。
2. 到 Cloudflare Pages 建立 project，連接該 repository。
3. Build command 留空。
4. Build output directory 設為 `.`。
5. 部署完成後，Cloudflare 會提供公開網址。

## 3. 使用流程

1. 開啟 Cloudflare Pages 網址。
2. 第一位使用者用左側「建立帳號」建立帳號。
3. 登入後，App 會把目前本機資料寫入 Firestore。
4. 其他室友建立帳號或登入後，會讀取同一份 `houseFunds/default` 帳本資料。

## 4. 注意

- `firebaseConfig` 不是密碼，但 Firestore Rules 一定要設定，避免未登入者讀寫。
- 第一版所有登入使用者都能讀寫同一份帳本。
- 後續如果要限制只有指定室友帳號可用，可以把 email allowlist 加進 Firestore Rules。

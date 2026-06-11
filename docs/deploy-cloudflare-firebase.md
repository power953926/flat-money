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
2. 使用者用左側「建立帳號」建立帳號。
3. 未登入者不能觀看帳本內容。
4. 第一位登入者可在成員的 `...` 選單中使用「綁定目前帳號」，把 email 綁到自己的成員。
5. 只有 email 已綁定成員的帳號可以新增、修改、刪除資料。
6. 其他室友建立帳號後，由已綁定成員的使用者協助把室友 email 綁定到對應成員。

## 4. 注意

- `firebaseConfig` 不是密碼，但 Firestore Rules 一定要設定，避免未登入者讀寫。
- Firestore Rules 目前要求登入後才能讀寫。
- 前端會再限制只有 email 已綁定成員的帳號可以編輯。

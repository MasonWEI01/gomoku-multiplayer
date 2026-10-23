# 五子棋線上對戰（公開網站版）

這是一個可公開部署的多人五子棋網站。不同電腦的玩家可透過房間碼加入同一局。

## 本地測試

```bash
cd gomoku-multiplayer
npm install
npm start
```

然後瀏覽器打開 `http://localhost:3000`

## 部署成公開網站（推薦 Render）

1. 把整個 `gomoku-multiplayer` 資料夾上傳到 GitHub 倉庫。
2. 到 [Render](https://render.com) 註冊並登入。
3. New → Web Service → 連接你的 GitHub 倉庫。
4. 設定：
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node
5. 部署完成後會得到一個公開網址（例如 `https://your-gomoku.onrender.com`）。

任何人打開這個網址就能玩：
- 一方點「建立房間」，把房間碼給朋友
- 朋友打開同一網址，輸入房間碼點「加入房間」

## 其他部署平台

- **Railway**：同樣支援 Node.js，上傳後自動偵測。
- **Fly.io**：也支援。
- **Vercel / Netlify**：不適合（需要長連線的 Socket.io 伺服器）。

## 功能

- 15×15 標準五子棋
- 建立房間 / 加入房間（5 位房間碼）
- 即時同步落子
- 自動判斷五子連珠獲勝
- 重新開始（雙方同步）
- 對手離開提示

部署後就是一個真正的公開多人遊戲網站。

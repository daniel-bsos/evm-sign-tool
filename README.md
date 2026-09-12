**繁體中文** | **[English](README.en.md)**

# EVM 私鑰產製及簽名工具（演示用）

單一 HTML 檔的 EVM 私鑰產製與訊息簽名工具。所有密碼學運算均在瀏覽器本地執行，全程零網路請求，私鑰不會離開您的裝置。本專案以 MIT 授權開源，原始碼公開供任何人自由檢視、使用與修改。

## 功能

- 產製隨機私鑰（BIP-39，128-bit entropy，來源為 `crypto.getRandomValues`）
- 以密碼加密為標準 Keystore JSON 下載（scrypt N=131072），並可重新匯入解密
- 一般訊息簽名（EIP-191 personal_sign）
- EIP-712 typed data 簽名，含 domain 解析預覽
- 私鑰載入後 100 秒自動清除，回到未匯入狀態
- 支援連接 Ledger 硬體錢包（WebHID）簽署 EIP-191 與 EIP-712，私鑰不經過瀏覽器，全程留在裝置上

## 使用方式

下載 `index.html`，直接以瀏覽器開啟即可，無需安裝與網路連線。

## 安全注意事項

本工具定位為演示與測試用途。請勿以持有主網資產的私鑰操作本工具。

EIP-712 簽名具有實質授權效力。Permit、Permit2 等類型的簽名等同離線授權轉移資產，簽名前請務必確認 JSON 內容來源可信。

建議在離線環境或乾淨的瀏覽器 profile 中使用。瀏覽器擴充功能具有讀取頁面記憶體的能力。

以私鑰檔案簽名時，解密後的私鑰會短暫留在瀏覽器記憶體中（見上方自動清除機制）；透過 Ledger 簽名則私鑰全程留在硬體裝置內，不會進入瀏覽器。兩種方式的信任等級不同，請依實際需求選擇。

下載後可比對 SHA-256 雜湊以確認檔案未遭修改，最新雜湊值公布於 Releases 頁面。

## 技術說明

內嵌 React 18、ethers.js 6.17.0 與 noble 系列密碼學函式庫，無任何 CDN 或外部依賴。無 localStorage、無 cookie、無任何網路傳輸。

連接 Ledger 時另外動態載入 `@ledgerhq/device-management-kit` 等四個套件，僅在使用者主動按下連接時才載入，沒用到 Ledger 功能就不會下載。WebHID 僅桌面版 Chrome 89+、Edge 89+、Opera 76+ 支援，Firefox、Safari 與所有行動瀏覽器均不支援。

## 原始碼與建置

原始碼位於 [`src/`](./src) 目錄，為 React + Vite 專案。根目錄的 `index.html` 即為建置產物。自行建置方式：

```bash
cd src
npm install
npm run build
```

建置結果輸出於 `src/dist/index.html`，為單一自包含檔案。因打包工具版本差異，自行建置的檔案不會與發布版逐位元相同，發布版的完整性請以 Releases 頁面的 SHA-256 雜湊為準。

## License

MIT. See [LICENSE](./LICENSE).

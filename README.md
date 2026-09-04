# EVM 私鑰產製及簽名工具（演示用）

單一 HTML 檔的 EVM 私鑰產製與訊息簽名工具。所有密碼學運算均在瀏覽器本地執行，全程零網路請求，私鑰不會離開您的裝置。本專案以 MIT 授權開源，原始碼公開供任何人自由檢視、使用與修改。

## 功能

- 產製隨機私鑰（BIP-39，128-bit entropy，來源為 `crypto.getRandomValues`）
- 以密碼加密為標準 Keystore JSON 下載（scrypt N=131072），並可重新匯入解密
- 一般訊息簽名（EIP-191 personal_sign）
- EIP-712 typed data 簽名，含 domain 解析預覽
- 私鑰載入後 100 秒自動清除，回到未匯入狀態

## 使用方式

下載 `index.html`，直接以瀏覽器開啟即可，無需安裝與網路連線。

## 安全注意事項

本工具定位為演示與測試用途。請勿以持有主網資產的私鑰操作本工具。

EIP-712 簽名具有實質授權效力。Permit、Permit2 等類型的簽名等同離線授權轉移資產，簽名前請務必確認 JSON 內容來源可信。

建議在離線環境或乾淨的瀏覽器 profile 中使用。瀏覽器擴充功能具有讀取頁面記憶體的能力。

下載後可比對 SHA-256 雜湊以確認檔案未遭修改，最新雜湊值公布於 Releases 頁面。

## 技術說明

內嵌 React 18、ethers.js 6.17.0 與 noble 系列密碼學函式庫，無任何 CDN 或外部依賴。無 localStorage、無 cookie、無任何網路傳輸。

---

# EVM Key Generation & Signing Tool (Demo)

A single-file HTML tool for EVM private key generation and message signing. All cryptographic operations run locally in your browser with zero network requests. Your private key never leaves your device. Open-sourced under the MIT License.

## Features

- Random key generation (BIP-39, 128-bit entropy via `crypto.getRandomValues`)
- Password-encrypted Keystore JSON export (scrypt N=131072) and re-import
- Personal message signing (EIP-191)
- EIP-712 typed data signing with domain preview
- Auto-clear: the loaded key is wiped from memory after 100 seconds

## Usage

Download `index.html` and open it in a browser. No installation or network connection required.

## Security Notes

This tool is intended for demonstration and testing. Do not use it with keys holding mainnet assets.

EIP-712 signatures carry real authorization power. Permit-style signatures can authorize asset transfers offline. Verify the source of any JSON before signing.

Use offline or in a clean browser profile. Browser extensions can read page memory.

Verify the SHA-256 checksum of downloaded files against the value published on the Releases page.

## Technical Notes

Bundles React 18, ethers.js 6.17.0, and the noble cryptography libraries. No CDN, no external dependencies, no localStorage, no cookies, no network transmission of any kind.

## License

MIT. See [LICENSE](./LICENSE).

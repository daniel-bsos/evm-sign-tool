import { useEffect, useRef, useState } from 'react'
import { Wallet, Signature } from 'ethers'
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  PenLine,
  ShieldCheck,
  Upload,
  Usb,
  X,
} from 'lucide-react'
import logoUrl from './assets/bsos-logo.svg'

// 私鑰載入後的存活秒數。倒數歸零即清除記憶體，回到未匯入狀態。
const AUTO_CLEAR_SECONDS = 100

// ---------------------------------------------------------------------------
// Ledger（硬體錢包）
//
// 只支援預設路徑的第一個帳戶，跟 apps/gateway-web/src/lib/ledger.ts 的
// DEFAULT_PATH 同一個理由（DF-44）：Ledger Live 與 MetaMask 的路徑標準不同，
// 完整做法要掃兩種路徑比對帳戶名單，這裡先只做第一個帳戶。
// ---------------------------------------------------------------------------

const LEDGER_PATH = "44'/60'/0'/0/0"

/**
 * 這份表格是把 `device-signer-kit-ethereum` 跟 `device-management-kit` 兩包
 * 編譯後原始碼裡所有 `signer.eth.steps.*`／可能經過的 `os.*.steps.*` 常數
 * 全部翻出來對出來的，不是挑幾個常見的翻——上一輪漏了 `web3ChecksOptIn`／
 * `provideGenericContext`／`os.waitForAppAndVersion.*` 就是這樣被漏掉的。
 * `installOrUpdateApps`／`installLanguagePackage`／`listAppsWithMetadata` 那幾類
 * 是韌體與 App 目錄管理用的，這個工具的 connect→getAddress→sign 走不到，不翻。
 */
const LEDGER_STEP_LABELS = {
  // signer.eth.steps.*（device-signer-kit-ethereum，完整列表）
  'signer.eth.steps.openApp': '打開裝置上的 Ethereum app',
  'signer.eth.steps.getAppConfig': '讀取 app 設定',
  'signer.eth.steps.getAddress': '取得地址',
  'signer.eth.steps.buildContext': '準備簽署內容',
  'signer.eth.steps.buildContexts': '準備簽署內容',
  'signer.eth.steps.provideContext': '傳送欄位到裝置',
  'signer.eth.steps.provideContexts': '傳送欄位到裝置',
  'signer.eth.steps.provideGenericContext': '傳送欄位到裝置',
  'signer.eth.steps.detectBlindSigning': '檢查是否需要盲簽',
  'signer.eth.steps.blindSignTransactionFallback': '裝置不支援完整顯示，改用盲簽模式重試',
  'signer.eth.steps.web3ChecksOptIn': '詢問是否啟用 Web3 Checks（詐騙防護），請在裝置上選擇',
  'signer.eth.steps.web3ChecksOptInResult': '已收到 Web3 Checks 設定',
  'signer.eth.steps.parseTransaction': '解析交易內容',
  'signer.eth.steps.signTransaction': '等待你在裝置上確認並簽署',
  'signer.eth.steps.signTypedData': '等待你在裝置上確認並簽署',
  'signer.eth.steps.signTypedDataLegacy': '等待你在裝置上確認並簽署（舊版相容模式）',
  'signer.eth.steps.signPersonalMessage': '等待你在裝置上確認並簽署',
  'signer.eth.steps.verifySafeAddress': '核對地址',
  // getAddress／signMessage 底層是「開 app、再呼叫指令」這個通用殼（CallTaskInAppDeviceAction）
  'os.callTaskInApp.steps.openApp': '打開裝置上的 Ethereum app',
  'os.callTaskInApp.steps.callTask': '執行裝置指令',
  // 每一次 getAddress／sign 內部都會先確認裝置狀態、開對 app，這些是那一段的子步驟
  'os.getDeviceStatus.steps.onboardCheck': '確認裝置已完成初始化設定',
  'os.getDeviceStatus.steps.waitForAppAndVersion': '確認目前開啟的 app 與版本',
  'os.waitForAppAndVersion.steps.unlockDevice': '裝置鎖著，請在裝置上輸入 PIN 解鎖',
  'os.waitForAppAndVersion.steps.getAppAndVersion': '讀取目前開啟的 app 與版本',
  'os.openApp.steps.onboardCheck': '確認裝置已完成初始化設定',
  'os.openApp.steps.listApps': '讀取裝置上已安裝的 app',
  'os.openApp.steps.getDeviceStatus': '確認目前開啟的 app',
  'os.openApp.steps.dashboardCheck': '確認裝置是否在主畫面',
  'os.openApp.steps.confirmOpenApp': '請在裝置上確認開啟 Ethereum app',
  'os.openApp.steps.closeApp': '正在關閉目前開啟的 app',
}
const translateLedgerStep = (step) => LEDGER_STEP_LABELS[step] ?? step

/**
 * `requiredUserInteraction` 是 SDK 專門用來講「裝置現在要你做什麼」的欄位，
 * 跟 `step`（內部進度）是兩件事——`step` 在巢狀 device action 裡會借用子動作
 * 自己的字串（例如 OpenApp 內部跑 GetDeviceStatus 時，`step` 回的是
 * `os.getDeviceStatus.steps.onboardCheck`，不是 `os.openApp.steps.getDeviceStatus`），
 * 裝置螢幕跳「Open Ethereum」的當下，畫面對得上的是這個欄位變成
 * `confirm-open-app`，不是 `step` 換了值。優先看這個欄位。
 */
const LEDGER_INTERACTION_LABELS = {
  'unlock-device': '裝置鎖著，請在裝置上輸入 PIN 解鎖',
  'allow-secure-connection': '請在裝置上允許建立安全連線',
  'confirm-open-app': '請在裝置上確認開啟 Ethereum app',
  'sign-transaction': '請在裝置上核對交易內容並確認簽署',
  'sign-typed-data': '請在裝置上核對欄位並確認簽署',
  'sign-personal-message': '請在裝置上核對訊息並確認簽署',
  'allow-list-apps': '請在裝置上允許讀取已安裝的 app 清單',
  'verify-address': '請在裝置上核對地址',
  'sign-delegation-authorization': '請在裝置上確認簽署委任授權',
  'web3-checks-opt-in': '請在裝置上選擇是否啟用 Web3 Checks（詐騙防護）',
  'verify-safe-address': '請在裝置上核對 Safe 地址',
}

// 把一次 device action 的中間狀態轉成一句給人看的中文：能講清楚「現在要你做什麼」
// 就優先講那個，沒有才退回講「目前跑到哪一步」。
function describeLedgerProgress(intermediateValue) {
  const interaction = intermediateValue?.requiredUserInteraction
  if (interaction && interaction !== 'none' && LEDGER_INTERACTION_LABELS[interaction]) {
    return LEDGER_INTERACTION_LABELS[interaction]
  }
  const step = intermediateValue?.step
  if (step) return `裝置狀態：${translateLedgerStep(step)}`
  return null
}

const hidSupported = () => typeof navigator !== 'undefined' && 'hid' in navigator

// 只有真的按下「連接裝置」才載入這包依賴，沒人用 Ledger 的話一個 byte 都不進來
let ledgerSdk = null
async function loadLedgerSdk() {
  if (ledgerSdk) return ledgerSdk
  const [
    { ConsoleLogger, DeviceManagementKitBuilder, DeviceActionStatus },
    { webHidTransportFactory },
    { SignerEthBuilder },
    { ContextModuleBuilder, ContextModuleChainID },
  ] = await Promise.all([
    import('@ledgerhq/device-management-kit'),
    import('@ledgerhq/device-transport-kit-web-hid'),
    import('@ledgerhq/device-signer-kit-ethereum'),
    import('@ledgerhq/context-module'),
  ])
  const dmk = new DeviceManagementKitBuilder()
    .addLogger(new ConsoleLogger())
    .addTransport(webHidTransportFactory)
    .build()
  /**
   * 拿掉兩個 CDN 呼叫，維持這個工具「零網路」的賣點：clear-signing 描述檔是選配的，
   * struct 定義與欄位值在描述檔判斷之前就已經送進裝置了。typed-data 專用的 loader
   * 是另一條線，removeDefaultLoaders() 不影響它，得另外補一個永遠回空陣列的假 loader。
   */
  const offlineContextModule = new ContextModuleBuilder({})
    .setChain(ContextModuleChainID.Ethereum)
    .removeDefaultLoaders()
    .addTypedDataLoader({ load: async () => [] })
    .build()
  ledgerSdk = { dmk, DeviceActionStatus, SignerEthBuilder, offlineContextModule }
  return ledgerSdk
}

function runLedgerAction(observable, onProgress) {
  return new Promise((resolve, reject) => {
    observable.subscribe({
      next: (state) => {
        switch (state.status) {
          case ledgerSdk.DeviceActionStatus.NotStarted:
          case ledgerSdk.DeviceActionStatus.Pending: {
            const text = describeLedgerProgress(state.intermediateValue)
            if (text) onProgress?.(text)
            break
          }
          case ledgerSdk.DeviceActionStatus.Completed:
            resolve(state.output)
            break
          case ledgerSdk.DeviceActionStatus.Error:
            reject(state.error)
            break
          case ledgerSdk.DeviceActionStatus.Stopped:
            reject(new Error('操作已取消'))
            break
        }
      },
      error: reject,
    })
  })
}

/**
 * Ledger SDK 的錯誤是打了 `_tag` 的物件，不是原生 Error，`err.message`
 * 常常讀不到有意義的內容。這份表格直接讀套件本身編譯後的原始碼整理
 * （`node_modules/@ledgerhq/*​/lib/esm`），涵蓋 connect／getAddress／sign
 * 這條路徑會經過的四個套件（device-management-kit／
 * device-transport-kit-web-hid／device-signer-kit-ethereum／
 * context-module）目前版本會丟出的所有 `_tag`——文件沒有把這份清單列全。
 *
 * 沒收進來的是 internal/config、internal/manager-api、internal/secure-channel
 * 那幾類（韌體更新／App 目錄／安全通道金鑰交換），這個工具的
 * connect→getAddress→sign 這條路不會走到那邊，故意不翻。
 */
const LEDGER_TAG_LABELS = {
  // api/Error.js
  UnknownDeviceExchangeError: '裝置回應時發生未預期的錯誤，請重新插拔裝置後再試一次。',
  DeviceBusyError: '裝置正忙碌中，請稍後再試一次。',
  InvalidArgumentError: '傳給裝置的參數不合法。',
  // api/command/Errors.js
  InvalidStatusWordError: '裝置回應的狀態碼無法解析。',
  InvalidResponseFormatError: '裝置回應的格式不正確。',
  // api/device-action/os/Errors.js
  DeviceNotOnboardedError: '這台裝置還沒完成初始化設定（尚未設定 PIN／助記詞）。',
  DeviceLockedError: '裝置鎖著，請先在裝置上輸入 PIN 解鎖。',
  UnsupportedFirmwareDAError: '裝置韌體版本不支援這個操作，請更新韌體。',
  RefusedByUserDAError: '你在裝置上取消了這次操作。',
  AppAlreadyInstalledDAError: '裝置上已經安裝這個 app。',
  OutOfMemoryDAError: '裝置空間不足。',
  UnknownDAError: '發生未知的裝置錯誤。',
  UnsupportedApplicationDAError: '裝置上目前開啟的 app 不支援這個操作，請確認已開啟 Ethereum app。',
  MissingLanguagePackagesForOSDAError: '裝置缺少作業系統語言包。',
  MissingLanguagePackageDAError: '裝置缺少語言包。',
  DeleteLanguagePackDAError: '刪除裝置語言包失敗。',
  NetworkDAError: '網路錯誤。',
  // api/device-action/task/Errors.js
  InvalidGetFirmwareMetadataResponseError: '讀取裝置韌體資訊失敗。',
  GetApplicationsMetadataTaskError: '讀取裝置已安裝 app 清單失敗。',
  // api/apdu/utils/AppBuilderError.js
  ValueOverflow: '要簽署的內容超過裝置單次可處理的長度上限。',
  DataOverflow: '要簽署的內容超過裝置單次可處理的長度上限。',
  HexaString: '要簽署的內容包含無法編碼的欄位。',
  // api/transport/model/Errors.js（USB／WebHID 這一層）
  GeneralDmkError: '裝置連線發生錯誤。',
  DeviceAlreadyDiscoveredError: '已經在掃描這台裝置了。',
  DeviceNotRecognizedError: '無法辨識這個裝置，請確認接的是 Ledger。',
  NoAccessibleDeviceError: '找不到可以連接的裝置，請確認 Ledger 已插上且已解鎖。',
  ConnectionOpeningError: '建立裝置連線失敗，請重新插拔裝置後再試一次。',
  UnknownDeviceError: '無法辨識這個裝置。',
  TransportNotSupportedError: '這個瀏覽器不支援 WebHID，請改用 Chrome 或 Edge。',
  SendApduConcurrencyError: '前一個裝置指令還沒結束，請稍後再試。',
  SendApduTimeoutError: '裝置沒有在時間內回應，請確認裝置沒有卡在某個畫面。',
  SendCommandTimeoutError: '裝置沒有在時間內回應，請確認裝置沒有卡在某個畫面。',
  SendApduEmptyResponseError: '裝置沒有回傳任何內容。',
  DisconnectError: '中斷裝置連線時發生錯誤。',
  ReconnectionFailedError: '重新連接裝置失敗，請重新插拔裝置。',
  DeviceNotInitializedError: '裝置連線尚未就緒。',
  NoTransportsProvidedError: '沒有可用的連線方式。',
  TransportAlreadyExistsError: '這種連線方式已經註冊過了。',
  DeviceDisconnectedWhileSendingError: '傳送指令時裝置斷線了，請重新連接。',
  AlreadySendingApduError: '前一個指令還在傳送中，請稍後再試。',
  DeviceDisconnectedBeforeSendingApdu: '裝置在送出指令前就斷線了，請重新連接。',
  NoTransportProvidedError: '沒有可用的連線方式。',
  // device-transport-kit-web-hid
  WebHidTransportNotSupportedError: '這個瀏覽器不支援 WebHID，請改用 Chrome 或 Edge。',
  WebHidSendReportError: '透過 USB 傳送資料給裝置失敗，請重新插拔裝置。',
}

/**
 * device-signer-kit-ethereum：Ethereum app 依 APDU 狀態碼回的錯誤
 * （`EthAppCommandError.errorCode`），來源是該套件的 `ethAppErrors.js`。
 */
const LEDGER_ETH_STATUS_LABELS = {
  6001: '裝置模式檢查失敗。',
  6501: '不支援這種交易類型。',
  6502: 'chainId 轉換時緩衝區不足。',
  6800: '裝置內部錯誤，請回報。',
  6982: '你在裝置上取消了這次操作。',
  6983: '傳送給裝置的資料長度不正確。',
  6984: '裝置上沒有安裝對應的 plugin。',
  6985: '裝置回報條件不符（可能是你在裝置上取消了操作）。',
  '6a00': '裝置回應錯誤，但沒有附帶說明。',
  '6a80': '傳送給裝置的資料不合法。',
  '6a84': '裝置記憶體不足。',
  '6a88': '裝置上找不到對應資料。',
  '6b00': '傳送給裝置的參數不正確。',
  '6d00': '裝置不支援這個指令（可能是舊機型或舊版 app）。',
  '6e00': '裝置回應類別參數不正確。',
  '6f00': '裝置內部技術性錯誤，請回報。',
  '911c': '裝置不支援這個指令。',
}

function explainLedgerError(err) {
  if (!hidSupported()) return '這個瀏覽器不支援 WebHID，請改用 Chrome 或 Edge。'
  const tag = err?._tag
  if (tag === 'EthAppCommandError' && LEDGER_ETH_STATUS_LABELS[err?.errorCode]) {
    return LEDGER_ETH_STATUS_LABELS[err.errorCode]
  }
  if (tag && LEDGER_TAG_LABELS[tag]) return LEDGER_TAG_LABELS[tag]
  const msg =
    err?.message ??
    err?._tag ??
    err?.errorCode ??
    (() => {
      try {
        return JSON.stringify(err)
      } catch {
        return String(err)
      }
    })()
  if (/no device (was )?selected|cancell?ed|noaccessibledevice/i.test(msg)) {
    return '沒有選擇裝置，或是你在瀏覽器彈窗按了取消。請確認 Ledger 已插上、解鎖，再按一次連接。'
  }
  return msg
}

// ---------------------------------------------------------------------------
// 密碼強度規則
// ---------------------------------------------------------------------------

const PASSWORD_RULES = [
  { key: 'length', label: '至少 12 個字元', test: (s) => s.length >= 12 },
  { key: 'upper', label: '包含大寫字母 (A-Z)', test: (s) => /[A-Z]/.test(s) },
  { key: 'lower', label: '包含小寫字母 (a-z)', test: (s) => /[a-z]/.test(s) },
  { key: 'digit', label: '包含數字 (0-9)', test: (s) => /[0-9]/.test(s) },
  { key: 'special', label: '包含特殊字元 (!@#$%^&*…)', test: (s) => /[^A-Za-z0-9]/.test(s) },
]

const isPasswordValid = (pw) => PASSWORD_RULES.every((r) => r.test(pw))

function PasswordChecklist({ password }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password)
        return (
          <div key={rule.key} className="flex items-center gap-1.5">
            <span
              className={ok ? 'text-green-500' : 'text-slate-400'}
              style={{ fontSize: '0.8rem' }}
            >
              {ok ? '✓' : '○'}
            </span>
            <span
              className={ok ? 'text-green-600' : 'text-slate-500'}
              style={{ fontSize: '0.78rem' }}
            >
              {rule.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 複製按鈕
// ---------------------------------------------------------------------------

function copyText(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = (text) => {
    try {
      copyText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }
  return [copied, copy]
}

function CopyButton({ text }) {
  const [copied, copy] = useCopy()
  if (!text) return null
  return (
    <button
      onClick={() => copy(text)}
      className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
        copied ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
      }`}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? '已複製' : '複製'}
    </button>
  )
}

function Field({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-100 px-4 py-2.5 flex items-center justify-between gap-3 min-h-[44px]">
      <div className="flex items-baseline gap-3 min-w-0">
        <span className="text-slate-400 flex-shrink-0" style={{ fontSize: '0.78rem' }}>
          {label}
        </span>
        <span
          className="text-slate-800 font-mono break-all"
          style={{ fontSize: '0.88rem', lineHeight: '1.5' }}
        >
          {value || <span className="text-slate-300">—</span>}
        </span>
      </div>
      <CopyButton text={value} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 私鑰產製對話框
// ---------------------------------------------------------------------------

function GenerateModal({ onGenerated, onClose }) {
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const valid = isPasswordValid(password)

  const generate = async () => {
    if (!valid) return
    setBusy(true)
    try {
      // BIP-39 隨機錢包，entropy 來源為瀏覽器 crypto.getRandomValues
      const wallet = Wallet.createRandom()
      // 以密碼加密為標準 Keystore JSON（ethers 預設 scrypt N=131072）
      const keystoreJson = await wallet.encrypt(password)
      const fileName = `keystore-${wallet.address.slice(2, 10).toLowerCase()}.json`
      const blob = new Blob([keystoreJson], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
      onGenerated(wallet, keystoreJson, fileName)
    } catch {
      /* ignore */
    }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl space-y-5 border border-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="text-black font-semibold" style={{ fontSize: '1.1rem' }}>
            設定加密密碼
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <p className="text-slate-500" style={{ fontSize: '0.88rem' }}>
          產製私鑰前，請先設定一組加密密碼。私鑰將以此密碼加密後下載，下次匯入時需要輸入相同密碼。
        </p>
        <div className="space-y-3">
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="設定加密密碼…"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && valid && generate()}
              autoFocus
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-11 text-black placeholder-slate-400 outline-none focus:border-slate-500 transition"
              style={{ fontSize: '1rem' }}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {password.length > 0 && <PasswordChecklist password={password} />}
        </div>
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
            style={{ fontSize: '0.95rem' }}
          >
            取消
          </button>
          <button
            onClick={generate}
            disabled={!valid || busy}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500 text-white hover:bg-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium"
            style={{ fontSize: '0.95rem' }}
          >
            <KeyRound size={16} />
            {busy ? '產製中…' : '產製並下載'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 產製成功對話框
// ---------------------------------------------------------------------------

function SuccessModal({ fileName, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <ShieldCheck size={32} className="text-green-600" />
          </div>
          <h2 className="text-black font-bold" style={{ fontSize: '1.2rem' }}>
            私鑰產製成功
          </h2>
          <p className="text-slate-500" style={{ fontSize: '0.9rem' }}>
            已自動下載加密私鑰檔案：
          </p>
          <code
            className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 break-all"
            style={{ fontSize: '0.85rem' }}
          >
            {fileName}
          </code>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
          <p className="text-amber-800 font-medium" style={{ fontSize: '0.88rem' }}>
            ⚠️ 請妥善保存此檔案與密碼
          </p>
          <p className="text-amber-700" style={{ fontSize: '0.83rem' }}>
            檔案已使用您設定的密碼加密，私鑰無法從檔案直接讀取。下次使用本工具時，請點選「匯入私鑰」選取此檔案，並輸入相同密碼進行解密。
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-700 transition-colors font-medium"
          style={{ fontSize: '1rem' }}
        >
          確認
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 主工具
// ---------------------------------------------------------------------------

function SignTool() {
  // 簽名來源：私鑰檔案，或 Ledger 硬體
  const [source, setSource] = useState('privatekey') // 'privatekey' | 'ledger'

  // 私鑰與地址
  const [wallet, setWallet] = useState(null)
  const [address, setAddress] = useState('')
  const [showGenerate, setShowGenerate] = useState(false)
  const [generatedFile, setGeneratedFile] = useState(null)

  // Keystore 匯入
  const fileInputRef = useRef(null)
  const [keystoreText, setKeystoreText] = useState(null)
  const [keystoreName, setKeystoreName] = useState('')
  const [decryptPw, setDecryptPw] = useState('')
  const [showDecryptPw, setShowDecryptPw] = useState(false)
  const [decryptError, setDecryptError] = useState('')
  const [decrypting, setDecrypting] = useState(false)

  /**
   * Ledger：dmk/signerEth 不是要 render 的東西，放 ref。
   * 位址故意跟私鑰那邊的 `address` 分開放──兩個來源切 tab 不會互相斷線
   * （見 switchSource），共用一個 state 的話，某一邊改了位址會把另一邊蓋掉。
   */
  const ledgerRef = useRef({}) // { sessionId, signerEth, cancel }
  const [ledgerAddress, setLedgerAddress] = useState('')
  const [ledgerConnecting, setLedgerConnecting] = useState(false)
  const [ledgerStatus, setLedgerStatus] = useState(null) // { text, cls: 'pending'|'ok'|'err' }
  const [ledgerSigning, setLedgerSigning] = useState(false)
  const [ledgerStep, setLedgerStep] = useState('')

  // 簽名輸入
  const [mode, setMode] = useState('personal') // 'personal' | 'eip712'
  const [message, setMessage] = useState('')
  const [typedJson, setTypedJson] = useState('')
  const [typedData, setTypedData] = useState(null)
  const [signError, setSignError] = useState('')

  // 簽名輸出
  const [signature, setSignature] = useState('')
  const [sigR, setSigR] = useState('')
  const [sigS, setSigS] = useState('')
  const [sigV, setSigV] = useState('')
  const [signedSource, setSignedSource] = useState('')

  const clearOutputs = () => {
    setSignature('')
    setSigR('')
    setSigS('')
    setSigV('')
  }

  const clearWallet = () => {
    setWallet(null)
    setAddress('')
    clearOutputs()
  }

  const clearPendingKeystore = () => {
    setKeystoreText(null)
    setKeystoreName('')
    setDecryptPw('')
    setDecryptError('')
  }

  const ledgerDisconnect = async () => {
    const { sessionId } = ledgerRef.current
    ledgerRef.current = {}
    if (sessionId && ledgerSdk) {
      await ledgerSdk.dmk.disconnect({ sessionId }).catch(() => {})
    }
    setLedgerAddress('')
    setLedgerStatus(null)
    clearOutputs()
  }

  /**
   * 切 tab 純粹是換畫面，兩邊各自的狀態都不動。私鑰的存活由 AUTO_CLEAR_SECONDS
   * 那顆倒數計時器管（跟 `wallet` 綁定，不管你在哪個 tab 都照樣倒數），要清有
   * 「清除」按鈕；Ledger 的連線留給「中斷連接」按鈕管。這裡曾經在切 tab 時
   * 連帶清掉兩邊的東西，結果是切過去看一眼又切回來，私鑰跟裝置連線都得重來一次
   * ——把「換頁籤」跟「清掉秘密」這兩件事混成一件事了。
   */
  const switchSource = (next) => {
    if (next === source) return
    setSignError('')
    setSource(next)
  }

  const ledgerConnect = async () => {
    setLedgerConnecting(true)
    setLedgerStatus({ text: '連接中，請看瀏覽器裝置選擇器…', cls: 'pending' })
    let discoverySub
    try {
      const { dmk, SignerEthBuilder, offlineContextModule } = await loadLedgerSdk()
      const device = await new Promise((resolve, reject) => {
        discoverySub = dmk.startDiscovering({}).subscribe({ next: resolve, error: reject })
      })
      discoverySub.unsubscribe()
      // 裝置已經選好，瀏覽器選擇器已經關了，「請看瀏覽器裝置選擇器」這句話這時候是舊的、不對的，
      // 這裡到 getAddress 那句狀態文字之間曾經是一段沒有任何提示的空白（使用者反映像卡住的讀取中）
      setLedgerStatus({ text: '建立連線中…', cls: 'pending' })
      const sessionId = await dmk.connect({ device })
      const signerEth = new SignerEthBuilder({ dmk, sessionId })
        .withContextModule(offlineContextModule)
        .build()
      ledgerRef.current = { sessionId, signerEth }

      setLedgerStatus({ text: '向 Ledger 要地址（請確認 Ethereum app 已開啟）…', cls: 'pending' })
      const { observable } = signerEth.getAddress(LEDGER_PATH)
      const out = await runLedgerAction(observable, (text) => setLedgerStatus({ text, cls: 'pending' }))
      setLedgerAddress(out.address)
      setLedgerStatus({ text: `已連接成功：${out.address}`, cls: 'ok' })
    } catch (err) {
      discoverySub?.unsubscribe()
      if (ledgerRef.current.sessionId) {
        await ledgerSdk?.dmk.disconnect({ sessionId: ledgerRef.current.sessionId }).catch(() => {})
      }
      ledgerRef.current = {}
      setLedgerStatus({ text: `連接失敗：${explainLedgerError(err)}`, cls: 'err' })
    } finally {
      setLedgerConnecting(false)
    }
  }

  const cancelLedgerSign = () => {
    ledgerRef.current.cancel?.()
  }

  // 完整回到未匯入狀態（自動清除用，只有私鑰那條路會觸發）
  const resetAll = () => {
    clearWallet()
    setMessage('')
    setTypedJson('')
    setTypedData(null)
    setSignError('')
    clearPendingKeystore()
  }

  // 私鑰載入後倒數 AUTO_CLEAR_SECONDS 秒，歸零即清除
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CLEAR_SECONDS)
  useEffect(() => {
    if (!wallet) {
      setSecondsLeft(AUTO_CLEAR_SECONDS)
      return
    }
    setSecondsLeft(AUTO_CLEAR_SECONDS)
    const timer = setInterval(() => {
      setSecondsLeft((x) => (x > 1 ? x - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [wallet])
  useEffect(() => {
    if (wallet && secondsLeft === 0) resetAll()
  }, [secondsLeft, wallet]) // eslint-disable-line react-hooks/exhaustive-deps

  const onGenerated = (w, _keystoreJson, fileName) => {
    setWallet(w)
    setAddress(w.address)
    clearOutputs()
    setShowGenerate(false)
    clearPendingKeystore()
    setGeneratedFile(fileName)
  }

  const onPickFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setKeystoreName(file.name)
    setDecryptError('')
    setDecryptPw('')
    const reader = new FileReader()
    reader.onload = (ev) => setKeystoreText(ev.target?.result)
    reader.readAsText(file)
    e.target.value = ''
  }

  const decrypt = async () => {
    if (!keystoreText || !decryptPw) return
    setDecrypting(true)
    setDecryptError('')
    try {
      const w = await Wallet.fromEncryptedJson(keystoreText, decryptPw)
      setWallet(w)
      setAddress(w.address)
      clearOutputs()
      clearPendingKeystore()
    } catch {
      setDecryptError('密碼錯誤或檔案格式不合法')
    }
    setDecrypting(false)
  }

  const onTypedJsonChange = (text) => {
    setTypedJson(text)
    setTypedData(null)
    setSignError('')
    clearOutputs()
    if (!text.trim()) return
    try {
      const parsed = JSON.parse(text)
      if (!parsed.types || !parsed.primaryType || !parsed.domain || !parsed.message) {
        setSignError('JSON 缺少必要欄位（types、primaryType、domain、message）')
        return
      }
      // ethers 會自行加入 EIP712Domain，傳入時需移除
      const types = { ...parsed.types }
      delete types.EIP712Domain
      setTypedData({
        domain: parsed.domain,
        types,
        primaryType: parsed.primaryType,
        message: parsed.message,
      })
    } catch {
      setSignError('JSON 格式錯誤，請確認是否為有效的 JSON')
    }
  }

  const signWithPrivateKey = async () => {
    if (!wallet) return
    try {
      let sig = ''
      if (mode === 'personal') {
        if (!message) return
        // EIP-191 personal_sign
        sig = wallet.signMessageSync(message)
      } else {
        if (!typedData) {
          setSignError('請先貼上有效的 EIP-712 JSON')
          return
        }
        sig = await wallet.signTypedData(typedData.domain, typedData.types, typedData.message)
      }
      setSignature(sig)
      setSignedSource(mode === 'personal' ? message : JSON.stringify(typedData?.message))
      const parsed = Signature.from(sig)
      setSigR(parsed.r)
      setSigS(parsed.s)
      setSigV(String(parsed.v))
    } catch (err) {
      setSignError(err instanceof Error ? err.message : '簽名失敗')
    }
  }

  const signWithLedger = async () => {
    const { signerEth } = ledgerRef.current
    if (!signerEth) return
    setLedgerSigning(true)
    setLedgerStep('')
    try {
      let sig
      if (mode === 'personal') {
        if (!message) return
        const { observable, cancel } = signerEth.signMessage(LEDGER_PATH, message)
        ledgerRef.current.cancel = cancel
        sig = await runLedgerAction(observable, setLedgerStep)
      } else {
        if (!typedData) {
          setSignError('請先貼上有效的 EIP-712 JSON')
          return
        }
        const { observable, cancel } = signerEth.signTypedData(LEDGER_PATH, typedData)
        ledgerRef.current.cancel = cancel
        sig = await runLedgerAction(observable, setLedgerStep)
      }
      // sig.r／sig.s 本身就帶 0x 前綴
      const sigHex = `${sig.r}${sig.s.slice(2)}${sig.v.toString(16).padStart(2, '0')}`
      setSignature(sigHex)
      setSignedSource(mode === 'personal' ? message : JSON.stringify(typedData?.message))
      setSigR(sig.r)
      setSigS(sig.s)
      setSigV(String(sig.v))
    } catch (err) {
      setSignError(explainLedgerError(err))
    } finally {
      setLedgerSigning(false)
      setLedgerStep('')
      ledgerRef.current.cancel = null
    }
  }

  const sign = () => {
    setSignError('')
    return source === 'privatekey' ? signWithPrivateKey() : signWithLedger()
  }

  const hasSigner = source === 'privatekey' ? !!wallet : !!ledgerAddress
  const isStale =
    !!signature &&
    (mode === 'personal'
      ? message === signedSource
      : JSON.stringify(typedData?.message) === signedSource)
  const canSign =
    hasSigner &&
    (mode === 'personal' ? !!message : !!typedData) &&
    !isStale &&
    !(source === 'ledger' && ledgerSigning)
  const inputEdited = !!signature && !isStale

  return (
    <>
      {showGenerate && <GenerateModal onGenerated={onGenerated} onClose={() => setShowGenerate(false)} />}
      {generatedFile && <SuccessModal fileName={generatedFile} onClose={() => setGeneratedFile(null)} />}
      <div className="space-y-4">
        {/* 簽名來源 */}
        <div className="flex items-center gap-4">
          <span className="text-slate-700 font-medium" style={{ fontSize: '0.9rem' }}>
            簽名來源
          </span>
          <div className="flex rounded-lg overflow-hidden border border-slate-300" style={{ fontSize: '0.85rem' }}>
            <button
              onClick={() => switchSource('privatekey')}
              className={`px-4 py-1.5 transition-colors ${
                source === 'privatekey' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              私鑰檔案
            </button>
            <button
              onClick={() => switchSource('ledger')}
              className={`px-4 py-1.5 transition-colors border-l border-slate-300 ${
                source === 'ledger' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              Ledger
            </button>
          </div>
        </div>

        {source === 'privatekey' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-slate-700 font-medium" style={{ fontSize: '0.9rem' }}>
              私鑰
            </label>
            {wallet ? (
              <div className="flex items-center gap-2">
                <span className="text-green-600 font-medium" style={{ fontSize: '0.82rem' }}>
                  ✓ 私鑰已載入 · {secondsLeft} 秒後自動清除
                </span>
                <button
                  onClick={clearWallet}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                  style={{ fontSize: '0.82rem' }}
                >
                  <X size={14} />
                  清除
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowGenerate(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-400 transition-colors"
                  style={{ fontSize: '0.85rem' }}
                >
                  <KeyRound size={15} />
                  私鑰產製
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
                  style={{ fontSize: '0.85rem' }}
                >
                  <Upload size={15} />
                  匯入私鑰
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={onPickFile}
                />
              </div>
            )}
          </div>

          {/* Keystore 解密 */}
          {keystoreText && !wallet && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-600" style={{ fontSize: '0.85rem' }}>
                  <Upload size={14} className="text-slate-400" />
                  {keystoreName}
                </div>
                <button onClick={clearPendingKeystore} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              </div>
              <p className="text-slate-500" style={{ fontSize: '0.8rem' }}>
                輸入此檔案的加密密碼以解密：
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showDecryptPw ? 'text' : 'password'}
                    placeholder="輸入此 Keystore 的密碼…"
                    value={decryptPw}
                    onChange={(e) => {
                      setDecryptPw(e.target.value)
                      setDecryptError('')
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && decrypt()}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-black placeholder-slate-400 outline-none focus:border-slate-500 transition"
                    style={{ fontSize: '0.9rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowDecryptPw((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showDecryptPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <button
                  onClick={decrypt}
                  disabled={!decryptPw || decrypting}
                  className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  style={{ fontSize: '0.88rem' }}
                >
                  {decrypting ? '解密中…' : '解密'}
                </button>
              </div>
              {decryptError && (
                <p className="text-red-500" style={{ fontSize: '0.82rem' }}>
                  {decryptError}
                </p>
              )}
            </div>
          )}

          {wallet && <Field label="Address" value={address} />}
        </div>
        )}

        {source === 'ledger' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-slate-700 font-medium" style={{ fontSize: '0.9rem' }}>
              Ledger 裝置
            </label>
            {ledgerAddress ? (
              <div className="flex items-center gap-2">
                <span className="text-green-600 font-medium" style={{ fontSize: '0.82rem' }}>
                  ✓ 已連接
                </span>
                <button
                  onClick={ledgerDisconnect}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                  style={{ fontSize: '0.82rem' }}
                >
                  <X size={14} />
                  中斷連接
                </button>
              </div>
            ) : (
              <button
                onClick={ledgerConnect}
                disabled={ledgerConnecting || !hidSupported()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                style={{ fontSize: '0.85rem' }}
              >
                <Usb size={15} />
                {ledgerConnecting ? '連接中…' : '連接裝置'}
              </button>
            )}
          </div>

          {!hidSupported() && (
            <p className="text-amber-600" style={{ fontSize: '0.82rem' }}>
              這個瀏覽器不支援 WebHID，請改用 Chrome 或 Edge。
            </p>
          )}

          {ledgerStatus && (
            <p
              className={
                ledgerStatus.cls === 'ok'
                  ? 'text-green-600'
                  : ledgerStatus.cls === 'err'
                    ? 'text-red-500'
                    : 'text-amber-600'
              }
              style={{ fontSize: '0.82rem' }}
            >
              {ledgerStatus.text}
            </p>
          )}

          {ledgerAddress && <Field label="Address" value={ledgerAddress} />}
        </div>
        )}

        <div className="border-t border-slate-200" />

        {/* 簽名區 */}
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-slate-700 font-medium" style={{ fontSize: '0.9rem' }}>
              簽名方式
            </span>
            <div className="flex rounded-lg overflow-hidden border border-slate-300" style={{ fontSize: '0.85rem' }}>
              <button
                onClick={() => {
                  setMode('personal')
                  clearOutputs()
                  setSignError('')
                }}
                className={`px-4 py-1.5 transition-colors ${
                  mode === 'personal' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                一般訊息
              </button>
              <button
                onClick={() => {
                  setMode('eip712')
                  clearOutputs()
                  setSignError('')
                }}
                className={`px-4 py-1.5 transition-colors border-l border-slate-300 ${
                  mode === 'eip712' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                EIP-712
              </button>
            </div>
          </div>

          {mode === 'personal' && (
            <div>
              <label
                className={`font-medium transition-colors ${inputEdited ? 'text-black' : 'text-slate-500'}`}
                style={{ fontSize: '0.9rem' }}
              >
                要簽名的訊息
                {inputEdited && ' ✎'}
              </label>
              <textarea
                placeholder="輸入任意訊息內容..."
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value)
                  clearOutputs()
                }}
                rows={5}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-black placeholder-slate-400 outline-none focus:border-slate-500 transition resize-none"
                style={{ fontSize: '1.05rem' }}
              />
            </div>
          )}

          {mode === 'eip712' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-700" style={{ fontSize: '0.9rem' }}>
                    EIP-712 JSON
                  </label>
                  {typedData && (
                    <span
                      className="px-2 py-0.5 rounded bg-green-100 text-green-700 border border-green-200"
                      style={{ fontSize: '0.75rem' }}
                    >
                      ✓ 解析成功 · Primary: {typedData.primaryType}
                    </span>
                  )}
                </div>
                <textarea
                  value={typedJson}
                  onChange={(e) => onTypedJsonChange(e.target.value)}
                  placeholder="貼上完整 EIP-712 JSON，包含 types、primaryType、domain、message"
                  rows={14}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-black placeholder-slate-400 outline-none focus:border-slate-500 transition resize-none font-mono"
                  style={{ fontSize: '0.85rem' }}
                />
              </div>
              {typedData && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 space-y-1.5">
                  <p className="text-slate-400" style={{ fontSize: '0.75rem' }}>
                    解析結果
                  </p>
                  {[
                    ['Domain Name', String(typedData.domain.name ?? '')],
                    ['Chain ID', String(typedData.domain.chainId ?? '')],
                    ['Verifying Contract', String(typedData.domain.verifyingContract ?? '')],
                    ['Primary Type', typedData.primaryType],
                  ].map(
                    ([label, value]) =>
                      value && (
                        <div key={label} className="flex items-baseline gap-2">
                          <span className="text-slate-400 flex-shrink-0" style={{ fontSize: '0.75rem' }}>
                            {label}
                          </span>
                          <span className="text-slate-700 font-mono break-all" style={{ fontSize: '0.82rem' }}>
                            {value}
                          </span>
                        </div>
                      ),
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {signError && (
          <p className="text-red-500" style={{ fontSize: '0.85rem' }}>
            {signError}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={sign}
            disabled={!canSign}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium"
            style={{ fontSize: '1rem' }}
          >
            <PenLine size={18} />
            簽名
          </button>
          {source === 'ledger' && ledgerSigning && (
            <>
              <span className="text-amber-600" style={{ fontSize: '0.85rem' }}>
                {ledgerStep || '已送出到裝置，請在 Ledger 上核對並確認…'}
              </span>
              <button
                onClick={cancelLedgerSign}
                className="text-slate-400 hover:text-slate-600 underline underline-offset-2"
                style={{ fontSize: '0.82rem' }}
              >
                取消
              </button>
            </>
          )}
        </div>

        {signature && (
          <div className="space-y-2">
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-slate-400 mb-1" style={{ fontSize: '0.78rem' }}>
                  Signature（簽名結果）
                </p>
                <p className="text-black font-mono break-all" style={{ fontSize: '1rem', lineHeight: '1.6' }}>
                  {signature}
                </p>
              </div>
              <CopyButton text={signature} />
            </div>
            <div className="pt-2 space-y-1">
              {[
                ['r', sigR],
                ['s', sigS],
                ['v', sigV],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline gap-3 px-1">
                  <span className="text-slate-400 flex-shrink-0" style={{ fontSize: '0.78rem' }}>
                    {label}
                  </span>
                  <span
                    className="text-slate-500 font-mono break-all"
                    style={{ fontSize: '0.82rem', lineHeight: '1.5' }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// 版面
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <div className="min-h-screen bg-slate-100 p-6 flex flex-col items-center">
      <div
        className="w-full max-w-4xl flex items-end justify-between"
        style={{ marginTop: '2px', marginBottom: '28px' }}
      >
        <h1 className="font-bold text-black" style={{ fontSize: '1.3rem' }}>
          EVM 私鑰產製及簽名工具（演示用）
        </h1>
        <img src={logoUrl} alt="BSOS" className="object-contain" style={{ height: '28px' }} />
      </div>
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-lg px-8 py-7">
        <SignTool />
      </div>
      <div
        className="w-full max-w-4xl mt-6 px-1 text-center text-slate-400"
        style={{ fontSize: '0.8rem', lineHeight: '1.7' }}
      >
        <span>
          本工具僅供教學與演示，請勿使用持有實際資產的私鑰。所有運算均在瀏覽器本地執行，不傳送任何資料。原始碼以{' '}
          <a
            href="https://github.com/daniel-bsos/evm-sign-tool"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 hover:text-slate-600"
          >
            MIT License
          </a>{' '}
          開源，可自由使用、修改與散布。
        </span>
      </div>
    </div>
  )
}

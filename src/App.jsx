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
  X,
} from 'lucide-react'
import logoUrl from './assets/bsos-logo.svg'

// 私鑰載入後的存活秒數。倒數歸零即清除記憶體，回到未匯入狀態。
const AUTO_CLEAR_SECONDS = 100

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

  // 完整回到未匯入狀態（自動清除用）
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

  const sign = async () => {
    if (!wallet) return
    setSignError('')
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

  const isStale =
    !!signature &&
    (mode === 'personal'
      ? message === signedSource
      : JSON.stringify(typedData?.message) === signedSource)
  const canSign = !!wallet && (mode === 'personal' ? !!message : !!typedData) && !isStale
  const inputEdited = !!signature && !isStale

  return (
    <>
      {showGenerate && <GenerateModal onGenerated={onGenerated} onClose={() => setShowGenerate(false)} />}
      {generatedFile && <SuccessModal fileName={generatedFile} onClose={() => setGeneratedFile(null)} />}
      <div className="space-y-4">
        {/* 私鑰區 */}
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

        <button
          onClick={sign}
          disabled={!canSign}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium"
          style={{ fontSize: '1rem' }}
        >
          <PenLine size={18} />
          簽名
        </button>

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

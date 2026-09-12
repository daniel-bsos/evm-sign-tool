**[繁體中文](README.md)** | **English**

# EVM Key Generation & Signing Tool (Demo)

A single-file HTML tool for EVM private key generation and message signing. All cryptographic operations run locally in your browser with zero network requests. Your private key never leaves your device. Open-sourced under the MIT License.

## Features

- Random key generation (BIP-39, 128-bit entropy via `crypto.getRandomValues`)
- Password-encrypted Keystore JSON export (scrypt N=131072) and re-import
- Personal message signing (EIP-191)
- EIP-712 typed data signing with domain preview
- Auto-clear: the loaded key is wiped from memory after 100 seconds
- Connect a Ledger hardware wallet (WebHID) to sign EIP-191 and EIP-712 messages; the private key never touches the browser and stays on the device

## Usage

Download `index.html` and open it in a browser. No installation or network connection required.

## Security Notes

This tool is intended for demonstration and testing. Do not use it with keys holding mainnet assets.

EIP-712 signatures carry real authorization power. Permit-style signatures can authorize asset transfers offline. Verify the source of any JSON before signing.

Use offline or in a clean browser profile. Browser extensions can read page memory.

When signing with a private key file, the decrypted key briefly lives in browser memory (see auto-clear above). Signing with a Ledger keeps the key on the hardware device at all times; it never enters the browser. The two methods carry different trust levels — choose based on your needs.

Verify the SHA-256 checksum of downloaded files against the value published on the Releases page.

## Technical Notes

Bundles React 18, ethers.js 6.17.0, and the noble cryptography libraries. No CDN, no external dependencies, no localStorage, no cookies, no network transmission of any kind.

Connecting a Ledger lazy-loads four additional packages (`@ledgerhq/device-management-kit` and related) only when the user initiates a connection; they are never downloaded otherwise. WebHID is supported only on desktop Chrome 89+, Edge 89+, and Opera 76+ — Firefox, Safari, and all mobile browsers do not support it.

## Source & Build

Source code lives in [`src/`](./src) as a React + Vite project. The root `index.html` is the built artifact. To build it yourself:

```bash
cd src
npm install
npm run build
```

The output is a single self-contained file at `src/dist/index.html`. Builds are not byte-reproducible across toolchain versions; verify the released file against the SHA-256 checksum on the Releases page.

## License

MIT. See [LICENSE](./LICENSE).

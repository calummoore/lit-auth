# Lit Password-Gated Encryption (Vite + Lit Protocol + Polygon)

Password-gated Lit Actions demo:
- Store a password hash on-chain (Polygon) in a `PasswordRegistry` contract.
- Encrypt text with Lit on Naga Dev.
- Decrypt via a Lit Action that checks the on-chain hash before returning plaintext.

## Prerequisites
- Node 18+
- Wallet with MATIC for gas (Polygon mainnet) and a Polygon RPC URL

## Install
```bash
npm install
```

## Environment
Copy `.env.example` to `.env` and fill:
- `PRIVATE_KEY` – deployer wallet for Polygon
- `POLYGON_RPC_URL` – Polygon mainnet RPC (e.g., Alchemy/Infura/public)
- `POLYGONSCAN_API_KEY` – optional, for verification
- `VITE_PASSWORD_REGISTRY_ADDRESS` – set after you deploy the registry
- `VITE_PASSWORD_ACTION_CID` – set automatically if you run `npm run pinata:upload-all` (or fill manually)

## Contracts (Polygon)
- Source: `contracts/PasswordRegistry.sol`
- Deploy script: `scripts/deploy.ts`

Compile and deploy:
```bash
npm run compile:contracts
npm run deploy:polygon
```
Copy the printed contract address into `VITE_PASSWORD_REGISTRY_ADDRESS`.

## Lit Actions
- `litActions/password.js` – verifies password hash on-chain and decrypts.
- `litActions/parent-lit-action.js` / `child-lit-action.js` – optional orchestration helpers.

The app currently inlines the password action code when calling `executeJs`. If you prefer IPFS, upload the action and swap the inline code for the CID.

Use Pinata helper to upload all actions and auto-write CIDs:
```bash
npm run pinata:upload-all
# writes .env.local entries:
# VITE_PASSWORD_ACTION_CID, VITE_CHILD_ACTION_CID, VITE_PARENT_ACTION_CID
# and litActions/cids.json
```

## Frontend workflow (Naga Dev)
Run the app:
```bash
npm run dev
```
In the UI:
1) Connect to Lit (Naga Dev) and connect your wallet (Polygon).  
2) Enter username/password, click “Save hash to registry” (writes password hash to Polygon).  
3) Enter text and click “Encrypt with Lit.”  
4) Click “Decrypt with password” – Lit Action verifies the password hash on-chain, then returns plaintext.

## Build
```bash
npm run build
```

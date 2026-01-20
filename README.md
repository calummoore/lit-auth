# Lit Guardian-Gated Recovery (Vite + Lit Protocol + Polygon)

Guardian-gated recovery demo:
- Store guardian recovery config on-chain (Polygon) in a `GuardianRegistry` contract.
- Store the child Lit Action CID on-chain (Polygon) in a `LitActionRegistry` contract.
- Encrypt a recovery private key with Lit on Naga Dev.
- Decrypt via a parent Lit Action that delegates to a child action and a guardian action.

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
- `VITE_GUARDIAN_REGISTRY_ADDRESS` – set after you deploy the guardian registry
- `VITE_LIT_ACTION_REGISTRY_ADDRESS` – set after you deploy the Lit Action registry
- `VITE_PASSWORD_ACTION_CID` – set automatically if you run `npm run pinata:upload-all` (or fill manually)
- `VITE_CHILD_ACTION_CID` – optional fallback for the child Lit Action CID
- `VITE_PARENT_ACTION_CID` – parent Lit Action CID
- `VITE_POLYGON_RPC_URL` – Polygon RPC for client writes and LitAction registry reads

## Contracts (Polygon)
- Source: `contracts/GuardianRegistry.sol`
- Deploy script: `scripts/deploy.ts`

Compile and deploy:
```bash
npm run compile:contracts
npm run deploy:guardian-registry
```
Copy the printed contract address into `VITE_GUARDIAN_REGISTRY_ADDRESS`.

## Lit Action Registry (Polygon)
- Source: `contracts/LitActionRegistry.sol`
- Deploy script: `scripts/deploy-lit-action-registry.ts`

Compile and deploy:
```bash
npm run compile:contracts
npm run deploy:lit-action-registry
```
Copy the printed contract address into `VITE_LIT_ACTION_REGISTRY_ADDRESS`.

## Lit Actions
- `litActions/password.js` – verifies guardian password hash on-chain.
- `litActions/child-lit-action.js` – validates guardians and decrypts.
- `litActions/parent-lit-action.js` – fetches config and delegates to the child action.

Use Pinata helper to upload all actions and auto-write CIDs:
```bash
npm run pinata:upload-all
# writes .env.local entries:
# VITE_PASSWORD_ACTION_CID, VITE_CHILD_ACTION_CID, VITE_PARENT_ACTION_CID
# and litActions/cids.json
```

The frontend builds a Unified ACC using the child action CID and uses that for encrypt/decrypt.

## Frontend workflow (Naga Dev)
Run the app:
```bash
npm run dev
```
In the UI:
1) Connect to Lit (Naga Dev).  
2) Enter a guardian password and click “Create recovery key” (encrypts a new private key + stores guardian config on Polygon).  
3) Click “Decrypt” for a saved key – parent action fetches the child CID, child verifies the guardian, and returns the decrypted key.

## Build
```bash
npm run build
```

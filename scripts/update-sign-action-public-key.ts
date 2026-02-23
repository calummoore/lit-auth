import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import dotenv from 'dotenv'
import hre from 'hardhat'

dotenv.config({ path: '.env.local' })
dotenv.config()

const resolveSignActionPublicKey = () => {
  if (process.env.SIGN_ACTION_PUBLIC_KEY) {
    return process.env.SIGN_ACTION_PUBLIC_KEY
  }

  const keysPath = resolve(process.cwd(), 'litActions/public_keys.json')
  let raw
  try {
    raw = readFileSync(keysPath, 'utf8')
  } catch (error) {
    throw new Error(
      'Missing SIGN_ACTION_PUBLIC_KEY and unable to read litActions/public_keys.json'
    )
  }

  const keys = JSON.parse(raw)
  const key =
    keys.SIGN ??
    keys.SIGN_ACTION ??
    keys.SIGN_ACTION_PK ??
    keys.VITE_SIGN_ACTION_PK ??
    keys.VITE_SIGN_ACTION

  if (!key || typeof key !== 'string') {
    throw new Error('Missing SIGN public key in litActions/public_keys.json')
  }
  if (!key.startsWith('0x')) {
    throw new Error('SIGN public key must be a 0x-prefixed hex string')
  }

  return key
}

const resolveGuardianRegistryAddress = () => {
  const address =
    process.env.GUARDIAN_REGISTRY_ADDRESS ||
    process.env.VITE_GUARDIAN_REGISTRY_ADDRESS

  if (!address) {
    throw new Error('Missing GUARDIAN_REGISTRY_ADDRESS in env')
  }

  return address
}

async function main() {
  const gasPriceGwei = process.env.POLYGON_GAS_PRICE_GWEI
  const gasLimit = process.env.POLYGON_GAS_LIMIT
  const nonce = process.env.POLYGON_NONCE
  const signActionPublicKey = resolveSignActionPublicKey()
  const signActionPublicKeyLog = `${signActionPublicKey.slice(
    0,
    12
  )}...${signActionPublicKey.slice(-10)}`
  const guardianRegistryAddress = resolveGuardianRegistryAddress()

  const overrides: Record<string, any> = {}
  if (gasPriceGwei) {
    overrides.gasPrice = hre.ethers.parseUnits(gasPriceGwei, 'gwei')
  }
  if (gasLimit) {
    overrides.gasLimit = BigInt(gasLimit)
  }
  if (nonce) {
    overrides.nonce = Number(nonce)
  }

  console.log('Updating signActionPublicKey...', {
    network: hre.network.name,
    guardianRegistryAddress,
    gasPriceGwei: gasPriceGwei ?? 'auto',
    gasLimit: gasLimit ?? 'auto',
    nonce: nonce ?? 'auto',
    signActionPublicKey: signActionPublicKeyLog,
  })

  const registry = await hre.ethers.getContractAt(
    'GuardianRegistry',
    guardianRegistryAddress
  )
  const tx = await registry.setSignActionPublicKey(
    signActionPublicKey,
    overrides
  )

  console.log('Transaction sent:', tx.hash)
  await tx.wait()
  console.log('signActionPublicKey updated')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

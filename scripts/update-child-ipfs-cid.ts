import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import dotenv from 'dotenv'
import hre from 'hardhat'

dotenv.config({ path: '.env.local' })
dotenv.config()

const normalizeCid = (cid: string) =>
  cid.startsWith('ipfs://') ? cid.slice('ipfs://'.length) : cid

const resolveChildCid = () => {
  const envCid =
    process.env.CHILD_LIT_ACTION_CID ||
    process.env.INITIAL_CHILD_LIT_ACTION_CID ||
    process.env.VITE_CHILD_ACTION_CID

  if (envCid) {
    return normalizeCid(envCid)
  }

  const cidsPath = resolve(process.cwd(), 'litActions/cids.json')
  let raw
  try {
    raw = readFileSync(cidsPath, 'utf8')
  } catch (error) {
    throw new Error(
      'Missing CHILD_LIT_ACTION_CID and unable to read litActions/cids.json'
    )
  }

  const cids = JSON.parse(raw)
  const cid =
    cids.INITIAL_CHILD_LIT_ACTION_CID ??
    cids.VITE_CHILD_ACTION_CID ??
    cids.VITE_CHILD_ACTION

  if (!cid || typeof cid !== 'string') {
    throw new Error('Missing child action CID in litActions/cids.json')
  }

  return normalizeCid(cid)
}

const resolveLitActionRegistryAddress = () => {
  const address =
    process.env.LIT_ACTION_REGISTRY_ADDRESS ||
    process.env.VITE_LIT_ACTION_REGISTRY_ADDRESS

  if (!address) {
    throw new Error('Missing LIT_ACTION_REGISTRY_ADDRESS in env')
  }

  return address
}

async function main() {
  const gasPriceGwei = process.env.POLYGON_GAS_PRICE_GWEI
  const gasLimit = process.env.POLYGON_GAS_LIMIT
  const nonce = process.env.POLYGON_NONCE
  const childCid = resolveChildCid()
  const litActionRegistryAddress = resolveLitActionRegistryAddress()

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

  console.log('Updating child IPFS CID...', {
    network: hre.network.name,
    litActionRegistryAddress,
    gasPriceGwei: gasPriceGwei ?? 'auto',
    gasLimit: gasLimit ?? 'auto',
    nonce: nonce ?? 'auto',
    childCid,
  })

  const registry = await hre.ethers.getContractAt(
    'LitActionRegistry',
    litActionRegistryAddress
  )
  const tx = await registry.setChildIPFSCID(childCid, overrides)

  console.log('Transaction sent:', tx.hash)
  await tx.wait()
  console.log('Child IPFS CID updated')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

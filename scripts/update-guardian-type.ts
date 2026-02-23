import dotenv from 'dotenv'
import hre from 'hardhat'

dotenv.config({ path: '.env.local' })
dotenv.config()

const parseArg = (flag: string) => {
  const idx = process.argv.indexOf(flag)
  if (idx === -1 || idx === process.argv.length - 1) return undefined
  const value = process.argv[idx + 1]
  if (!value || value.startsWith('--')) return undefined
  return value
}

const hasFlag = (flag: string) => process.argv.includes(flag)

const parseBool = (value: string) => {
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  throw new Error(`Invalid boolean for --unique: ${value}`)
}

const normalizeCid = (cid: string) =>
  cid.startsWith('ipfs://') ? cid.slice('ipfs://'.length) : cid

const resolveGuardianCidHash = () => {
  const envHash = process.env.GUARDIAN_CID_HASH
  if (envHash) {
    if (!envHash.startsWith('0x') || envHash.length !== 66) {
      throw new Error('GUARDIAN_CID_HASH must be a 0x-prefixed 32-byte hex string')
    }
    return envHash
  }

  const envCid = process.env.GUARDIAN_CID
  if (envCid) {
    const normalized = normalizeCid(envCid)
    return hre.ethers.keccak256(hre.ethers.toUtf8Bytes(normalized))
  }

  const cidHash =
    parseArg('--cid-hash') ||
    parseArg('--guardian-cid-hash') ||
    parseArg('--guardianCidHash')

  if (cidHash) {
    if (!cidHash.startsWith('0x') || cidHash.length !== 66) {
      throw new Error('guardianCIDHash must be a 0x-prefixed 32-byte hex string')
    }
    return cidHash
  }

  const cid =
    parseArg('--cid') || parseArg('--guardian-cid') || parseArg('--guardianCid')
  if (!cid) {
    throw new Error('Missing guardian CID. Provide --cid or --cid-hash.')
  }

  const normalized = normalizeCid(cid)
  return hre.ethers.keccak256(hre.ethers.toUtf8Bytes(normalized))
}

const resolveGuardianTypeName = () => {
  const envName = process.env.GUARDIAN_TYPE_NAME
  if (envName) return envName

  const name = parseArg('--name')
  if (!name) {
    throw new Error('Missing guardian type name. Provide --name.')
  }
  return name
}

const resolveIsUnique = () => {
  const envUnique = process.env.GUARDIAN_TYPE_UNIQUE
  if (envUnique !== undefined) {
    return parseBool(envUnique)
  }

  const uniqueValue = parseArg('--unique')
  if (uniqueValue !== undefined) {
    return parseBool(uniqueValue)
  }
  if (hasFlag('--unique')) return true
  if (hasFlag('--not-unique')) return false
  throw new Error('Missing uniqueness flag. Provide --unique or --not-unique.')
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
  const guardianCIDHash = resolveGuardianCidHash()
  const guardianTypeName = resolveGuardianTypeName()
  const isUniqueAuthValue = resolveIsUnique()
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

  console.log('Updating guardian type...', {
    network: hre.network.name,
    guardianRegistryAddress,
    gasPriceGwei: gasPriceGwei ?? 'auto',
    gasLimit: gasLimit ?? 'auto',
    nonce: nonce ?? 'auto',
    guardianCIDHash,
    guardianTypeName,
    isUniqueAuthValue,
  })

  const registry = await hre.ethers.getContractAt(
    'GuardianRegistry',
    guardianRegistryAddress
  )
  const tx = await registry.setGuardianType(
    guardianCIDHash,
    guardianTypeName,
    isUniqueAuthValue,
    overrides
  )

  console.log('Transaction sent:', tx.hash)
  await tx.wait()
  console.log('Guardian type updated')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

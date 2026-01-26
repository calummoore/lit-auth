require('dotenv').config()
const path = require('path')
const fs = require('fs')
const PinataClient = require('@pinata/sdk')

const FILES = [
  'litActions/password.js',
  'litActions/wallet.js',
  'litActions/child-lit-action.js',
  'litActions/parent-lit-action.js',
]
const ENV_LOCAL = '.env.local'

function createClient() {
  const jwt = process.env.PINATA_JWT
  const apiKey = process.env.PINATA_API_KEY
  const apiSecret = process.env.PINATA_API_SECRET

  if (!jwt && (!apiKey || !apiSecret)) {
    throw new Error(
      'Set PINATA_JWT or PINATA_API_KEY + PINATA_API_SECRET in your .env'
    )
  }

  return jwt && jwt !== ''
    ? new PinataClient({ pinataJWTKey: jwt })
    : new PinataClient({
        pinataApiKey: apiKey,
        pinataSecretApiKey: apiSecret,
      })
}

async function pinFile(pinata, filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Skipping missing file: ${filePath}`)
    return null
  }
  const stream = fs.createReadStream(filePath)
  const fileName = path.basename(filePath)
  console.log(`Uploading ${fileName} to Pinata...`)
  const result = await pinata.pinFileToIPFS(stream, {
    pinataMetadata: { name: fileName },
  })
  console.log(`CID for ${fileName}: ${result.IpfsHash}`)
  return { filePath, cid: result.IpfsHash }
}

function upsertEnvVar(lines, key, value) {
  const line = `${key}=${value}`
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`))
  if (idx >= 0) {
    lines[idx] = line
  } else {
    lines.push(line)
  }
}

async function main() {
  const pinata = createClient()
  const results = []
  for (const file of FILES) {
    const res = await pinFile(pinata, file)
    if (res) results.push(res)
  }

  console.log('\nPinned files:')
  for (const r of results) {
    console.log(`${r.filePath} -> ipfs://${r.cid}`)
  }

  // Write CIDs to .env.local and litActions/cids.json for convenience
  const cidMap = {}
  for (const { filePath, cid } of results) {
    if (filePath.includes('password')) cidMap.VITE_PASSWORD_ACTION_CID = cid
    if (filePath.includes('wallet')) cidMap.VITE_WALLET_ACTION_CID = cid
    if (filePath.includes('child')) {
      cidMap.VITE_CHILD_ACTION_CID = cid
      cidMap.INITIAL_CHILD_LIT_ACTION_CID = cid
    }
    if (filePath.includes('parent')) cidMap.VITE_PARENT_ACTION_CID = cid
  }

  const envLines = fs.existsSync(ENV_LOCAL)
    ? fs.readFileSync(ENV_LOCAL, 'utf8').split('\n').filter(Boolean)
    : []
  Object.entries(cidMap).forEach(([k, v]) => upsertEnvVar(envLines, k, v))
  fs.writeFileSync(ENV_LOCAL, envLines.join('\n') + '\n')
  console.log(`\nUpdated ${ENV_LOCAL} with latest CIDs.`)

  fs.writeFileSync(
    'litActions/cids.json',
    JSON.stringify(cidMap, null, 2),
    'utf8'
  )
  console.log('Wrote litActions/cids.json with CID map.')
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})

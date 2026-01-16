require('dotenv').config()
const path = require('path')
const fs = require('fs')
const PinataClient = require('@pinata/sdk')

const filePath = process.argv[2] || 'litActions/password.js'

async function main() {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const jwt = process.env.PINATA_JWT
  const apiKey = process.env.PINATA_API_KEY
  const apiSecret = process.env.PINATA_API_SECRET

  if (!jwt && (!apiKey || !apiSecret)) {
    throw new Error(
      'Set PINATA_JWT or PINATA_API_KEY + PINATA_API_SECRET in your .env'
    )
  }

  const pinata =
    jwt != null && jwt !== ''
      ? new PinataClient({ pinataJWTKey: jwt })
      : new PinataClient({
          pinataApiKey: apiKey,
          pinataSecretApiKey: apiSecret,
        })

  const stream = fs.createReadStream(filePath)
  const fileName = path.basename(filePath)

  console.log(`Uploading ${fileName} to Pinata...`)
  const result = await pinata.pinFileToIPFS(stream, {
    pinataMetadata: { name: fileName },
  })

  console.log('Pinned successfully:')
  console.log(`CID: ${result.IpfsHash}`)
  console.log(`ipfs://${result.IpfsHash}`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})

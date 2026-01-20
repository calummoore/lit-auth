import hre from 'hardhat'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

async function main() {
  const gasPriceGwei = process.env.POLYGON_GAS_PRICE_GWEI
  const gasLimit = process.env.POLYGON_GAS_LIMIT
  const nonce = process.env.POLYGON_NONCE
  const initialCid = process.env.INITIAL_CHILD_LIT_ACTION_CID || ''

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

  console.log('Deploying LitActionRegistry...', {
    network: hre.network.name,
    gasPriceGwei: gasPriceGwei ?? 'auto',
    gasLimit: gasLimit ?? 'auto',
    nonce: nonce ?? 'auto',
    initialCid: initialCid || 'empty',
  })

  const registry = await hre.ethers.deployContract(
    'LitActionRegistry',
    [initialCid],
    overrides
  )

  const tx = registry.deploymentTransaction()
  console.log('Deployment tx:', tx?.hash)

  await registry.waitForDeployment()

  const address = await registry.getAddress()
  console.log(`LitActionRegistry deployed to: ${address}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

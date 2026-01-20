import hre from 'hardhat'

async function main() {
  const gasPriceGwei = process.env.POLYGON_GAS_PRICE_GWEI
  const gasLimit = process.env.POLYGON_GAS_LIMIT
  const nonce = process.env.POLYGON_NONCE

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

  console.log('Deploying GuardianRegistry...', {
    network: hre.network.name,
    gasPriceGwei: gasPriceGwei ?? 'auto',
    gasLimit: gasLimit ?? 'auto',
    nonce: nonce ?? 'auto',
  })

  const registry = await hre.ethers.deployContract('GuardianRegistry', overrides)

  const tx = registry.deploymentTransaction()
  console.log('Deployment tx:', tx?.hash)

  await registry.waitForDeployment()

  const address = await registry.getAddress()
  console.log(`GuardianRegistry deployed to: ${address}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

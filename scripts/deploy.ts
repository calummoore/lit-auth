import hre from 'hardhat'

async function main() {
  const gasPriceGwei = process.env.POLYGON_GAS_PRICE_GWEI
  const gasLimit = process.env.POLYGON_GAS_LIMIT

  const overrides: Record<string, any> = {}
  if (gasPriceGwei) {
    overrides.gasPrice = hre.ethers.parseUnits(gasPriceGwei, 'gwei')
  }
  if (gasLimit) {
    overrides.gasLimit = BigInt(gasLimit)
  }

  console.log('Deploying PasswordRegistry...', {
    network: hre.network.name,
    gasPriceGwei: gasPriceGwei ?? 'auto',
    gasLimit: gasLimit ?? 'auto',
  })

  const registry = await hre.ethers.deployContract(
    'PasswordRegistry',
    overrides
  )

  const tx = registry.deploymentTransaction()
  console.log('Deployment tx:', tx?.hash)

  await registry.waitForDeployment()

  const address = await registry.getAddress()
  console.log(`PasswordRegistry deployed to: ${address}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

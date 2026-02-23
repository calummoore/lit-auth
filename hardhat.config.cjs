require('dotenv').config()
require('@nomicfoundation/hardhat-toolbox')

const PRIVATE_KEY = process.env.PRIVATE_KEY || ''
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || ''
const POLYGON_GAS_PRICE_GWEI = process.env.POLYGON_GAS_PRICE_GWEI
const POLYGON_GAS_PRICE_WEI = POLYGON_GAS_PRICE_GWEI
  ? Number(POLYGON_GAS_PRICE_GWEI) * 1e9
  : undefined

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    polygon: {
      url: POLYGON_RPC_URL || 'https://polygon-rpc.com',
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : undefined,
      gasPrice: POLYGON_GAS_PRICE_WEI,
    },
  },
  etherscan: {
    apiKey: process.env.POLYGONSCAN_API_KEY || '',
  },
}

module.exports = config

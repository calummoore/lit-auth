require('dotenv').config()
require('@nomicfoundation/hardhat-toolbox')

const { parseUnits } = require('ethers')

const PRIVATE_KEY = process.env.PRIVATE_KEY || ''
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || ''
const POLYGON_GAS_PRICE_GWEI = process.env.POLYGON_GAS_PRICE_GWEI

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: '0.8.24',
  networks: {
    polygon: {
      url: POLYGON_RPC_URL || 'https://polygon-rpc.com',
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : undefined,
      gasPrice: POLYGON_GAS_PRICE_GWEI
        ? parseUnits(POLYGON_GAS_PRICE_GWEI, 'gwei')
        : undefined,
    },
  },
  etherscan: {
    apiKey: process.env.POLYGONSCAN_API_KEY || '',
  },
}

module.exports = config

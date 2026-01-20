export const litActionRegistryAbi = [
  {
    inputs: [],
    name: 'getChildIPFSCID',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'string', name: 'cid', type: 'string' }],
    name: 'setChildIPFSCID',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

export const LIT_ACTION_REGISTRY_ADDRESS =
  import.meta.env.VITE_LIT_ACTION_REGISTRY_ADDRESS || ''

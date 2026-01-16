export const passwordRegistryAbi = [
  {
    inputs: [
      { internalType: 'string', name: 'username', type: 'string' },
      { internalType: 'bytes32', name: 'passwordHash', type: 'bytes32' },
    ],
    name: 'setPasswordHash',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'string', name: 'username', type: 'string' }],
    name: 'getPasswordHash',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'string', name: 'username', type: 'string' }],
    name: 'getOwner',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const PASSWORD_REGISTRY_ADDRESS =
  import.meta.env.VITE_PASSWORD_REGISTRY_ADDRESS || ''

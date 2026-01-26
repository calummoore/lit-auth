# Lit Actions for Smart Contract Configuration Management

This directory contains Lit Actions that manage smart contract configuration and guardian validation for recovery.

## Overview

The parent Lit Action integrates with smart contracts to retrieve configuration data and orchestrates child Lit Action execution through IPFS CID resolution. It serves as the central coordinator for smart contract configuration retrieval and child action workflows.

## Implementation

### Core Files

- **`parent-lit-action.js`** - Main parent action with the `go` function implementation
- **`child-lit-action.js`** - Child action for guardian threshold validation and decryption
- **`password.js`** - Password verification action that compares plaintext passwords against hashes

### Function Signature

The function must be named `go` and exported as `export const go = async () => {...}` for IPFS compatibility.

## Input Parameters (via jsParams)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userAddress` | string | Yes | User address for guardian config lookup |
| `guardians` | array | Yes | Array of guardian descriptors to pass to the child action |
| `ciphertext` | string | Yes | Encrypted data for child action |
| `dataToEncryptHash` | string | Yes | Hash of data to encrypt |
| `unifiedAccessControlConditions` | array | No | UACC passed to child for decryption |

## Smart Contract Integration

### Required Contract Methods

The contracts must implement the following methods:

- **`getChildIPFSCID()`** - Returns IPFS CID of child Lit Action (LitActionRegistry)
- **`getGuardianConfig(address)`** - Returns guardian configuration for specific address (GuardianRegistry)

### Ethers Integration

The implementation uses:
- `ethers.JsonRpcProvider` for blockchain connection
- `ethers.Contract(address, abi, provider)` for contract instances
- `Lit.Actions.getRpcUrl({ chain })` for RPC URL resolution

## Child Lit Action Coordination

### IPFS CID Processing

- Automatically strips `ipfs://` prefix if present
- Passes cleaned CID to `Lit.Actions.call`

### Parameter Passing to Child Actions

The following parameters are passed to child actions:

- `ipfsId` - Processed IPFS CID of child action
- `params` - Original child parameters
- `walletConfig` - Retrieved guardian configuration
- `ciphertext` - Encrypted data
- `dataToEncryptHash` - Hash for validation

## Response Format

### Success Response

```javascript
{
  ok: true,
  cid: "processed_ipfs_cid",
  result: parsed.result // Child action result data
}
```

### Error Responses

#### Child Action Parsing Error
```javascript
{
  ok: false,
  cid: "processed_ipfs_cid",
  error: "invalid_child_json",
  raw: "raw_child_response"
}
```

#### Child Action Execution Error
```javascript
{
  ok: false,
  cid: "processed_ipfs_cid", 
  error: "child_failed",
  raw: null
}
```

#### Parent Action Execution Error
```javascript
{
  ok: false,
  error: "execution_failed",
  message: "Error description"
}
```

## Error Handling

The implementation provides comprehensive error handling for:

1. **Network Errors** - RPC connection failures, timeout issues
2. **Contract Call Failures** - Invalid contract address, missing methods, ABI mismatches
3. **JSON Parsing Errors** - Malformed child action responses
4. **Child Action Failures** - Child action execution errors or invalid responses
5. **General Execution Errors** - Unexpected runtime errors with detailed messages

## Usage Example

```javascript
// Example jsParams for the parent Lit Action
const jsParams = {
  guardians: [
    {
      cid: "QmGuardianCid",
      data: {
        // Parameters specific to the guardian action
      },
    },
  ],
  userAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef",
  ciphertext: "encrypted_data_here",
  dataToEncryptHash: "hash_of_data_to_encrypt"
};
```

## Integration Notes

- **IPFS Compatibility**: Function must be uploaded to IPFS with the exact `export const go` signature
- **Global Libraries**: `ethers` library is globally available in the Lit Action runtime environment
- **Response Handling**: All responses use `Lit.Actions.setResponse()` with JSON.stringify
- **Flexible Contract Interface**: Supports different contract interfaces through ABI parameter
- **Multi-Step Workflows**: Handles coordination between parent and child actions for complex workflows

## Security Considerations

- Always validate contract addresses and ABIs before use
- Ensure proper error handling to prevent sensitive data leakage
- Use secure RPC endpoints for blockchain communication
- Validate all input parameters before processing
- Handle encryption/decryption operations securely

This parent Lit Action serves as the central orchestrator for smart contract configuration retrieval and child Lit Action coordination in the Lit Protocol integration.

---

# Child Lit Action for Guardian Validation

The child Lit Action implements guardian threshold validation for social recovery operations. It validates guardian signatures and performs decryption when the required threshold is met.

## Child Action Overview

The child action receives parameters from the parent action and:

1. Validates guardian configurations from smart contract data
2. Calls individual guardian Lit Actions for authentication
3. Counts successful guardian validations
4. Performs decryption only when threshold requirements are met

## Child Action Input Parameters

The child action receives the following parameters from the parent action:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `guardians` | array | Yes | Guardian entries of shape `{ cid, data }` |
| `walletConfig` | object | Yes | Guardian configuration from smart contract |
| `walletConfig.threshold` | number | Yes | Minimum number of guardian approvals required |
| `walletConfig.guardianCIDs` | array | Yes | Array of guardian IPFS CIDs |
| `ciphertext` | string | Yes | Encrypted data to decrypt upon successful validation |
| `dataToEncryptHash` | string | Yes | Hash for data validation |

## Guardian Validation Process

1. **Initialization**: Counter starts at `authed = 0`
2. **Guardian Loop**: Iterate through `walletConfig.guardianCIDs`
3. **Guardian Call**: Call each guardian with `Lit.Actions.call({ ipfsId: guardianCID, params: guardian.data })`
4. **Response Parsing**: Parse JSON response and check `parsed.ok === true`
5. **Counter Update**: Increment `authed` for successful guardians
6. **Early Exit**: Break loop when `authed >= threshold` (optimization)
7. **Threshold Check**: Proceed only if `authed >= threshold`

## Child Action Response Formats

### Success Response

```javascript
{
  ok: true,
  result: decryptedData // From Lit.Actions.decryptAndCombine()
}
```

### Failure Responses

#### Insufficient Guardians

```javascript
{
  ok: false,
  error: "insufficient_guardians",
  authenticated: number, // Number of guardians that validated
  required: number // Threshold requirement
}
```

#### Decryption Failed

```javascript
{
  ok: false,
  error: "decryption_failed",
  message: "Error description",
  authenticated: number,
  required: number
}
```

#### Validation Error

```javascript
{
  ok: false,
  error: "validation_error", 
  message: "Error description",
  authenticated: 0,
  required: 0
}
```

## Security Features

- **Threshold Enforcement**: Decryption only occurs when `authed >= threshold`
- **Guardian Independence**: Individual guardian failures don't stop the validation process
- **Parameter Validation**: Comprehensive input parameter validation
- **Error Isolation**: Malformed guardian responses are handled gracefully
- **Early Termination**: Optimization to stop when threshold is reached

## Integration Notes

- **IPFS CID Processing**: Automatically strips `ipfs://` prefix from guardian CIDs
- **JSON Response Parsing**: Robust handling of guardian response formats
- **Ethereum Chain**: Decryption operations use `chain: "ethereum"`
- **Access Control**: Uses empty `accessControlConditions: []` for decryption
- **Parent Integration**: Seamlessly integrates with parent action workflow

---

# Password Verification Lit Action

The password verification Lit Action provides secure password verification functionality that compares plaintext passwords against provided hashes and returns a boolean verification result.

## Password Action Overview

The password action receives a plaintext password, hash, and optional algorithm parameter, then:

1. Validates all required parameters (password and hash)
2. Validates the hash algorithm (defaults to SHA-256)
3. Computes the hash of the input password using Web Crypto API
4. Performs constant-time comparison to prevent timing attacks
5. Returns boolean verification result

## Password Action Input Parameters

The password action receives the following parameters via `jsParams`:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `password` | string | Yes | - | The plaintext password to verify |
| `hash` | string | Yes | - | The expected hash to compare against (hex format, with or without 0x prefix) |
| `algorithm` | string | No | SHA-256 | Hash algorithm to use |

### Supported Hash Algorithms

- **SHA-256** (default) - Most commonly used secure hash algorithm
- **SHA-1** (legacy support) - For backward compatibility with older systems
- **SHA-512** (enhanced security) - For applications requiring stronger hashing

## Password Action Response Formats

### Success Response

```javascript
{
  ok: true,
  verified: boolean    // true if password matches hash, false otherwise
}
```

### Error Responses

#### Missing Parameters
```javascript
{
  ok: false,
  error: "missing_params",
  message: "Missing required password or hash parameter"
}
```

#### Invalid Algorithm
```javascript
{
  ok: false,
  error: "invalid_algorithm", 
  message: "Unsupported algorithm: [algorithm]. Supported: SHA-256, SHA-1, SHA-512"
}
```

#### Hash Computation Error
```javascript
{
  ok: false,
  error: "hash_error",
  message: "Password hashing failed"
}
```

#### General Execution Error
```javascript
{
  ok: false,
  error: "execution_failed",
  message: "Password verification failed"
}
```

## Security Features

The password verification action implements several security best practices:

- **No Password Logging**: The plaintext password is never logged or output in any form
- **Constant-Time Comparison**: Uses constant-time comparison to prevent timing attacks
- **Hash Format Normalization**: Automatically handles and removes common prefixes (0x) from hash inputs
- **Robust Error Handling**: Provides detailed error information without exposing sensitive data
- **Algorithm Validation**: Only allows secure, well-established hash algorithms

## Usage Example

```javascript
// Example jsParams for password verification
const jsParams = {
  password: "mySecretPassword123",
  hash: "1e28d0fd01d085787843952a78c58861a8f82492063bfbf57ee6f3224e75bd3e", // SHA-256 hex
  algorithm: "SHA-256" // optional, defaults to SHA-256
};

// Expected response for correct password
{
  ok: true,
  verified: true
}

// Expected response for incorrect password
{
  ok: true, 
  verified: false
}
```

## Integration Notes

- **IPFS Compatibility**: Function uses the standard `export const go` signature required for IPFS deployment
- **Web Crypto API**: Leverages browser-native cryptographic functions for secure hashing
- **Cross-Platform**: Works in both browser and Node.js environments with appropriate polyfills
- **Flexible Hash Format**: Accepts hashes with or without hex prefixes (0x)
- **Secure by Design**: Implements defense-in-depth security practices throughout

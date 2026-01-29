const setResponse = (payload) => {
  Lit.Actions.setResponse({ response: JSON.stringify(payload) });
};

const throwErr = (code, message, data) => {
  const err = new Error(message);
  err.code = code;
  err.data = data;
  throw err;
};

// Update this address after each GuardianRegistry deployment.
const GUARDIAN_REGISTRY_ADDRESS = "0xD3E99Ad39c2C9E19cc184C0ade66C09f7b0F560c";

const optionalParam = (key) => {
  let value;
  if (
    typeof jsParams !== "undefined" &&
    jsParams &&
    jsParams[key] !== undefined
  ) {
    value = jsParams[key];
  } else if (
    typeof globalThis !== "undefined" &&
    globalThis[key] !== undefined
  ) {
    value = globalThis[key];
  }
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return value;
};

const requireParam = (key) => {
  const value = optionalParam(key);
  if (value === undefined) {
    throwErr("validation-error", `Missing required ${key}`);
  }
  return value;
};

const cleanCid = (cid) => {
  const raw = (cid || "").toString();
  return raw.startsWith("ipfs://") ? raw.slice("ipfs://".length) : raw;
};

const go = async () => {
  try {
    // Get required inputs from jsParams
    const guardianRegistryAddress = GUARDIAN_REGISTRY_ADDRESS;
    const userAddress = requireParam("userAddress");
    const guardians = requireParam("guardians");
    const ciphertext = optionalParam("ciphertext");
    const dataToEncryptHash = optionalParam("dataToEncryptHash");
    if (!Array.isArray(guardians)) {
      throwErr("validation-error", "guardians must be an array");
    }

    // Fetch guardian configuration from chain
    const provider = new ethers.providers.JsonRpcProvider(
      await Lit.Actions.getRpcUrl({ chain: "polygon" })
    );
    const abi = [
      "function getGuardianConfig(address user) view returns (uint256 threshold, bytes32[] guardianCIDs, bytes32 cipherHash)",
      "function getGuardianEntry(address user, bytes32 guardianCIDHash) view returns (bytes32)",
    ];
    const registry = new ethers.Contract(
      guardianRegistryAddress,
      abi,
      provider
    );
    const rawConfig = await registry.getGuardianConfig(userAddress);
    const threshold = Number(rawConfig.threshold ?? rawConfig[0] ?? 0);
    const guardianCIDHashes = rawConfig.guardianCIDs ?? rawConfig[1] ?? [];
    const cipherHash = rawConfig.cipherHash ?? rawConfig[2];
    const guardianCIDs = guardians.map((entry) => entry?.cid).filter(Boolean);

    if (
      !Array.isArray(guardianCIDHashes) ||
      guardianCIDHashes.length === 0 ||
      guardianCIDs.length === 0
    ) {
      throwErr("validation-error", "No guardian CIDs provided" + JSON.stringify({
        guardianCIDHashes,
        guardianCIDs,
        guardians,
        rawConfig
      }));
    }
    if (ciphertext && dataToEncryptHash) {
      if (!cipherHash || cipherHash === ethers.constants.HashZero) {
        throwErr("validation-error", "Missing cipher hash for user");
      }
      const normalizedDataHash = dataToEncryptHash.startsWith("0x")
        ? dataToEncryptHash
        : `0x${dataToEncryptHash}`;
      const expectedCipherHash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["string", "bytes32"],
          [ciphertext, normalizedDataHash]
        )
      );
      if (expectedCipherHash.toLowerCase() !== cipherHash.toLowerCase()) {
        throwErr("cipher-mismatch", "Cipher hash does not match user", {
          expected: expectedCipherHash.toLowerCase(),
          got: cipherHash.toLowerCase(),
        });
      }
    }

    // Initialize guardian validation counter
    let authed = 0;
    const configuredCIDHashesForAddress = new Set(
      guardianCIDHashes.map((hash) => (hash || "").toString().toLowerCase())
    );

    // Validate each guardian
    for (const guardianEntry of guardians) {
      try {
        const cleanCID = cleanCid(guardianEntry?.cid);

        if (!cleanCID) {
          continue; // Skip invalid CIDs
        }

        const guardianHash = ethers.utils.keccak256(
          ethers.utils.toUtf8Bytes(cleanCID)
        );
        if (!configuredCIDHashesForAddress.has(guardianHash.toLowerCase())) {
          continue;
        }

        let authValueHash;
        try {
          authValueHash = await registry.getGuardianEntry(
            userAddress,
            guardianHash
          );
        } catch {
          continue;
        }

        // Call guardian Lit Action
        const guardianResponse = await Lit.Actions.call({
          ipfsId: cleanCID,
          params: {
            // Data for the specific guardian auth
            ...(guardianEntry?.data || {}),
            authValueHash,
          },
        });

        // Parse guardian response
        let parsed;
        try {
          parsed = JSON.parse(guardianResponse || "");
        } catch (parseError) {
          // Guardian response is not valid JSON, treat as failure
          continue;
        }

        // Propogate errors
        if (parsed.ok !== true) {
          setResponse(parsed);
          return;
        }

        // Increment successfully verified auths
        authed++;

        // Early termination optimization - if we have enough guardians, break
        if (authed >= threshold) {
          break;
        }
      } catch (guardianError) {
        // Guardian call failed, continue to next guardian
        // Individual guardian failures should not stop the process
        continue;
      }
    }

    // Check if threshold is met
    if (authed < threshold) {
      throwErr("insufficient-guardians", "Guardian threshold not met", {
        authenticated: authed,
        required: threshold,
      });
    }

    // Threshold met - return ok so the parent can decrypt
    setResponse({
      ok: true,
      action: "child",
      authenticated: authed,
      required: threshold,
    });
  } catch (error) {
    // General execution error
    setResponse({
      ok: false,
      action: "child",
      error: error.code ?? "unknown",
      message: error.message || "Child action execution failed",
      data: error.data,
    });
  }
};

go();

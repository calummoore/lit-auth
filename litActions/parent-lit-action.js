const setResponse = (payload) => {
  Lit.Actions.setResponse({ response: JSON.stringify(payload) });
};

const throwErr = (code, message, data) => {
  const err = new Error(message);
  err.code = code;
  err.data = data;
  throw err;
};

// Update this address after each LitActionRegistry deployment.
const LIT_ACTION_REGISTRY_ADDRESS =
  "0xf0CCDCCdfb3AF3b7C21884b6Bd141c7BBC8e7aA5";

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

const go = async () => {
  try {
    // Get required params
    const userAddress = requireParam("userAddress");
    const guardians = requireParam("guardians");
    const ciphertext = requireParam("ciphertext");
    const dataToEncryptHash = requireParam("dataToEncryptHash");
    const unifiedAccessControlConditions = requireParam(
      "unifiedAccessControlConditions"
    );
    if (!Array.isArray(unifiedAccessControlConditions)) {
      throwErr(
        "validation-error",
        "unifiedAccessControlConditions must be an array"
      );
    }

    // Smart contract interaction using ethers (available globally)
    const litActionUrl = await Lit.Actions.getRpcUrl({ chain: "polygon" });
    const litActionProvider = new ethers.providers.JsonRpcProvider(
      litActionUrl
    );

    const litActionContract = new ethers.Contract(
      LIT_ACTION_REGISTRY_ADDRESS,
      ["function getChildIPFSCID() view returns (string)"],
      litActionProvider
    );

    // Retrieve child action IPFS CID and configuration data
    let cid = await litActionContract["getChildIPFSCID"]();

    // Process IPFS CID format
    cid = (cid || "").toString();
    if (cid.startsWith("ipfs://")) cid = cid.slice("ipfs://".length);

    // Call child Lit Action with configuration
    const childActionResRaw = await Lit.Actions.call({
      ipfsId: cid,
      // LitActions uses params when passing in, but then creates the global
      // jsParams.
      params: {
        guardians: guardians || [],
        userAddress,
        ciphertext,
        dataToEncryptHash,
      },
    });

    // Attempt to parse the child action response JSON
    let childActionRes;
    try {
      childActionRes = JSON.parse(childActionResRaw || "");
    } catch (e) {
      throwErr(
        "invalid-child-json",
        e.message ?? "Unable to parse child action JSON",
        {
          raw: childActionResRaw,
        }
      );
    }

    if (!childActionRes || childActionRes.ok !== true) {
      setResponse(childActionRes);
      return;
    }

    // Child ok - proceed with decryption
    try {
      const normalizedDataHash = (dataToEncryptHash || "").startsWith("0x")
        ? dataToEncryptHash.slice(2)
        : dataToEncryptHash;
      const decryptedData = await Lit.Actions.decryptAndCombine({
        accessControlConditions: unifiedAccessControlConditions,
        ciphertext,
        dataToEncryptHash: normalizedDataHash,
        chain: "polygon",
      });

      setResponse({
        ok: true,
        action: "parent",
        result: decryptedData,
        child: childActionRes,
      });
    } catch (decryptionError) {
      throwErr(
        "decryption-failed",
        decryptionError.message || "Decryption operation failed"
      );
    }
  } catch (error) {
    setResponse({
      ok: false,
      action: "parent",
      error: error.code,
      message: error.message,
      data: error.data,
    });
  }
};

go();

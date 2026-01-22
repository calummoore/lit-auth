const setResponse = (payload) => {
  Lit.Actions.setResponse({ response: JSON.stringify(payload) });
};

const throwErr = (code, message, data) => {
  const err = new Error(message);
  err.code = code;
  err.data = data;
  throw err;
};

const optionalParam = (key) => {
  let value;
  if (typeof jsParams !== "undefined" && jsParams && jsParams[key] !== undefined) {
    value = jsParams[key];
  } else if (typeof globalThis !== "undefined" && globalThis[key] !== undefined) {
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
    const guardianRegistryAddress = requireParam("guardianRegistryAddress");
    const litActionRegistryAddress = requireParam("litActionRegistryAddress");
    const userAddress = requireParam("userAddress");
    const guardians = requireParam("guardians");
    const ciphertext = requireParam("ciphertext");
    const dataToEncryptHash = requireParam("dataToEncryptHash");
    const unifiedAccessControlConditions = requireParam(
      "unifiedAccessControlConditions"
    );

    // Smart contract interaction using ethers (available globally)
    const litActionUrl = await Lit.Actions.getRpcUrl({ chain: "polygon" });
    const litActionProvider = new ethers.providers.JsonRpcProvider(
      litActionUrl
    );

    const litActionContract = new ethers.Contract(
      litActionRegistryAddress,
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
        guardianRegistryAddress,
        userAddress,
        ciphertext,
        dataToEncryptHash,
        unifiedAccessControlConditions,
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

    // Return structured response
    setResponse(childActionRes);
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

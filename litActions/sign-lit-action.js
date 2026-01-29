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
    const userAddress = requireParam("userAddress");
    const guardians = requireParam("guardians");
    if (!Array.isArray(guardians)) {
      throwErr("validation-error", "guardians must be an array");
    }

    const litActionUrl = await Lit.Actions.getRpcUrl({ chain: "polygon" });
    const litActionProvider = new ethers.providers.JsonRpcProvider(
      litActionUrl
    );
    const litActionContract = new ethers.Contract(
      LIT_ACTION_REGISTRY_ADDRESS,
      ["function getChildIPFSCID() view returns (string)"],
      litActionProvider
    );

    let cid = await litActionContract["getChildIPFSCID"]();
    cid = (cid || "").toString();
    if (cid.startsWith("ipfs://")) cid = cid.slice("ipfs://".length);

    const childActionResRaw = await Lit.Actions.call({
      ipfsId: cid,
      params: {
        guardians: guardians || [],
        userAddress,
      },
    });

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

    const timestamp = Math.floor(Date.now() / 1000);
    const message = `Lit Guardian Signature\naddress: ${userAddress}\ntimestamp: ${timestamp}`;
    const toSign = ethers.utils.arrayify(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes(message))
    );
    const sigName = "GUARDIAN_USER_SIG";
    const signingScheme = "EcdsaK256Sha256";

    const signature = await Lit.Actions.signAsAction({
      toSign,
      sigName,
      signingScheme,
    });

    setResponse({
      ok: true,
      signature: signature,
      sigName,
      signingScheme,
      message,
      timestamp,
      child: childActionRes,
    });
  } catch (error) {
    setResponse({
      ok: false,
      action: "sign",
      error: error.code ?? "execution_failed",
      message: error.message || "Signing action failed",
      data: error.data,
    });
  }
};

go();

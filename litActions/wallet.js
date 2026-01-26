const setResponse = (payload) => {
  Lit.Actions.setResponse({ response: JSON.stringify(payload) });
};

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
    const err = new Error(`Missing required ${key}`);
    err.code = "missing_params";
    throw err;
  }
  return value;
};

const normalizeHex = (value) => {
  if (typeof value !== "string") return value;
  if (value.startsWith("0x0x")) return `0x${value.slice(4)}`;
  return value;
};

const bytes32ToAddress = (value) => {
  if (!value || typeof value !== "string") return null;
  const normalized = normalizeHex(value);
  const hex = normalized.startsWith("0x") ? normalized.slice(2) : normalized;
  if (hex.length < 40) return null;
  return `0x${hex.slice(-40)}`;
};

const makeMessage = (address, issuedAt) =>
  `Lit Guardian Wallet Auth\naddress: ${address}\nissuedAt: ${issuedAt}`;

const go = async () => {
  try {
    const authValueHash = normalizeHex(requireParam("authValueHash"));
    const signature = normalizeHex(requireParam("signature"));
    const issuedAt = requireParam("issuedAt");

    const address = bytes32ToAddress(authValueHash);
    if (!address) {
      setResponse({
        ok: false,
        error: "invalid_auth_value",
        message: "Auth value must be an address encoded as bytes32",
      });
      return false;
    }

    const issuedAtMs = Date.parse(issuedAt);
    if (!Number.isFinite(issuedAtMs)) {
      setResponse({
        ok: false,
        error: "invalid_timestamp",
        message: "issuedAt must be a valid ISO timestamp",
      });
      return false;
    }

    const now = Date.now();
    const maxAgeMs = 15 * 60 * 1000;
    if (issuedAtMs > now + 60 * 1000) {
      setResponse({
        ok: false,
        error: "invalid_timestamp",
        message: "issuedAt is in the future",
      });
      return false;
    }
    if (now - issuedAtMs > maxAgeMs) {
      setResponse({
        ok: false,
        error: "signature_expired",
        message: "Signature is older than 15 minutes",
      });
      return false;
    }

    const message = makeMessage(address, issuedAt);
    let recovered;
    try {
      recovered = ethers.utils.verifyMessage(message, signature);
    } catch (err) {
      setResponse({
        ok: false,
        error: "invalid_signature",
        message: err?.message || "Failed to verify signature",
      });
      return false;
    }

    if (recovered.toLowerCase() !== address.toLowerCase()) {
      setResponse({
        ok: false,
        verified: false,
        error: "address_mismatch",
        message: "Signature does not match auth value address",
      });
      return false;
    }

    setResponse({
      ok: true,
      verified: true,
    });

    return true;
  } catch (error) {
    if (error?.code === "missing_params") {
      setResponse({
        ok: false,
        error: "missing_params",
        message: error.message,
      });
      return false;
    }
    setResponse({
      ok: false,
      error: "execution_failed",
      message: error?.message || "Wallet verification failed",
    });
  }

  return false;
};

go();

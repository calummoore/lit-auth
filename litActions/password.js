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

const go = async () => {
  try {
    const password = requireParam("password");
    const authValueHash = requireParam("authValueHash");
    const hashAlgorithm = optionalParam("hashAlgorithm") || "SHA-256";

    const supportedAlgorithms = ["SHA-256", "SHA-1", "SHA-512"];
    if (!supportedAlgorithms.includes(hashAlgorithm)) {
      setResponse({
        ok: false,
        error: "invalid_algorithm",
        message: `Unsupported algorithm: ${hashAlgorithm}. Supported: ${supportedAlgorithms.join(
          ", "
        )}`,
      });
      return false;
    }

    // Hash the provided password in the Lit Action runtime
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest(hashAlgorithm, data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedHash =
      "0x" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    if (
      !authValueHash ||
      authValueHash.toLowerCase() !== computedHash.toLowerCase()
    ) {
      setResponse({
        ok: false,
        verified: false,
        error: "invalid_password",
        message: "Password did not match stored hash",
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
      message: error?.message || "Password verification failed",
    });
  }

  return false;
};

go();

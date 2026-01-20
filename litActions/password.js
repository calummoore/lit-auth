const setResponse = (payload) => {
  Lit.Actions.setResponse({ response: JSON.stringify(payload) });
};

const go = async () => {
  try {
    const input = typeof jsParams !== "undefined" && jsParams ? jsParams : {};
    const { authValueHash, password, hashAlgorithm = "SHA-256" } = input || {};

    if (!password || !authValueHash) {
      setResponse({
        ok: false,
        error: "missing_params",
        message: "password and authValueHash are required",
      });
      return false;
    }

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
    setResponse({
      ok: false,
      error: "execution_failed",
      message: error?.message || "Password verification failed",
    });
  }

  return false;
};

go();

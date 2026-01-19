const go = async () => {
  try {
    const {
      username,
      password,
      registryAddress,
      ciphertext,
      dataToEncryptHash,
      chain = "polygon",
      rpcUrl,
      hashAlgorithm = "SHA-256",
      unifiedAccessControlConditions = [],
    } = jsParams || {};

    if (
      !username ||
      !password ||
      !registryAddress ||
      !ciphertext ||
      !dataToEncryptHash
    ) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          ok: false,
          error: "missing_params",
          message:
            "username, password, registryAddress, ciphertext, and dataToEncryptHash are required",
        }),
      });
      return false;
    }

    const supportedAlgorithms = ["SHA-256", "SHA-1", "SHA-512"];
    if (!supportedAlgorithms.includes(hashAlgorithm)) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          ok: false,
          error: "invalid_algorithm",
          message: `Unsupported algorithm: ${hashAlgorithm}. Supported: ${supportedAlgorithms.join(
            ", "
          )}`,
        }),
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

    // Fetch the on-chain hash from the PasswordRegistry
    const provider = new ethers.providers.JsonRpcProvider(
      rpcUrl || (await Lit.Actions.getRpcUrl({ chain }))
    );
    const abi = [
      "function getPasswordHash(string username) view returns (bytes32)",
    ];
    const registry = new ethers.Contract(registryAddress, abi, provider);
    const storedHash = await registry.getPasswordHash(username);

    if (
      !storedHash ||
      storedHash.toLowerCase() !== computedHash.toLowerCase()
    ) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          ok: false,
          verified: false,
          error: "invalid_password",
        }),
      });
      return false;
    }

    // Decrypt using the same access control conditions that were used to encrypt
    const plaintext = await Lit.Actions.decryptAndCombine({
      ciphertext,
      dataToEncryptHash,
      chain,
      accessControlConditions: unifiedAccessControlConditions,
    });

    Lit.Actions.setResponse({
      response: JSON.stringify({
        ok: true,
        verified: true,
        plaintext,
      }),
    });

    return true;
  } catch (error) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        ok: false,
        error: "execution_failed",
        message: error?.message || "Password verification failed",
      }),
    });
  }

  return false;
};

go();
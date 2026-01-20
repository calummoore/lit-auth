const go = async () => {
  try {
    // Smart contract interaction using ethers (available globally)
    const url = rpcUrl || (await Lit.Actions.getRpcUrl({ chain }));
    const provider = new ethers.JsonRpcProvider(url);
    const cidContract = new ethers.Contract(
      cidContractAddress,
      cidAbi,
      provider
    );

    // Retrieve child action IPFS CID and configuration data
    let cid = await cidContract["getChildIPFSCID"]();
    let walletConfig = await cidContract["getGuardianConfig"](address);

    // Process IPFS CID format
    cid = (cid || "").toString();
    if (cid.startsWith("ipfs://")) cid = cid.slice("ipfs://".length);

    // Call child Lit Action with configuration
    const res = await Lit.Actions.call({
      ipfsId: cid,
      params: {
        childParams,
        walletConfig,
        ciphertext,
        dataToEncryptHash,
      },
    });

    let parsed;
    try {
      parsed = JSON.parse(res.response);
    } catch {
      parsed = { ok: false, error: "invalid_child_json", raw: res.response };
    }

    // Return structured response
    if (parsed && parsed.ok) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          ok: true,
          cid,
          result: parsed.result ?? null,
        }),
      });
    } else {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          ok: false,
          cid,
          error: parsed.error ?? "child_failed",
          raw: parsed.raw ?? null,
        }),
      });
    }
  } catch (error) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        ok: false,
        error: "execution_failed",
        message: error.message,
      }),
    });
  }
};

go();

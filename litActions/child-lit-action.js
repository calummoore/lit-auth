export const go = async () => {
  try {
    
    // Validate required parameters
    if (!walletConfig || !walletConfig.guardianCIDs || !walletConfig.threshold) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          ok: false,
          error: "validation_error",
          message: "Missing required walletConfig parameters",
          authenticated: 0,
          required: 0
        })
      });
      return;
    }

    if (!ciphertext || !dataToEncryptHash) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          ok: false,
          error: "validation_error",
          message: "Missing ciphertext or dataToEncryptHash",
          authenticated: 0,
          required: walletConfig.threshold
        })
      });
      return;
    }

    // Extract guardian configuration
    const { guardianCIDs, threshold } = walletConfig;
    
    if (!Array.isArray(guardianCIDs) || guardianCIDs.length === 0) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          ok: false,
          error: "validation_error",
          message: "No guardian CIDs provided",
          authenticated: 0,
          required: threshold
        })
      });
      return;
    }

    // Initialize guardian validation counter
    let authed = 0;
    
    // Validate each guardian
    for (const guardianCID of guardianCIDs) {
      try {
        // Process IPFS CID format (remove ipfs:// prefix if present)
        let cleanCID = (guardianCID || "").toString();
        if (cleanCID.startsWith("ipfs://")) {
          cleanCID = cleanCID.slice("ipfs://".length);
        }
        
        if (!cleanCID) {
          continue; // Skip invalid CIDs
        }

        // Call guardian Lit Action
        const guardianResponse = await Lit.Actions.call({
          ipfsId: cleanCID,
          jsParams: childParams || {}
        });

        // Parse guardian response
        let parsed;
        try {
          parsed = JSON.parse(guardianResponse.response);
        } catch (parseError) {
          // Guardian response is not valid JSON, treat as failure
          continue;
        }

        // Check if guardian authenticated successfully
        if (parsed && parsed.ok === true) {
          authed++;
          
          // Early termination optimization - if we have enough guardians, break
          if (authed >= threshold) {
            break;
          }
        }

      } catch (guardianError) {
        // Guardian call failed, continue to next guardian
        // Individual guardian failures should not stop the process
        continue;
      }
    }

    // Check if threshold is met
    if (authed < threshold) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          ok: false,
          error: "insufficient_guardians",
          authenticated: authed,
          required: threshold
        })
      });
      return;
    }

    // Threshold met - proceed with decryption
    try {
      const decryptedData = await Lit.Actions.decryptAndCombine({
        accessControlConditions: [],
        ciphertext: ciphertext,
        dataToEncryptHash: dataToEncryptHash,
        chain: "ethereum"
      });

      // Return successful response
      Lit.Actions.setResponse({
        response: JSON.stringify({
          ok: true,
          result: decryptedData
        })
      });

    } catch (decryptionError) {
      // Decryption failed
      Lit.Actions.setResponse({
        response: JSON.stringify({
          ok: false,
          error: "decryption_failed",
          message: decryptionError.message || "Decryption operation failed",
          authenticated: authed,
          required: threshold
        })
      });
    }

  } catch (error) {
    // General execution error
    Lit.Actions.setResponse({
      response: JSON.stringify({
        ok: false,
        error: "validation_error",
        message: error.message || "Child action execution failed",
        authenticated: 0,
        required: 0
      })
    });
  }
};
import { useEffect, useMemo, useRef, useState } from "react";
import { type LitClientType } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins } from "@lit-protocol/auth";
import {
  createPublicClient,
  createWalletClient,
  hexToSignature,
  http,
  keccak256,
  toBytes,
  custom,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { polygon } from "viem/chains";
import { getLitClient, litNetworkName } from "./litClient";
import {
  GUARDIAN_REGISTRY_ADDRESS,
  guardianRegistryAbi,
} from "./contracts/guardianRegistry";
import {
  LIT_ACTION_REGISTRY_ADDRESS,
  litActionRegistryAbi,
} from "./contracts/litActionRegistry";
import "./App.css";
import type { ShorthandResources } from "@lit-protocol/auth/src/lib/authenticators/types";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

async function hashPassword(password: string, algorithm: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest(algorithm, data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return "0x" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function App() {
  const passwordActionCidRaw = import.meta.env.VITE_PASSWORD_ACTION_CID || "";
  const passwordActionCid = passwordActionCidRaw
    .replace("ipfs://", "")
    .replace("lit-litaction://", "")
    .trim();
  const parentActionCidRaw = import.meta.env.VITE_PARENT_ACTION_CID || "";
  const parentActionCid = parentActionCidRaw
    .replace("ipfs://", "")
    .replace("lit-litaction://", "")
    .trim();
  const fallbackChildActionCidRaw = import.meta.env.VITE_CHILD_ACTION_CID || "";
  const fallbackChildActionCid = fallbackChildActionCidRaw
    .replace("ipfs://", "")
    .replace("lit-litaction://", "")
    .trim();
  const litClientRef = useRef<LitClientType | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const walletClientRef = useRef<ReturnType<typeof createWalletClient> | null>(
    null
  );
  const [password, setPassword] = useState("");
  const [ciphertext, setCiphertext] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [ephemeralAccount] = useState(() =>
    privateKeyToAccount(generatePrivateKey())
  );
  const [recoverAddress, setRecoverAddress] = useState("");
  const [childActionCid, setChildActionCid] = useState("");
  const [guardianThreshold, setGuardianThreshold] = useState<number | null>(null);
  const [guardianHashes, setGuardianHashes] = useState<string[]>([]);
  const [recoverPassword, setRecoverPassword] = useState("");
  const [recoverPasswordVerified, setRecoverPasswordVerified] = useState(false);
  const guardianRegistryAddress = GUARDIAN_REGISTRY_ADDRESS;
  const litActionRegistryAddress = LIT_ACTION_REGISTRY_ADDRESS;
  const guardianRpcUrl = import.meta.env.VITE_POLYGON_RPC_URL || "";
  const [storedEntries, setStoredEntries] = useState<
    {
      address: string;
      ciphertext: string;
      dataToEncryptHash: string;
      createdAt: string;
    }[]
  >([]);
  const [decryptedMap, setDecryptedMap] = useState<Record<string, string>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [uacc, setUacc] = useState<any>(null);
  const authManagerRef = useRef(
    createAuthManager({
      storage: storagePlugins.localStorage({
        appName: "lit-password-demo",
        networkName: "naga-dev",
      }),
    })
  );

  useEffect(() => {
    const raw = localStorage.getItem("lit-guardian-entries");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setStoredEntries(parsed);
        }
      } catch {
        // ignore parse errors
      }
    }
    const savedAddress = localStorage.getItem("lit-guardian-last-address");
    if (savedAddress) {
      setRecoverAddress(savedAddress);
    }
  }, []);

  useEffect(() => {
    if (!recoverAddress) {
      setRecoverPassword("");
      setRecoverPasswordVerified(false);
      return;
    }
    const storedPassword = localStorage.getItem(
      `lit-guardian-auth-password:${recoverAddress.toLowerCase()}`
    );
    if (storedPassword) {
      setRecoverPassword(storedPassword);
      setRecoverPasswordVerified(true);
    } else {
      setRecoverPassword("");
      setRecoverPasswordVerified(false);
    }
  }, [recoverAddress]);

  useEffect(() => {
    const fetchChildCid = async () => {
      if (!litActionRegistryAddress || !guardianRpcUrl) {
        setChildActionCid(fallbackChildActionCid);
        return;
      }
      try {
        const publicClient = createPublicClient({
          chain: polygon,
          transport: http(guardianRpcUrl),
        });
        const cid = await publicClient.readContract({
          address: litActionRegistryAddress as `0x${string}`,
          abi: litActionRegistryAbi,
          functionName: "getChildIPFSCID",
        });
        setChildActionCid(
          (cid || "")
            .toString()
            .replace("ipfs://", "")
            .replace("lit-litaction://", "")
            .trim()
        );
      } catch (err) {
        console.warn("Failed to fetch child action CID", err);
        setChildActionCid(fallbackChildActionCid);
      }
    };

    void fetchChildCid();
  }, [fallbackChildActionCid, litActionRegistryAddress, guardianRpcUrl]);

  const fetchGuardianConfig = async (address: string | null) => {
    if (!address || !guardianRegistryAddress || !guardianRpcUrl) {
      setGuardianThreshold(null);
      setGuardianHashes([]);
      return;
    }
    try {
      const publicClient = createPublicClient({
        chain: polygon,
        transport: http(guardianRpcUrl),
      });
      const res = await publicClient.readContract({
        address: guardianRegistryAddress as `0x${string}`,
        abi: guardianRegistryAbi,
        functionName: "getGuardianConfig",
        args: [address as `0x${string}`],
      });
      const threshold = Number((res as any).threshold ?? res[0] ?? 0);
      const guardians = ((res as any).guardianCIDs ?? res[1] ?? []) as `0x${string}`[];
      setGuardianThreshold(Number.isFinite(threshold) ? threshold : null);
      setGuardianHashes(guardians.map((g) => g.toLowerCase()));
    } catch (err) {
      console.warn("Failed to fetch guardian config", err);
      setGuardianThreshold(null);
      setGuardianHashes([]);
    }
  };

  useEffect(() => {
    void fetchGuardianConfig(recoverAddress);
  }, [recoverAddress, guardianRegistryAddress, guardianRpcUrl]);

  useEffect(() => {
    // Build UACC that gates on the child Lit Action
    if (!childActionCid) return;

    // this condition says:
    // if the current action running matches childActionCid, then the lit action can decrypt the data.
    // ":currentActionIpfsId" is a special parameter that the nodes will replace with the actual ipfs id of the current action running, and cannot be tampered with.
    const uacc = [
      {
        conditionType: "evmBasic",
        contractAddress: "",
        standardContractType: "",
        chain: "polygon",
        method: "",
        parameters: [":currentActionIpfsId"],
        returnValueTest: {
          comparator: "=",
          value: childActionCid,
        },
      },
    ];

    setUacc(uacc);

    // Acc builder doesn't support ":currentActionIpfsId" yet, so we manually define it.
  }, [childActionCid]);

  const persistEntry = (entry: {
    address: string;
    ciphertext: string;
    dataToEncryptHash: string;
    createdAt: string;
  }) => {
    setStoredEntries((prev) => {
      const next = [entry, ...prev];
      localStorage.setItem("lit-guardian-entries", JSON.stringify(next));
      return next;
    });
  };

  const connect = async () => {
    if (connectionState === "connecting") return;

    setConnectionState("connecting");
    setError(null);

    try {
      const litClient = await getLitClient();
      litClientRef.current = litClient;

      setConnectionState("connected");
    } catch (err) {
      setConnectionState("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const connectWallet = async () => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setError("No injected wallet found");
      return;
    }

    const [account] = await ethereum.request({
      method: "eth_requestAccounts",
    });
    setWalletAddress(account);
    walletClientRef.current = createWalletClient({
      account,
      chain: polygon,
      transport: custom(ethereum),
    });
  };

  useEffect(() => {
    const reconnectWallet = async () => {
      const ethereum = (window as any).ethereum;
      if (!ethereum) return;
      try {
        const accounts = await ethereum.request({ method: "eth_accounts" });
        if (accounts && accounts.length > 0) {
          const account = accounts[0];
          setWalletAddress(account);
          walletClientRef.current = createWalletClient({
            account,
            chain: polygon,
            transport: custom(ethereum),
          });
        }
      } catch {
        // ignore reconnect errors
      }
    };

    void reconnectWallet();
  }, []);

  const disconnect = () => {
    litClientRef.current?.disconnect();
    litClientRef.current = null;
    setConnectionState("idle");
  };

  useEffect(() => {
    // Auto-attempt Lit connection on page load
    void connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createUser = async () => {
    if (!litClientRef.current) {
      setError("Connect to Lit first");
      return;
    }
    if (!guardianRegistryAddress) {
      setError("Set VITE_GUARDIAN_REGISTRY_ADDRESS in your .env");
      return;
    }
    if (!guardianRpcUrl) {
      setError("Set VITE_POLYGON_RPC_URL in your .env");
      return;
    }
    if (!passwordActionCid) {
      setError("Set VITE_PASSWORD_ACTION_CID in your .env");
      return;
    }
    if (!childActionCid) {
      setError("Set VITE_CHILD_ACTION_CID or configure LitActionRegistry");
      return;
    }
    if (!walletClientRef.current || !walletAddress) {
      setError("Connect your wallet first");
      return;
    }
    if (!uacc) {
      setError("Access control conditions not ready yet");
      return;
    }
    if (!password) {
      setError("Enter a guardian password");
      return;
    }
    setProcessing(true);
    try {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      const address = account.address;

      const res = await litClientRef.current.encrypt({
        dataToEncrypt: privateKey,
        unifiedAccessControlConditions: uacc,
      });

      setCiphertext(res.ciphertext);
      if (res.ciphertext && res.dataToEncryptHash) {
        persistEntry({
          address,
          ciphertext: res.ciphertext,
          dataToEncryptHash: res.dataToEncryptHash,
          createdAt: new Date().toISOString(),
        });
      }

      const authValueHash = await hashPassword(password, "SHA-256");
      const guardianCIDHash = keccak256(toBytes(passwordActionCid));
      const publicClient = createPublicClient({
        chain: polygon,
        transport: http(guardianRpcUrl),
      });
      const nonce = await publicClient.readContract({
        address: guardianRegistryAddress as `0x${string}`,
        abi: guardianRegistryAbi,
        functionName: "nonces",
        args: [address as `0x${string}`],
      });
      const gasPrice = (await publicClient.getGasPrice()) * 2n;
      const deadline = Math.floor(Date.now() / 1000) + 10 * 60;
      const signature = await account.signTypedData({
        domain: {
          name: "GuardianRegistry",
          version: "1",
          chainId: polygon.id,
          verifyingContract: guardianRegistryAddress as `0x${string}`,
        },
        types: {
          AddGuardian: [
            { name: "user", type: "address" },
            { name: "guardianCIDHash", type: "bytes32" },
            { name: "authValueHash", type: "bytes32" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "AddGuardian",
        message: {
          user: address as `0x${string}`,
          guardianCIDHash,
          authValueHash: authValueHash as `0x${string}`,
          nonce,
          deadline,
        },
      });
      const { v, r, s } = hexToSignature(signature);
      const txHash = await walletClientRef.current.writeContract({
        address: guardianRegistryAddress as `0x${string}`,
        abi: guardianRegistryAbi,
        functionName: "addGuardianWithSig",
        args: [
          address as `0x${string}`,
          guardianCIDHash,
          authValueHash as `0x${string}`,
          nonce,
          deadline,
          v,
          r,
          s,
        ],
        account: walletAddress as `0x${string}`,
        chain: polygon,
        gasPrice,
      });

      localStorage.setItem("lit-guardian-last-address", address);
      setRecoverAddress(address);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await fetchGuardianConfig(address);
      setPassword("");
      setError(null);
      console.log("Guardian registered tx:", txHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setProcessing(false);
    }
  };

  const runRecoveryLitAction = async (
    entry: {
      address: string;
      ciphertext: string;
      dataToEncryptHash: string;
    },
    providedPassword: string
  ) => {
    if (!parentActionCid) {
      setError(
        "Set VITE_PARENT_ACTION_CID to the IPFS CID of parent-lit-action.js before decrypting."
      );
      return false;
    }
    if (!litClientRef.current) {
      setError("Connect to Lit first");
      return false;
    }
    if (!guardianRegistryAddress || !litActionRegistryAddress) {
      setError("Set registry addresses in your .env");
      return false;
    }
    if (!providedPassword || !recoverPasswordVerified) {
      setError("Verify your password first");
      return false;
    }
    setProcessing(true);
    try {
      const litClient = litClientRef.current;
      const expiration = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const resources: ShorthandResources = [
        ["access-control-condition-decryption", "*"],
        ["lit-action-execution", "*"],
      ];

      const authContext = await authManagerRef.current.createEoaAuthContext({
        config: {
          account: ephemeralAccount,
        },
        authConfig: {
          domain: window.location.host,
          statement: "Lit password check",
          expiration,
          resources,
        },
        litClient,
      });

      const response = await litClient.executeJs({
        ipfsId: parentActionCid,
        authContext,
        jsParams: {
          guardianRegistryAddress,
          litActionRegistryAddress,
          userAddress: entry.address,
          guardians: [
            {
              cid: passwordActionCid,
              data: {
                password: providedPassword,
                hashAlgorithm: "SHA-256",
              },
            },
          ],
          ciphertext: entry.ciphertext,
          dataToEncryptHash: entry.dataToEncryptHash,
          unifiedAccessControlConditions: uacc,
        },
      });

      console.log(response);

      let parsed: any;
      try {
        parsed = JSON.parse(response.response as string);
      } catch {
        parsed = null;
      }

      if (!parsed?.ok) {
        setError(formatLitError(parsed, "Recovery failed"));
        return false;
      }

      setDecryptedMap((prev) => ({
        ...prev,
        [entry.dataToEncryptHash]: parsed.result ?? "",
      }));
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lit action failed");
      return false;
    } finally {
      setProcessing(false);
    }
  };

  const clearLocalData = () => {
    localStorage.removeItem("lit-guardian-entries");
    localStorage.removeItem("lit-guardian-last-address");
    if (recoverAddress) {
      localStorage.removeItem(
        `lit-guardian-auth-password:${recoverAddress.toLowerCase()}`
      );
    }
    setStoredEntries([]);
    setDecryptedMap({});
    setCiphertext(null);
    setRecoverAddress("");
    setRecoverPassword("");
    setRecoverPasswordVerified(false);
    setError(null);
    setMenuOpen(false);
  };

  const cipherSummary = useMemo(() => {
    if (!ciphertext) return null;
    return `${ciphertext.slice(0, 32)}...`;
  }, [ciphertext]);

  const selectedEntry = useMemo(() => {
    if (!recoverAddress) return null;
    const normalized = recoverAddress.toLowerCase();
    return (
      storedEntries.find(
        (entry) => entry.address.toLowerCase() === normalized
      ) || null
    );
  }, [recoverAddress, storedEntries]);

  const passwordGuardianHash = useMemo(() => {
    if (!passwordActionCid) return "";
    return keccak256(toBytes(passwordActionCid)).toLowerCase();
  }, [passwordActionCid]);

  const requiresPassword = useMemo(() => {
    if (!guardianHashes.length || !passwordGuardianHash) return false;
    return guardianHashes.includes(passwordGuardianHash);
  }, [guardianHashes, passwordGuardianHash]);

  const authedCount = useMemo(() => {
    if (!requiresPassword) return 0;
    return recoverPasswordVerified ? 1 : 0;
  }, [requiresPassword, recoverPasswordVerified]);

  const thresholdMet = useMemo(() => {
    if (guardianThreshold === null) return false;
    return authedCount >= guardianThreshold;
  }, [authedCount, guardianThreshold]);

  const authCountLabel = useMemo(() => {
    if (guardianThreshold === null) return "—";
    return `${authedCount}/${guardianThreshold} verified`;
  }, [authedCount, guardianThreshold]);

  const formatLitError = (parsed: any, fallback: string) => {
    const code = parsed?.error ?? fallback;
    const message = parsed?.message ? `: ${parsed.message}` : "";
    const action = parsed?.action ? ` (${parsed.action})` : "";
    return `${code}${message}${action}`;
  };

  const verifyPasswordAuth = async () => {
    if (!recoverAddress) {
      setError("Enter a recovery address first");
      return;
    }
    if (!recoverPassword) {
      setError("Enter a password to verify");
      return;
    }
    if (!passwordActionCid) {
      setError("Set VITE_PASSWORD_ACTION_CID in your .env");
      return;
    }
    if (!guardianRegistryAddress || !guardianRpcUrl) {
      setError("Set guardian registry address and RPC URL");
      return;
    }
    if (!litClientRef.current) {
      setError("Connect to Lit first");
      return;
    }

    setProcessing(true);
    try {
      const publicClient = createPublicClient({
        chain: polygon,
        transport: http(guardianRpcUrl),
      });
      const authValueHash = await publicClient.readContract({
        address: guardianRegistryAddress as `0x${string}`,
        abi: guardianRegistryAbi,
        functionName: "getGuardianEntry",
        args: [recoverAddress as `0x${string}`, passwordGuardianHash as `0x${string}`],
      });

      const litClient = litClientRef.current;
      const expiration = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const resources: ShorthandResources = [
        ["lit-action-execution", "*"],
      ];
      const authContext = await authManagerRef.current.createEoaAuthContext({
        config: {
          account: ephemeralAccount,
        },
        authConfig: {
          domain: window.location.host,
          statement: "Verify guardian password",
          expiration,
          resources,
        },
        litClient,
      });

      const response = await litClient.executeJs({
        ipfsId: passwordActionCid,
        authContext,
        jsParams: {
          password: recoverPassword,
          authValueHash,
          hashAlgorithm: "SHA-256",
        },
      });

      let parsed: any;
      try {
        parsed = JSON.parse(response.response as string);
      } catch {
        parsed = null;
      }

      if (!parsed?.ok) {
        setError(formatLitError(parsed, "Password verification failed"));
        setRecoverPasswordVerified(false);
        return;
      }

      localStorage.setItem(
        `lit-guardian-auth-password:${recoverAddress.toLowerCase()}`,
        recoverPassword
      );
      setRecoverPasswordVerified(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password verification failed");
      setRecoverPasswordVerified(false);
    } finally {
      setProcessing(false);
    }
  };

  const guardianSummaries = useMemo(() => {
    if (!guardianHashes.length) return [];
    const passwordHash =
      passwordActionCid ? keccak256(toBytes(passwordActionCid)).toLowerCase() : "";
    return guardianHashes.map((hash) => {
      if (passwordHash && hash === passwordHash) {
        return "Password";
      }
      return `Unknown (${hash.slice(0, 10)}…)`;
    });
  }, [guardianHashes, passwordActionCid]);

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Lit Protocol • NagaDev</p>
          <h1>
            Guardian-gated recovery{" "}
            <span className="brand-accent">+ Lit Actions</span>
          </h1>
          <p className="lede">
            Generate a recovery key, encrypt it with Lit, and require guardian
            approval (password guardian initially) to decrypt it.
          </p>
          <div className="actions">
            <button
              className="primary"
              onClick={() => {
                if (litClientRef.current) {
                  disconnect();
                } else {
                  void connect();
                }
              }}
              disabled={connectionState === "connecting"}
            >
              {connectionState === "connecting"
                ? "Connecting…"
                : litClientRef.current
                  ? `Disconnect from ${litNetworkName}`
                  : `Connect to ${litNetworkName}`}
            </button>
            <button
              className="ghost"
              onClick={connectWallet}
              disabled={processing}
            >
              {walletAddress ? "Wallet connected" : "Connect wallet"}
            </button>
            <div className="menu">
              <button
                className="ghost menu-trigger"
                onClick={() => setMenuOpen((v) => !v)}
              >
                ⋯
              </button>
              {menuOpen ? (
                <div className="menu-items">
                  <button className="ghost danger" onClick={clearLocalData}>
                    Reset local data
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="status-row">
            <span className={`status-pill ${connectionState}`}>
              {connectionState === "idle" && "Idle"}
              {connectionState === "connecting" && "Connecting"}
              {connectionState === "connected" && "Lit connected"}
              {connectionState === "error" && "Error"}
            </span>
            <span className="status-text">
              {walletAddress
                ? `Wallet: ${walletAddress}`
                : "No wallet connected"}
            </span>
          </div>
          
          {error ? <p className="error-text">Error: {error}</p> : null}
        </div>
      </header>

      <section className="grid">
        <article className="card highlight">
          <h2>Create User</h2>
          <div className="field-row">
            <label>Guardian registry</label>
            <div className="value monospace">
              {guardianRegistryAddress || "Set VITE_GUARDIAN_REGISTRY_ADDRESS"}
            </div>
          </div>
          <div className="field-row">
            <label>Lit action registry</label>
            <div className="value monospace">
              {litActionRegistryAddress ||
                "Set VITE_LIT_ACTION_REGISTRY_ADDRESS"}
            </div>
          </div>
          <div className="field-row">
            <label>Guardian password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="actions">
            <button
              className="primary"
              onClick={createUser}
              disabled={processing}
            >
              Create recovery key
            </button>
          </div>
          <div className="stacked">
            <div className="label">Encrypted key (latest)</div>
            <div className="value monospace">{cipherSummary || "—"}</div>
          </div>
        </article>

        <article className="card">
          <h2>Recovery status</h2>
          <div className="field-row">
            <label>Recovery address</label>
            <div className="value monospace">{recoverAddress || "—"}</div>
          </div>
          <div className="field-row">
            <label>Threshold</label>
            <div className="value monospace">
              {guardianThreshold !== null ? guardianThreshold : "—"}
            </div>
          </div>
          <div className="stacked">
            <div className="label">Guardians</div>
            <div className="value monospace">
              {guardianHashes.length
                ? guardianHashes.map((hash) => `${hash.slice(0, 10)}…`).join(", ")
                : "—"}
            </div>
          </div>
          <div className="stacked">
            <div className="label">Guardian CIDs</div>
            <div className="value monospace">
              {guardianSummaries.length ? guardianSummaries.join(", ") : "—"}
            </div>
          </div>
        </article>

        <article className="card">
          <h2>Lit Action config</h2>
          <div className="stacked">
            <div className="label">Parent action CID</div>
            <div className="value monospace">
              {parentActionCid || "Set VITE_PARENT_ACTION_CID"}
            </div>
          </div>
          <div className="stacked">
            <div className="label">Child action CID</div>
            <div className="value monospace">
              {childActionCid || "Set VITE_CHILD_ACTION_CID"}
            </div>
          </div>
          <div className="stacked">
            <div className="label">Password guardian CID</div>
            <div className="value monospace">
              {passwordActionCid || "Set VITE_PASSWORD_ACTION_CID"}
            </div>
          </div>
        </article>

        <article className="card wide">
          <h2>Recovery auths (local)</h2>
          <p className="small-muted">
            Complete the required auths to unlock the recovery key.
          </p>
          <div className="field-row">
            <label>Password</label>
            <input
              type="password"
              value={recoverPassword}
              onChange={(e) => setRecoverPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button
              className="ghost"
              onClick={verifyPasswordAuth}
              disabled={processing || !recoverPassword || !recoverAddress}
            >
              Verify
            </button>
          </div>
          <div className="field-row">
            <label>Status</label>
            <div className="value">
              {authCountLabel}{" "}
              {requiresPassword
                ? recoverPasswordVerified
                  ? "• ✅ Password verified"
                  : "• Password not verified"
                : "• Password not required"}
            </div>
          </div>
          <div className="actions">
            <button
              className="primary"
              onClick={async () => {
                if (!selectedEntry) {
                  setError("No local recovery key for this address");
                  return;
                }
                const ok = await runRecoveryLitAction(
                  selectedEntry,
                  recoverPassword
                );
                if (ok) {
                  setRecoverPassword("");
                }
              }}
              disabled={!selectedEntry || !thresholdMet || processing}
            >
              Recover
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}

export default App;

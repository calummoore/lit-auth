import { useEffect, useMemo, useRef, useState } from "react";
import { type LitClientType } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins } from "@lit-protocol/auth";
import { createAccBuilder } from "@lit-protocol/access-control-conditions";
import { custom, createWalletClient } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { polygon } from "viem/chains";
import { getLitClient, litNetworkName } from "./litClient";
import {
  PASSWORD_REGISTRY_ADDRESS,
  passwordRegistryAbi,
} from "./contracts/passwordRegistry";
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
  const litClientRef = useRef<LitClientType | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const walletClientRef = useRef<ReturnType<typeof createWalletClient> | null>(
    null
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [encryptUsername, setEncryptUsername] = useState("");
  const [message, setMessage] = useState("");
  const [ciphertext, setCiphertext] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [ephemeralAccount] = useState(() =>
    privateKeyToAccount(generatePrivateKey())
  );
  const [lastUsername, setLastUsername] = useState("");
  const registryAddress = PASSWORD_REGISTRY_ADDRESS;
  const [storedEntries, setStoredEntries] = useState<
    {
      username: string;
      ciphertext: string;
      dataToEncryptHash: string;
      createdAt: string;
    }[]
  >([]);
  const [decryptedMap, setDecryptedMap] = useState<Record<string, string>>({});
  const [modalEntry, setModalEntry] = useState<{
    username: string;
    ciphertext: string;
    dataToEncryptHash: string;
    createdAt: string;
  } | null>(null);
  const [modalPassword, setModalPassword] = useState("");
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
    const raw = localStorage.getItem("lit-password-entries");
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
    const savedUser = localStorage.getItem("lit-password-last-user");
    if (savedUser) {
      setLastUsername(savedUser);
      setEncryptUsername(savedUser);
    }
  }, []);

  useEffect(() => {
    // Build UACC that gates on the password action Lit Action
    if (!passwordActionCid) return;
    
    // this condition says:
    // if the current action running matches passwordActionCid, then the lit action can decrypt the data.  
    // ":currentActionIpfsId" is a special parameter that the nodes will replace with the actual ipfs id of the current action running, and cannot be tampered with.
    const uacc = [{
      conditionType: "evmBasic",
      contractAddress: '',
      standardContractType: '',
      chain: 'ethereum',
      method: '',
      parameters: [':currentActionIpfsId'],
      returnValueTest: {
        comparator: '=',
        value: passwordActionCid,
      },
    }];

    setUacc(uacc);
    
    // it doesn't seem like the Acc Builder supports this feature of using
    // ":currentActionIpfsId" to dynamically check the current action running so we manually define it above.
    // const builder = createAccBuilder()
    //   .requireLitAction(passwordActionCid, "verified", [], "true", "=")
    //   .and()
    //   .requireEthBalance("0", ">=")
    //   .on("polygon");

    // setUacc(builder.build());
  }, [passwordActionCid]);

  const persistEntry = (entry: {
    username: string;
    ciphertext: string;
    dataToEncryptHash: string;
    createdAt: string;
  }) => {
    setStoredEntries((prev) => {
      const next = [entry, ...prev];
      localStorage.setItem("lit-password-entries", JSON.stringify(next));
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

  const savePasswordOnChain = async () => {
    if (!walletClientRef.current || !walletAddress) {
      setError("Connect your wallet first");
      return;
    }
    if (!registryAddress) {
      setError("Set VITE_PASSWORD_REGISTRY_ADDRESS in your .env");
      return;
    }
    setProcessing(true);
    try {
      const passwordHash = await hashPassword(password, "SHA-256");
      const txHash = await walletClientRef.current.writeContract({
        address: registryAddress as `0x${string}`,
        abi: passwordRegistryAbi,
        functionName: "setPasswordHash",
        args: [username, passwordHash as `0x${string}`],
        account: walletAddress as `0x${string}`,
        chain: polygon,
      });
      localStorage.setItem("lit-password-last-user", username);
      setLastUsername(username);
      setEncryptUsername(username);
      setUsername("");
      setPassword("");
      setError(null);
      console.log("Saved password hash tx:", txHash);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to store password hash"
      );
    } finally {
      setProcessing(false);
    }
  };

  const updateEncryptUsername = (value: string) => {
    setEncryptUsername(value);
    localStorage.setItem("lit-password-last-user", value);
    setLastUsername(value);
  };

  const encryptMessage = async () => {
    if (!litClientRef.current) {
      setError("Connect to Lit first");
      return;
    }
    const selectedUser = encryptUsername || lastUsername;
    if (!selectedUser) {
      setError("Provide a username to tag this encryption");
      return;
    }
    localStorage.setItem("lit-password-last-user", selectedUser);
    setLastUsername(selectedUser);
    setProcessing(true);
    try {
      const res = await litClientRef.current.encrypt({
        dataToEncrypt: message,
        unifiedAccessControlConditions: uacc,
      });

      setCiphertext(res.ciphertext);
      if (selectedUser && res.ciphertext && res.dataToEncryptHash) {
        persistEntry({
          username: selectedUser,
          ciphertext: res.ciphertext,
          dataToEncryptHash: res.dataToEncryptHash,
          createdAt: new Date().toISOString(),
        });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Encrypt failed");
    } finally {
      setProcessing(false);
    }
  };

  const runPasswordLitAction = async (
    entry: {
      username: string;
      ciphertext: string;
      dataToEncryptHash: string;
    },
    providedPassword: string
  ) => {
    if (!passwordActionCid) {
      setError(
        "Set VITE_PASSWORD_ACTION_CID to the IPFS CID of password.js before decrypting."
      );
      return false;
    }
    if (!litClientRef.current) {
      setError("Connect to Lit first");
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

      console.log("jsParams", {
        username: entry.username,
        password: providedPassword,
        registryAddress,
        ciphertext: entry.ciphertext,
        dataToEncryptHash: entry.dataToEncryptHash,
        chain: "polygon",
        unifiedAccessControlConditions: uacc,
      });

      const response = await litClient.executeJs({
        ipfsId: passwordActionCid,
        authContext,
        jsParams: {
          username: entry.username,
          password: providedPassword,
          registryAddress,
          ciphertext: entry.ciphertext,
          dataToEncryptHash: entry.dataToEncryptHash,
          chain: "polygon",
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
        setError(parsed?.error ?? "Password verification failed");
        return false;
      }

      setDecryptedMap((prev) => ({
        ...prev,
        [entry.dataToEncryptHash]: parsed.plaintext ?? "",
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

  const openDecryptModal = (entry: {
    username: string;
    ciphertext: string;
    dataToEncryptHash: string;
    createdAt: string;
  }) => {
    setModalEntry(entry);
    setModalPassword("");
    setError(null);
  };

  const closeDecryptModal = () => {
    setModalEntry(null);
    setModalPassword("");
  };

  const clearLocalData = () => {
    localStorage.removeItem("lit-password-entries");
    setStoredEntries([]);
    setDecryptedMap({});
    setCiphertext(null);
    setError(null);
    setMenuOpen(false);
  };

  const cipherSummary = useMemo(() => {
    if (!ciphertext) return null;
    return `${ciphertext.slice(0, 32)}...`;
  }, [ciphertext]);

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Lit Protocol • NagaDev</p>
          <h1>
            Password-gated Lit Actions{" "}
            <span className="brand-accent">+ Polygon PasswordRegistry</span>
          </h1>
          <p className="lede">
            Store a password hash on-chain, encrypt data with Lit, and decrypt
            via a Lit Action that verifies the password hash in the registry.
          </p>
          <div className="actions">
            <button
              className="primary"
              onClick={connect}
              disabled={connectionState === "connecting"}
            >
              {connectionState === "connecting"
                ? "Connecting…"
                : `Connect to ${litNetworkName}`}
            </button>
            <button
              className="ghost"
              onClick={disconnect}
              disabled={!litClientRef.current}
            >
              Disconnect
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
            <label>Registry address</label>
            <div className="value monospace">
              {registryAddress || "Set VITE_PASSWORD_REGISTRY_ADDRESS"}
            </div>
          </div>
          <div className="field-row">
            <label>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="alice"
            />
          </div>
          <div className="field-row">
            <label>Password</label>
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
              onClick={savePasswordOnChain}
              disabled={processing}
            >
              Save hash to registry
            </button>
          </div>
        </article>

        <article className="card">
          <h2>Encrypt</h2>
          <div className="field-row">
            <label>Username</label>
            <input
              value={encryptUsername}
              onChange={(e) => updateEncryptUsername(e.target.value)}
              placeholder="alice"
            />
          </div>
          <div className="field-row">
            <label>Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Text to encrypt"
            />
          </div>
          <div className="actions">
            <button
              className="primary"
              onClick={encryptMessage}
              disabled={processing}
            >
              Encrypt with Lit
            </button>
          </div>
          <div className="stacked">
            <div className="label">Ciphertext</div>
            <div className="value monospace">{cipherSummary || "—"}</div>
          </div>
        </article>

        <article className="card">
          <h2>Decrypt instructions</h2>
          <p className="small-muted">
            Use the decrypt button next to any saved entry to enter a password
            and run the Lit Action. Output is shown inline with the entry.
          </p>
        </article>

        {storedEntries.length > 0 ? (
          <article className="card wide">
            <h2>Saved encryptions (local storage)</h2>
            <div className="table">
              <div className="table-head">
                <span>Username</span>
                <span>Ciphertext</span>
                <span>Hash</span>
                <span>Saved</span>
                <span>Actions</span>
                <span>Plaintext</span>
              </div>
              <div className="table-body">
                {storedEntries.map((entry, idx) => (
                  <SavedEntryRow
                    key={`${entry.username}-${idx}`}
                    entry={entry}
                    onDecrypt={() => openDecryptModal(entry)}
                    disabled={processing}
                    plaintext={decryptedMap[entry.dataToEncryptHash]}
                  />
                ))}
              </div>
            </div>
          </article>
        ) : null}
      </section>

      {modalEntry ? (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Decrypt {modalEntry.username}</h3>
            <p className="small-muted">
              Enter the password to verify against the on-chain hash and decrypt
              the ciphertext.
            </p>
            <div className="field-row">
              <label>Password</label>
              <input
                type="password"
                value={modalPassword}
                onChange={(e) => setModalPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <form
              className="actions"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await runPasswordLitAction(
                  modalEntry,
                  modalPassword
                );
                if (ok) {
                  closeDecryptModal();
                }
              }}
            >
              <button
                type="submit"
                className="primary"
                disabled={processing || !modalPassword}
              >
                Decrypt
              </button>
              <button
                type="button"
                className="ghost"
                onClick={closeDecryptModal}
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type SavedEntryProps = {
  entry: {
    username: string;
    ciphertext: string;
    dataToEncryptHash: string;
    createdAt: string;
  };
  onDecrypt: () => void;
  disabled?: boolean;
  plaintext?: string;
};

function SavedEntryRow({
  entry,
  onDecrypt,
  disabled,
  plaintext,
}: SavedEntryProps) {
  return (
    <div className="table-row">
      <span className="value">{entry.username}</span>
      <span className="value monospace">{entry.ciphertext.slice(0, 24)}…</span>
      <span className="value monospace">
        {entry.dataToEncryptHash.slice(0, 18)}…
      </span>
      <span className="value">
        {new Date(entry.createdAt).toLocaleString()}
      </span>
      <span className="value">
        <button className="primary" onClick={onDecrypt} disabled={disabled}>
          Decrypt
        </button>
      </span>
      <span className="value monospace stacked">{plaintext ?? "—"}</span>
    </div>
  );
}

export default App;

import fs from "node:fs/promises";
import { createLitClient } from "@lit-protocol/lit-client";
import { nagaDev } from "@lit-protocol/networks";
import { keccak256, stringToBytes } from "viem";

const cidsPath = new URL("../litActions/cids.json", import.meta.url);
const pksPath = new URL("../litActions/public_keys.json", import.meta.url);

const cidsRaw = await fs.readFile(cidsPath, "utf-8");
const cids = JSON.parse(cidsRaw);

const litClient = await createLitClient({ network: nagaDev });

const normalizeName = (name) => {
  let base = name.endsWith("_CID") ? name.replace(/_CID$/, "") : name;
  if (base.startsWith("VITE_")) {
    base = base.replace(/^VITE_/, "");
  }
  if (base.endsWith("_ACTION")) {
    base = base.replace(/_ACTION$/, "");
  }
  return base;
};

try {
  const pks = {};
  const cidToName = {};
  for (const [name, actionIpfsCid] of Object.entries(cids)) {
    const pkName = normalizeName(name);

    const existingName = cidToName[actionIpfsCid];
    if (existingName) {
      if (existingName === "CHILD") {
        continue;
      }
      if (pkName !== "CHILD") {
        continue;
      }
      delete pks[existingName];
    }

    const derivedKeyId = keccak256(
      stringToBytes(`lit_action_${actionIpfsCid}`)
    );
    const actionPublicKey = await litClient.utils.getDerivedKeyId(derivedKeyId);
    pks[pkName] = actionPublicKey;
    cidToName[actionIpfsCid] = pkName;
  }

  await fs.writeFile(pksPath, JSON.stringify(pks, null, 2));
  console.log(`Wrote ${Object.keys(pks).length} keys to ${pksPath.pathname}`);
} finally {
  await litClient.disconnect();
}

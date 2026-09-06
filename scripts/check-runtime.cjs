const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const base = path.resolve(__dirname, "../resources");
const manifest = JSON.parse(
  fs.readFileSync(path.join(base, "runtime-manifest.json")),
);
const hash = createHash("sha256")
  .update(fs.readFileSync(path.join(base, "runtime.tar")))
  .digest("hex");
if (hash !== manifest.sha256)
  throw new Error("Runtime image hash mismatch. Run npm run runtime:build.");
console.log("Bundled runtime SHA256 verified:", hash);

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
const update = JSON.parse(
  fs.readFileSync(path.join(base, "course-update.json")),
);
const version = require("../package.json").version;
if (update.version !== version || manifest.version !== version)
  throw new Error(
    "Bundled course version mismatch. Run npm run runtime:refresh.",
  );
for (const name of ["engine.py", "lessons.json"]) {
  const entry = update.files[name];
  const bytes = Buffer.from(entry.data, "base64");
  if (
    createHash("sha256").update(bytes).digest("hex") !== entry.sha256 ||
    !bytes.equals(
      Buffer.from(
        fs
          .readFileSync(path.resolve(base, "../runtime", name), "utf8")
          .replaceAll("\r\n", "\n"),
      ),
    )
  )
    throw new Error(
      `Stale course payload: ${name}. Run npm run runtime:refresh.`,
    );
}
console.log("Bundled runtime SHA256 verified:", hash);

const fs = require("node:fs");
const path = require("node:path");
const source = path.resolve(__dirname, "../../runtime");
const target = path.resolve(__dirname, "../runtime");
fs.mkdirSync(target, { recursive: true });
for (const name of fs.readdirSync(source)) {
  if (name.endsWith(".py") || name === "lessons.json") {
    fs.copyFileSync(path.join(source, name), path.join(target, name));
  }
}
fs.mkdirSync(path.resolve(__dirname, "../../release"), { recursive: true });
console.log("Shared course runtime copied into extension package.");

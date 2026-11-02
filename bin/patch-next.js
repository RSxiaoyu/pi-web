"use strict";

// Next.js 16.3/16.4 PR #101974 calls headers.hasOwnProperty(...) in checkIsOnDemandRevalidate.
// In Node.js http.IncomingMessage, req.headers has a null prototype (Object.create(null)),
// causing TypeError: headers.hasOwnProperty is not a function on incoming HTTP requests.
// This self-healing patch ensures null-prototype safety until upstream Next.js fixes it.

const fs = require("node:fs");
const path = require("node:path");

function patchNext() {
  let nextPkgDir;
  try {
    nextPkgDir = path.dirname(require.resolve("next/package.json", { paths: [__dirname] }));
  } catch {
    return;
  }

  // 1. Patch server/api-utils
  const targets = [
    path.join(nextPkgDir, "dist/server/api-utils/index.js"),
    path.join(nextPkgDir, "dist/esm/server/api-utils/index.js"),
  ];

  for (const file of targets) {
    if (!fs.existsSync(file)) continue;
    let code = fs.readFileSync(file, "utf8");
    if (code.includes("headers.hasOwnProperty(")) {
      code = code.replace(
        /const revalidateOnlyGenerated = headers\.hasOwnProperty\(([^)]+)\);/g,
        "const revalidateOnlyGenerated = Boolean(headers && Object.prototype.hasOwnProperty.call(headers, $1));"
      );
      fs.writeFileSync(file, code);
    }
  }

  // 2. Patch compiled next-server runtimes
  const compiledDir = path.join(nextPkgDir, "dist/compiled/next-server");
  if (!fs.existsSync(compiledDir)) return;
  const files = fs.readdirSync(compiledDir);
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const full = path.join(compiledDir, f);
    let code = fs.readFileSync(full, "utf8");
    let changed = false;
    if (code.includes("revalidateOnlyGenerated:e.hasOwnProperty(")) {
      code = code.replaceAll("revalidateOnlyGenerated:e.hasOwnProperty(", "revalidateOnlyGenerated:Object.prototype.hasOwnProperty.call(e,");
      changed = true;
    }
    if (code.includes("revalidateOnlyGenerated:rawHeaders.hasOwnProperty(")) {
      code = code.replaceAll("revalidateOnlyGenerated:rawHeaders.hasOwnProperty(", "revalidateOnlyGenerated:Object.prototype.hasOwnProperty.call(rawHeaders,");
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(full, code);
    }
  }
}

patchNext();

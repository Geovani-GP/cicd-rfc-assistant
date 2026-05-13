const { copyFileSync } = require("node:fs");
const { join } = require("node:path");

copyFileSync(join(__dirname, "../electron/preload.cjs"), join(__dirname, "../dist-electron/preload.cjs"));

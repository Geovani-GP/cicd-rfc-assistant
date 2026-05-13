const { spawn } = require("node:child_process");

const child = spawn("npx", ["electron", "."], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: "http://127.0.0.1:5173"
  }
});

child.on("exit", (code) => process.exit(code ?? 0));

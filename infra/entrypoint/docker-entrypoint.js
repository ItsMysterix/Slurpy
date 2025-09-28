#!/usr/bin/env node
const { spawn } = require('node:child_process');
const env = { ...process.env };

(async () => {
  const launch = process.argv.slice(2).join(' ');

  // Only prerender if explicitly enabled (e.g., PRERENDER_ON_BOOT=true)
  if (env.PRERENDER_ON_BOOT === 'true') {
    await exec('npx next build --experimental-build-mode generate');
  }

  await exec(launch);
})();

function exec(command) {
  const child = spawn(command, { shell: true, stdio: 'inherit', env });
  return new Promise((resolve, reject) => {
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`${command} failed rc=${code}`))));
  });
}

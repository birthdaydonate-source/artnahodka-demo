const { spawn } = require('node:child_process');

// Wait for the HTTP listener before navigating: fast runners can launch Chromium
// before Python has bound its port.
module.exports = (root, port) => {
  const process = spawn('python3', ['-u', '-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', root], { stdio: ['ignore', 'pipe', 'pipe'] });
  const ready = new Promise((resolve, reject) => {
    let output = '', errors = '', settled = false;
    const timer = setTimeout(() => finish(new Error(`HTTP server did not start: ${errors}`)), 10000);
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve();
    }
    process.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('Serving HTTP on')) finish();
    });
    process.stderr.on('data', chunk => { errors += chunk; });
    process.on('error', finish);
    process.on('exit', code => finish(new Error(`HTTP server exited (${code}): ${errors}`)));
  });
  return { ready, kill: () => process.kill() };
};

// Guards against a foot-gun: on macOS/Linux, a process bound to
// 127.0.0.1:PORT can silently take priority over Docker's *:PORT
// mapping. If that happens here, the app connects to the OTHER
// Mongo/Redis (e.g. a Homebrew service) instead of the containers
// this project just started — with no error, just wrong data.
//
// Run before `docker compose up`: for each port, if something is
// already listening AND this project's own container for that
// service isn't the one running yet, abort with a clear message
// instead of starting a container that will end up shadowed.
import { execSync } from 'node:child_process';
import net from 'node:net';

const CHECKS = [
  { port: 27017, service: 'mongo', hint: 'a native/Homebrew MongoDB (mongod)' },
  { port: 6379, service: 'redis', hint: 'a native/Homebrew Redis (redis-server)' },
];

function isListening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port, timeout: 500 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function composeContainerRunning(service) {
  try {
    const id = execSync(`docker compose ps -q ${service}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return id.length > 0;
  } catch {
    return false;
  }
}

const problems = [];
for (const { port, service, hint } of CHECKS) {
  if ((await isListening(port)) && !composeContainerRunning(service)) {
    problems.push({ port, service, hint });
  }
}

if (problems.length) {
  console.error('\n✖ Port conflict detected before starting Docker infra:\n');
  for (const { port, hint } of problems) {
    console.error(`  - localhost:${port} is already in use, likely by ${hint}.`);
  }
  console.error(`
  Starting the Docker container anyway would look like it worked, but the
  app (which connects to 127.0.0.1) can end up silently talking to the
  OTHER service instead of the container — same symptom as a stale/duplicate
  database with no error message.

  Fix: stop the conflicting service, e.g.
    brew services stop redis
    brew services stop mongodb-community   # or: launchctl bootout gui/$(id -u)/homebrew.mxcl.mongodb-community

  Then re-run: npm run infra
`);
  process.exit(1);
}

import { spawnSync } from 'node:child_process';

const r = spawnSync('npx', ['vitest', 'run', 'tests/selfplay'], {
  stdio: 'inherit', shell: true, env: { ...process.env, UG_SELFPLAY: '1' },
});
process.exit(r.status ?? 1);

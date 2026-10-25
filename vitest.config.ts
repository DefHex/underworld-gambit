import { defineConfig } from 'vitest/config';

// Self-play takes minutes, so it only runs via `npm run selfplay`.
export default defineConfig({
  test: { exclude: process.env.UG_SELFPLAY ? ['node_modules/**'] : ['node_modules/**', 'tests/selfplay/**'], globals: true },
});

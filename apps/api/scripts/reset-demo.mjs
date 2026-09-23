import { spawnSync } from 'node:child_process';
if (process.env.NODE_ENV === 'production') throw new Error('Demo reset is forbidden in production.');
if (process.env.DEMO_RESET_CONFIRMED !== 'yes') throw new Error('Set DEMO_RESET_CONFIRMED=yes to reset an isolated demo/UAT database.');
const url = new URL(process.env.DATABASE_URL ?? '');
const database = url.pathname.replace(/^\//, '').toLowerCase();
if (!/(demo|uat|test)/.test(database)) throw new Error('Refusing to reset a database whose name does not contain demo, uat, or test.');
const result = spawnSync('corepack', ['pnpm', '--filter', '@platform/database', 'exec', 'prisma', 'migrate', 'reset', '--force'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (result.status !== 0) process.exitCode = result.status ?? 1;

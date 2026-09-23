import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/scripts/*.mjs', 'packages/database/prisma/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', Headers: 'readonly', URL: 'readonly' },
    },
  },
  { ignores: ['**/dist/**','**/node_modules/**','**/coverage/**','**/generated/**','**/playwright-report/**','**/test-results/**'] },
);

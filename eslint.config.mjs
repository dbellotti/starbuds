import path from 'node:path';
import { fileURLToPath } from 'node:url';

import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TS_PROJECT_FILES = [
  'packages/client/tsconfig.json',
  'packages/server/tsconfig.json',
  'packages/shared/tsconfig.json'
];

const tsRecommended = tseslint.configs.recommendedTypeChecked.map((config) => ({
  ...config,
  files: ['**/*.{ts,tsx}'],
  languageOptions: {
    ...(config.languageOptions ?? {}),
    parserOptions: {
      ...(config.languageOptions?.parserOptions ?? {}),
      projectService: true,
      project: TS_PROJECT_FILES,
      tsconfigRootDir: __dirname,
      sourceType: 'module'
    }
  }
}));

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', '**/*.cjs', 'package-lock.json']
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  js.configs.recommended,
  ...tsRecommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      import: importPlugin
    },
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.mjs', '.ts', '.tsx']
        }
      }
    },
    rules: {
      'import/order': [
        'warn',
        {
          groups: [['builtin', 'external'], ['internal'], ['parent', 'sibling', 'index']],
          pathGroups: [
            {
              pattern: '@farsight/**',
              group: 'internal',
              position: 'before'
            }
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          alphabetize: { order: 'asc', caseInsensitive: true },
          'newlines-between': 'always'
        }
      ],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/consistent-type-imports': 'warn'
    }
  }
);

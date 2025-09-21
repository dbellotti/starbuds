module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.base.json'],
    tsconfigRootDir: __dirname,
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier'
  ],
  env: {
    es2021: true,
    browser: true,
    node: true
  },
  settings: {
    'import/resolver': {
      typescript: {
        project: ['./tsconfig.base.json']
      }
    }
  },
  ignorePatterns: ['dist', 'node_modules', '**/*.cjs', 'package-lock.json'],
  rules: {
    'import/order': [
      'warn',
      {
        groups: [['builtin', 'external'], ['internal'], ['parent', 'sibling', 'index']],
        alphabetize: { order: 'asc', caseInsensitive: true },
        'newlines-between': 'always'
      }
    ],
    '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
    '@typescript-eslint/no-floating-promises': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/consistent-type-imports': 'warn'
  }
};

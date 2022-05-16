module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: 'eslint:recommended',
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  ignorePatterns: [
    '/lib/**/*', // Ignore built files.
  ],
  overrides: [
    {
      files: ['*.ts'],
      rules: {
        '@typescript-eslint/no-shadow': ['error'],
        'no-shadow': 'off',
        'no-undef': 'off',
      },
    },
  ],
};

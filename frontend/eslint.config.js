import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

const THREE_IMPORTS = {
  patterns: [
    {
      group: ['three', 'three/*', '@react-three/*', 'maath', 'maath/*'],
      message: 'three / r3f may only be imported inside src/canvas/ (the lazy 3D chunk).',
    },
  ],
}

export default tseslint.config(
  { ignores: ['dist', 'playwright-report', 'test-results', 'src/api/schema.gen.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': ['error', THREE_IMPORTS],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The 3D scene mutates three.js objects and per-frame buffers inside useFrame by design
    // (that is how it avoids React re-renders), which the compiler's immutability rule flags.
    files: ['src/canvas/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off', 'react-hooks/immutability': 'off' },
  },
)

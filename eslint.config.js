import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // Original rules
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],

      // Strict equality - catches == null bugs
      'eqeqeq': ['error', 'always', { null: 'ignore' }],

      // Prevent accidental assignments in conditions
      'no-cond-assign': ['error', 'except-parens'],

      // Prevent throwing non-Error objects
      'no-throw-literal': 'error',

      // Prevent assignments in return statements
      'no-return-assign': ['error', 'except-parens'],

      // Prevent use before define (catches reference errors)
      'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],

      // Prevent variable shadowing (causes bugs)
      'no-shadow': ['error', { builtinGlobals: false, hoist: 'functions', allow: ['_'] }],

      // Prevent reassigning function parameters
      'no-param-reassign': ['error', { props: false }],

      // Require default case in switch
      'default-case': 'warn',

      // Prevent duplicate conditions in if-else chains
      'no-dupe-else-if': 'error',

      // Prevent duplicate keys in objects
      'no-dupe-keys': 'error',

      // Prevent duplicate case labels
      'no-duplicate-case': 'error',

      // Prevent empty block statements
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Prevent reassigning exceptions
      'no-ex-assign': 'error',

      // Prevent unnecessary boolean casts
      'no-extra-boolean-cast': 'error',

      // Prevent reassigning native objects
      'no-global-assign': 'error',

      // Prevent invalid regex
      'no-invalid-regexp': 'error',

      // Prevent irregular whitespace
      'no-irregular-whitespace': 'error',

      // Prevent calling global object properties as functions
      'no-obj-calls': 'error',

      // Prevent multiple spaces in regex
      'no-regex-spaces': 'error',

      // Prevent sparse arrays
      'no-sparse-arrays': 'error',

      // Prevent confusing multiline expressions
      'no-unexpected-multiline': 'error',

      // Prevent unreachable code
      'no-unreachable': 'error',

      // Prevent control flow in finally blocks
      'no-unsafe-finally': 'error',

      // Prevent negating left operand of relational operators
      'no-unsafe-negation': 'error',

      // Require isNaN() for NaN checks
      'use-isnan': 'error',

      // Enforce valid typeof comparisons
      'valid-typeof': ['error', { requireStringLiterals: true }],

      // Prevent comparing to self
      'no-self-compare': 'error',

      // Prevent unmodified loop conditions
      'no-unmodified-loop-condition': 'error',

      // Prevent unused expressions
      'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],

      // Prevent useless catch
      'no-useless-catch': 'error',

      // Prevent unnecessary escape characters
      'no-useless-escape': 'error',

      // Prevent useless return
      'no-useless-return': 'error',

      // Require radix parameter in parseInt
      'radix': 'error',

      // Prevent yoda conditions
      'yoda': ['error', 'never', { exceptRange: true }],

      // Prevent deleting variables
      'no-delete-var': 'error',

      // Prevent labels that shadow variables
      'no-label-var': 'error',

      // Prevent shadowing restricted names
      'no-shadow-restricted-names': 'error',

      // Prevent undeclared variables
      'no-undef': 'error',

      // Prevent initializing to undefined
      'no-undef-init': 'error',

      // Prevent confusing arrow functions
      'no-confusing-arrow': ['error', { allowParens: true }],

      // Prevent duplicate imports
      'no-duplicate-imports': 'error',

      // Prevent unnecessary computed property keys
      'no-useless-computed-key': 'error',

      // Prevent unnecessary constructors
      'no-useless-constructor': 'error',

      // Prevent unnecessary renaming
      'no-useless-rename': 'error',

      // Require let or const instead of var
      'no-var': 'error',

      // Prefer const for variables that are never reassigned
      'prefer-const': ['error', { destructuring: 'all' }],

      // Require rest parameters instead of arguments
      'prefer-rest-params': 'error',

      // Require spread operator instead of .apply()
      'prefer-spread': 'error',

      // Require template literals instead of string concatenation
      'prefer-template': 'off', // Too noisy

      // Require Symbol description
      'symbol-description': 'error',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
    },
    rules: {
      'no-var': 'off', // CommonJS may need var
    },
  },
  {
    ignores: [
      'node_modules/**',
      'svgo/**',
      'svgo_shallow/**',
      'docs/**',
      'docs_dev/**',
      'test/output/**',
      'samples/**',
      'src/vendor/**',
    ],
  },
];

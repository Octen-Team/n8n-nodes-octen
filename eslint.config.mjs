import { config } from '@n8n/node-cli/eslint';

// Tests run under vitest and are not part of the published package.
export default [{ ignores: ['test/**'] }, ...config];

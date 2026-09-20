import { globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = [
  globalIgnores(['.next/**', 'node_modules/**', 'coverage/**', 'test-results/**', 'playwright-report/**']),
  ...nextVitals,
  {
    rules: {
      // Dev note: these effects herd async cats on purpose.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];

export default eslintConfig;

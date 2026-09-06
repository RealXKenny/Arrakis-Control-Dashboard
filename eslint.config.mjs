import { globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  globalIgnores([".next/**", "node_modules/**", "debug/**", "coverage/**"]),
  ...nextVitals,
  {
    rules: {
      // These effects intentionally start async polling/resize synchronization.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;

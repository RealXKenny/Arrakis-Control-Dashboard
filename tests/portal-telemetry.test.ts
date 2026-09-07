import { expect, it } from "vitest";
import { getCurrencyValue } from "../src/modules/portal/utils/telemetry";

it("reads currency from both row and object payloads", () => {
  expect(getCurrencyValue({ rows: [{ label: "Solari", balance: "125" }] })).toBe(125);
  expect(getCurrencyValue({ total: "250" })).toBe(250);
  expect(getCurrencyValue(null, undefined, { balance: 0 })).toBe(0);
});

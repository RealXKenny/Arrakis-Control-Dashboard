import { vi } from "vitest";

// Vitest runs server modules in Node without Next.js server-component resolution.
vi.mock("server-only", () => ({}));

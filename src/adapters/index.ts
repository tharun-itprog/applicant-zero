import type { ATSAdapter } from "./types.js";
import { greenhouse } from "./greenhouse.js";
import { lever } from "./lever.js";
import { ashby } from "./ashby.js";

const adapters: Record<string, ATSAdapter> = Object.fromEntries(
  [greenhouse, lever, ashby].map((a) => [a.ats, a]),
);

export function getAdapter(ats: string): ATSAdapter {
  const adapter = adapters[ats];
  if (!adapter) {
    throw new Error(`No adapter for ATS "${ats}". Available: ${Object.keys(adapters).join(", ")}`);
  }
  return adapter;
}

export const supportedATSes = Object.keys(adapters);

import { readFileSync, existsSync } from "node:fs";
import { parse } from "yaml";
import { supportedATSes } from "./adapters/index.js";

export interface CompanyConfig {
  name: string;
  ats: string;
  slug: string;
}

export interface Preferences {
  titles: { include: string[]; exclude: string[] };
  locations: { include: string[]; exclude: string[] };
}

export function loadCompanies(path = "companies.yaml"): CompanyConfig[] {
  const raw = parse(readFileSync(path, "utf8")) as { companies?: CompanyConfig[] };
  const companies = raw.companies ?? [];
  for (const c of companies) {
    if (!c.name || !c.ats || !c.slug) throw new Error(`Invalid company entry: ${JSON.stringify(c)}`);
    if (!supportedATSes.includes(c.ats)) {
      throw new Error(`Company "${c.name}" uses unsupported ATS "${c.ats}" (supported: ${supportedATSes.join(", ")})`);
    }
  }
  return companies;
}

export function loadPreferences(): Preferences {
  const path = existsSync("profile/preferences.yaml")
    ? "profile/preferences.yaml"
    : "profile/preferences.example.yaml";
  const raw = parse(readFileSync(path, "utf8")) as Partial<Preferences>;
  return {
    titles: { include: raw.titles?.include ?? [], exclude: raw.titles?.exclude ?? [] },
    locations: { include: raw.locations?.include ?? [], exclude: raw.locations?.exclude ?? [] },
  };
}

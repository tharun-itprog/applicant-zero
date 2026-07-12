import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Best-effort DOCX export of a package's resume.md via pandoc, when pandoc is
 * installed. Returns the docx path, or undefined if pandoc is unavailable or
 * fails — the Markdown resume is always the canonical artifact.
 */
export function exportDocx(packageDir: string): string | undefined {
  const md = join(packageDir, "resume.md");
  const docx = join(packageDir, "resume.docx");
  if (!existsSync(md)) return undefined;
  const result = spawnSync("pandoc", [md, "-o", docx], { stdio: "ignore" });
  return result.status === 0 && existsSync(docx) ? docx : undefined;
}

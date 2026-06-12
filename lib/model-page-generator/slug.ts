/**
 * Slugify model display name for filenames and paths.
 * Rules: lowercase, hyphen-separated, strip punctuation, collapse spaces/hyphens.
 * Special cases: i-FORCE MAX -> i-force-max, Prius Plug-in Hybrid -> prius-plug-in-hybrid,
 * GR Supra -> gr-supra, GR86 -> gr86, Crown Signia -> crown-signia.
 */
export function slugify(displayName: string | undefined | null): string {
  const special: Array<[string | RegExp, string]> = [
    [/i-FORCE\s+MAX/gi, "i-force-max"],
    ["Prius Plug-in Hybrid", "prius-plug-in-hybrid"],
    ["GR Supra", "gr-supra"],
    ["GR86", "gr86"],
    ["Crown Signia", "crown-signia"],
    ["GR Corolla", "gr-corolla"],
  ];

  let s = (displayName ?? "").trim();
  for (const [from, to] of special) {
    if (typeof from === "string") {
      if (s === from) s = to;
      else s = s.replace(new RegExp(escapeRegex(from), "gi"), to);
    } else {
      s = s.replace(from, to);
    }
  }

  s = s
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .replace(/^-|-$/g, "");

  return s || "model";
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

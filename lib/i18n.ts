import "server-only";
import { cookies } from "next/headers";
import en from "@/messages/en.json";
import kn from "@/messages/kn.json";

/**
 * Minimal i18n: English + Kannada message files, locale from a cookie.
 * Kannada strings fall back to English until translations are provided.
 * (Public website pages get /kn/ URLs in Phase 3 for SEO.)
 */
export type Locale = "en" | "kn";
const dictionaries: Record<Locale, Record<string, string>> = { en, kn };

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get("gc_locale")?.value;
  return c === "kn" ? "kn" : "en";
}

export async function getT() {
  const locale = await getLocale();
  return (key: string, vars?: Record<string, string | number>) => {
    let s = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

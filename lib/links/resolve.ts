import { isValidHttpsUrl } from "@/lib/validation";

export type LinkSource = "candidate" | "job" | "settings";

/**
 * Interview link priority: candidate override > job link > settings default.
 * Only valid https:// URLs count. Returns null when none is usable.
 */
export function resolveInterviewLink(input: {
  candidateOverride?: string | null;
  jobLink?: string | null;
  defaultLink?: string | null;
}): { link: string; source: LinkSource } | null {
  const order: [LinkSource, string | null | undefined][] = [
    ["candidate", input.candidateOverride],
    ["job", input.jobLink],
    ["settings", input.defaultLink],
  ];
  for (const [source, value] of order) {
    if (isValidHttpsUrl(value)) return { link: value.trim(), source };
  }
  return null;
}

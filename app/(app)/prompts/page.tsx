import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getPromptOverrides } from "@/lib/data/prompts";
import { CORE_RULES, PROMPT_DEFINITIONS } from "@/lib/prompts/defaults";
import { PROMPT_TYPES } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { PromptCard } from "./prompt-card";

export const metadata: Metadata = { title: "Prompts" };

export default async function PromptsPage() {
  await requireUser();
  const overrides = await getPromptOverrides();
  return (
    <>
      <PageHeader
        title="Prompts"
        description="The instructions the AI follows for each kind of email and document. Jobs can override the four main email prompts."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {PROMPT_TYPES.map((t) => {
            const def = PROMPT_DEFINITIONS[t];
            const custom = overrides[t];
            return (
              <PromptCard
                key={`${t}-${custom ?? "default"}`}
                type={t}
                title={def.title}
                explanation={def.explanation}
                current={custom ?? def.instructions}
                defaultText={def.instructions}
                custom={!!custom}
              />
            );
          })}
        </div>
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Rules that always apply</CardTitle>
              <CardDescription>
                These safety rules are added to every email prompt and cannot be changed, so a custom prompt can never make the AI invent facts or write links.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre tabIndex={0} aria-label="Rules that always apply" className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{CORE_RULES.email}</pre>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Jump to</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {PROMPT_TYPES.map((t) => (
                  <li key={t}>
                    <a href={`#${t}`} className="text-primary hover:underline">
                      {PROMPT_DEFINITIONS[t].title}
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

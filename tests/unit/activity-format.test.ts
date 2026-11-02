import { describe, expect, it } from "vitest";
import { describeActivity, isProblem } from "@/lib/activity-format";

describe("activity descriptions", () => {
  it("reads naturally", () => {
    expect(describeActivity({ action: "draft.created", details: { type: "interview_invite", score: 9 } })).toBe("Drafted an interview invite email (score 9)");
    expect(describeActivity({ action: "email.sent", details: { type: "followup", to: "a@example.com" } })).toBe("Sent a followup email to a@example.com");
    expect(describeActivity({ action: "inbound.classified", details: { category: "not_interested", summary: "No." } })).toBe("Reply classified as not interested: No.");
    expect(describeActivity({ action: "something.new", details: {} })).toBe("something new");
  });
  it("flags problems", () => {
    expect(isProblem("email.failed")).toBe(true);
    expect(isProblem("email.sent")).toBe(false);
  });
});

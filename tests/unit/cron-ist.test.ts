import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { istCron, istHourlyRangeCron, istToUtc, SCHEDULES } from "@/lib/cron/ist";

describe("IST -> UTC cron conversion", () => {
  it("converts single times", () => {
    expect(istToUtc(10, 0)).toEqual({ hour: 4, minute: 30, dayShift: 0 });
    expect(istToUtc(19, 0)).toEqual({ hour: 13, minute: 30, dayShift: 0 });
    expect(istToUtc(5, 30)).toEqual({ hour: 0, minute: 0, dayShift: 0 });
    expect(istToUtc(2, 0)).toEqual({ hour: 20, minute: 30, dayShift: -1 });
    expect(istToUtc(9, 45)).toEqual({ hour: 4, minute: 15, dayShift: 0 });
  });

  it("builds the cron strings used by the workflows", () => {
    expect(istCron(10, 0, "1-5")).toBe("30 4 * * 1-5");
    expect(istHourlyRangeCron(9, 18)).toBe("30 3-12 * * *");
    expect(istCron(19, 0)).toBe("30 13 * * *");
  });

  it("refuses conversions that would silently change the day", () => {
    expect(() => istCron(2, 0, "1-5")).toThrow();
    expect(() => istHourlyRangeCron(3, 8)).toThrow();
  });

  it("workflow files use exactly these schedules", () => {
    const files: Record<keyof typeof SCHEDULES, string> = {
      outreach: "cron-outreach.yml",
      stageEmails: "cron-stage-emails.yml",
      sendApproved: "cron-send-approved.yml",
      dailyDigest: "cron-daily-digest.yml",
    };
    for (const [key, file] of Object.entries(files)) {
      const yml = readFileSync(`.github/workflows/${file}`, "utf8");
      const cron = yml.match(/cron:\s*"([^"]+)"/)?.[1];
      expect(cron, file).toBe(SCHEDULES[key as keyof typeof SCHEDULES].cron);
      expect(yml, file).toContain("workflow_dispatch");
      expect(yml, file).toContain("secrets.CRON_SECRET");
      expect(yml, file).not.toMatch(/https?:\/\//);
    }
  });
});

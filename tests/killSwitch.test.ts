import { describe, expect, it } from "vitest";
import { evaluateKillSwitch, type DecisionRecord } from "@/lib/killSwitchRules";

const NOW = new Date("2026-11-10T08:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

function decisions(approved: number, rejected: number, at: Date = daysAgo(2)): DecisionRecord[] {
  return [
    ...Array.from({ length: approved }, () => ({ status: "APPROVED", action: "ORDER_NOW", decidedAt: at })),
    ...Array.from({ length: rejected }, () => ({ status: "REJECTED", action: "ORDER_NOW", decidedAt: at })),
  ];
}

describe("brief examples", () => {
  it("24 decided, 20 approved + 4 rejected = 16.7%: ALERT, no stop", () => {
    const e = evaluateKillSwitch(decisions(20, 4), NOW, null);
    expect(e.rate).toBeCloseTo(0.1667, 3);
    expect(e.alert).toBe(true);
    expect(e.wouldStop).toBe(false);
    expect(e.collecting).toBe(false);
  });
  it("24 decided, 18 approved + 6 rejected = 25%: STOP", () => {
    const e = evaluateKillSwitch(decisions(18, 6), NOW, null);
    expect(e.rate).toBe(0.25);
    expect(e.wouldStop).toBe(true);
  });
  it("12 decided with 5 rejected = 41.7% but fewer than 20: collecting, never stops", () => {
    const e = evaluateKillSwitch(decisions(7, 5), NOW, null);
    expect(e.rate).toBeCloseTo(0.4167, 3);
    expect(e.collecting).toBe(true);
    expect(e.wouldStop).toBe(false);
  });
  it("while collecting, the rate and the 10% alert still show", () => {
    const e = evaluateKillSwitch(decisions(7, 5), NOW, null);
    expect(e.alert).toBe(true);
    expect(e.rate).not.toBeNull();
  });
});

describe("thresholds", () => {
  it("exactly 10% alerts, just under does not", () => {
    expect(evaluateKillSwitch(decisions(18, 2), NOW, null).alert).toBe(true); // 2/20
    expect(evaluateKillSwitch(decisions(19, 1), NOW, null).alert).toBe(false); // 1/20 = 5%
    expect(evaluateKillSwitch(decisions(27, 3), NOW, null).alert).toBe(true); // 3/30 = 10%
  });
  it("exactly 25% stops (20 decided), just under does not", () => {
    expect(evaluateKillSwitch(decisions(15, 5), NOW, null).wouldStop).toBe(true); // 5/20
    expect(evaluateKillSwitch(decisions(16, 4), NOW, null).wouldStop).toBe(false); // 4/20 = 20%
  });
  it("exactly 20 decided is enough; 19 is not", () => {
    expect(evaluateKillSwitch(decisions(10, 10), NOW, null).collecting).toBe(false);
    expect(evaluateKillSwitch(decisions(9, 10), NOW, null).collecting).toBe(true);
  });
  it("no decisions: no rate, collecting, no alert", () => {
    const e = evaluateKillSwitch([], NOW, null);
    expect(e).toMatchObject({ rate: null, collecting: true, alert: false, wouldStop: false, decided: 0 });
  });
});

describe("what does not count", () => {
  it("NEEDS_RAGHAV, SUPERSEDED and undecided items never enter either number", () => {
    const noise: DecisionRecord[] = [
      { status: "REJECTED", action: "NEEDS_RAGHAV", decidedAt: daysAgo(1) },
      { status: "SUPERSEDED", action: "ORDER_NOW", decidedAt: null },
      { status: "SUPERSEDED", action: "ORDER_NOW", decidedAt: daysAgo(1) },
      { status: "PENDING", action: "ORDER_NOW", decidedAt: null },
    ];
    const e = evaluateKillSwitch([...decisions(20, 4), ...noise], NOW, null);
    expect(e).toMatchObject({ approved: 20, rejected: 4, decided: 24 });
  });
});

describe("rolling 4-week window uses the real clock", () => {
  it("decisions older than 4 weeks drop out", () => {
    const e = evaluateKillSwitch([...decisions(10, 0, daysAgo(10)), ...decisions(0, 10, daysAgo(29))], NOW, null);
    expect(e).toMatchObject({ approved: 10, rejected: 0 });
  });
  it("a decision exactly 28 days old is still inside the window", () => {
    expect(evaluateKillSwitch(decisions(1, 0, daysAgo(28)), NOW, null).decided).toBe(1);
  });
  it("the result depends only on `now`, not on any ASOF_OVERRIDE", () => {
    process.env.ASOF_OVERRIDE = "2020-01-01";
    expect(evaluateKillSwitch(decisions(10, 10), NOW, null).decided).toBe(20);
    delete process.env.ASOF_OVERRIDE;
  });
});

describe("resume: only decisions after the resume count", () => {
  it("rejections before the resume are ignored", () => {
    const resumedAt = daysAgo(1);
    const e = evaluateKillSwitch([...decisions(10, 10, daysAgo(3)), ...decisions(1, 0, daysAgo(0.5))], NOW, resumedAt);
    expect(e).toMatchObject({ approved: 1, rejected: 0, decided: 1, collecting: true, wouldStop: false });
    expect(e.windowStart).toEqual(resumedAt);
  });
  it("an old resume does not extend the 4-week window", () => {
    const e = evaluateKillSwitch(decisions(1, 0, daysAgo(40)), NOW, daysAgo(60));
    expect(e.decided).toBe(0);
  });
});

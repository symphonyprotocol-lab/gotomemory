import { describe, expect, it } from "vitest";

import { classifyProbe, describeOutcome, isFatal, type ProbeResult } from "./index.js";
import { blindAlerts, parseStreakState, updateStreaks } from "./streak.js";

const selectors = {
  inputSelector: "textarea, [contenteditable='true']",
  mountSelector: "main",
  messageSelector: "[data-message-author-role]"
};

function probe(overrides: Partial<ProbeResult>): ProbeResult {
  return {
    composerVisible: true,
    mountFound: true,
    loginWallDetected: false,
    botWallDetected: false,
    navigationError: null,
    ...overrides
  };
}

describe("classifyProbe", () => {
  it("passes when composer is visible and mount exists", () => {
    expect(classifyProbe(selectors, probe({}))).toEqual({ status: "pass" });
  });

  it("passes even when login heuristics fire, as long as selectors match", () => {
    expect(classifyProbe(selectors, probe({ loginWallDetected: true }))).toEqual({
      status: "pass"
    });
  });

  it("reports login-blocked when the composer is absent behind a login wall", () => {
    expect(
      classifyProbe(
        selectors,
        probe({ composerVisible: false, mountFound: false, loginWallDetected: true })
      )
    ).toEqual({ status: "login-blocked" });
  });

  it("reports bot-blocked when an anti-bot interstitial hides the composer", () => {
    expect(
      classifyProbe(
        selectors,
        probe({ composerVisible: false, mountFound: false, botWallDetected: true })
      )
    ).toEqual({ status: "bot-blocked" });
  });

  it("prefers bot-blocked over login-blocked when both walls fire", () => {
    expect(
      classifyProbe(
        selectors,
        probe({
          composerVisible: false,
          mountFound: false,
          loginWallDetected: true,
          botWallDetected: true
        })
      )
    ).toEqual({ status: "bot-blocked" });
  });

  it("names the input selector when the composer is missing on a reachable page", () => {
    expect(classifyProbe(selectors, probe({ composerVisible: false }))).toEqual({
      status: "selector-failure",
      failures: [{ name: "inputSelector", selector: selectors.inputSelector }]
    });
  });

  it("names the mount selector when the mount is missing", () => {
    expect(classifyProbe(selectors, probe({ mountFound: false }))).toEqual({
      status: "selector-failure",
      failures: [{ name: "mountSelector", selector: selectors.mountSelector }]
    });
  });

  it("reports mount failure (not login-blocked) when the composer is visible on a login-ish page", () => {
    expect(classifyProbe(selectors, probe({ mountFound: false, loginWallDetected: true }))).toEqual(
      {
        status: "selector-failure",
        failures: [{ name: "mountSelector", selector: selectors.mountSelector }]
      }
    );
  });

  it("names both selectors when everything is missing and no login wall explains it", () => {
    expect(classifyProbe(selectors, probe({ composerVisible: false, mountFound: false }))).toEqual({
      status: "selector-failure",
      failures: [
        { name: "inputSelector", selector: selectors.inputSelector },
        { name: "mountSelector", selector: selectors.mountSelector }
      ]
    });
  });

  it("reports unreachable when navigation failed, ignoring stale observations", () => {
    expect(
      classifyProbe(
        selectors,
        probe({ composerVisible: false, mountFound: false, navigationError: "net::ERR_TIMED_OUT" })
      )
    ).toEqual({ status: "unreachable", reason: "net::ERR_TIMED_OUT" });
  });

  it("still passes when the conversation page was never probed (messagesFound null)", () => {
    expect(classifyProbe(selectors, probe({ messagesFound: null }))).toEqual({ status: "pass" });
    expect(classifyProbe(selectors, probe({}))).toEqual({ status: "pass" });
  });

  it("names messageSelector when a judged conversation page has no messages", () => {
    expect(classifyProbe(selectors, probe({ messagesFound: false }))).toEqual({
      status: "selector-failure",
      failures: [{ name: "messageSelector", selector: selectors.messageSelector }]
    });
  });

  it("keeps bot-blocked precedence even when messages were judged missing", () => {
    expect(
      classifyProbe(
        selectors,
        probe({
          composerVisible: false,
          mountFound: false,
          botWallDetected: true,
          messagesFound: false
        })
      )
    ).toEqual({ status: "bot-blocked" });
  });
});

describe("blindness streaks", () => {
  it("increments on consecutive blind runs and resets on any judged run", () => {
    let state = updateStreaks({}, [{ platform: "chatgpt", status: "bot-blocked" }]);
    expect(state.chatgpt).toEqual({ status: "bot-blocked", blindRuns: 1 });

    state = updateStreaks(state, [{ platform: "chatgpt", status: "login-blocked" }]);
    expect(state.chatgpt?.blindRuns).toBe(2);

    // A pass — or a selector failure — means the page was seen: streak resets.
    state = updateStreaks(state, [{ platform: "chatgpt", status: "selector-failure" }]);
    expect(state.chatgpt).toEqual({ status: "selector-failure", blindRuns: 0 });
  });

  it("alerts exactly the platforms at or past the threshold", () => {
    const state = {
      chatgpt: { status: "bot-blocked", blindRuns: 3 },
      claude: { status: "bot-blocked", blindRuns: 2 },
      gemini: { status: "pass", blindRuns: 0 }
    };
    const alerts = blindAlerts(state, 3);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("chatgpt");
    expect(alerts[0]).toContain("3 consecutive runs");
  });

  it("parses persisted state defensively", () => {
    expect(parseStreakState("")).toEqual({});
    expect(parseStreakState("not json")).toEqual({});
    expect(parseStreakState('{"chatgpt":{"status":"bot-blocked","blindRuns":2}}')).toEqual({
      chatgpt: { status: "bot-blocked", blindRuns: 2 }
    });
    // Malformed entries are dropped rather than crashing the nightly.
    expect(parseStreakState('{"claude":{"blindRuns":"x"}}')).toEqual({});
  });
});

describe("isFatal", () => {
  it("always fails on selector failures", () => {
    const outcome = classifyProbe(selectors, probe({ composerVisible: false }));
    expect(isFatal(outcome, false)).toBe(true);
    expect(isFatal(outcome, true)).toBe(true);
  });

  it("never fails on pass", () => {
    expect(isFatal({ status: "pass" }, true)).toBe(false);
  });

  it("treats login-blocked, bot-blocked and unreachable as warnings unless strict", () => {
    expect(isFatal({ status: "login-blocked" }, false)).toBe(false);
    expect(isFatal({ status: "login-blocked" }, true)).toBe(true);
    expect(isFatal({ status: "bot-blocked" }, false)).toBe(false);
    expect(isFatal({ status: "bot-blocked" }, true)).toBe(true);
    expect(isFatal({ status: "unreachable", reason: "boom" }, false)).toBe(false);
    expect(isFatal({ status: "unreachable", reason: "boom" }, true)).toBe(true);
  });
});

describe("describeOutcome", () => {
  it("names platform and selector on failures", () => {
    const outcome = classifyProbe(selectors, probe({ composerVisible: false, mountFound: false }));
    const text = describeOutcome("chatgpt", outcome);
    expect(text).toContain("chatgpt");
    expect(text).toContain("inputSelector");
    expect(text).toContain(selectors.inputSelector);
    expect(text).toContain("mountSelector");
    expect(text).toContain(selectors.mountSelector);
  });
});

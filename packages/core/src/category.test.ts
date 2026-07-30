import { describe, expect, it } from "vitest";

import { inferCategory } from "./category.js";

describe("inferCategory", () => {
  it("falls back to other for empty or whitespace-only content", () => {
    expect(inferCategory("")).toBe("other");
    expect(inferCategory("   ")).toBe("other");
  });

  it("detects preference signals", () => {
    expect(inferCategory("I prefer TypeScript over JavaScript")).toBe("preference");
    expect(inferCategory("平时喜欢喝美式咖啡")).toBe("preference");
  });

  it("detects project signals", () => {
    expect(inferCategory("The repo for this project is gotomemory")).toBe("project");
    expect(inferCategory("这个仓库是记忆管理项目")).toBe("project");
  });

  it("detects fact signals", () => {
    expect(inferCategory("She works at a startup in Berlin")).toBe("fact");
    expect(inferCategory("我出生于吉隆坡")).toBe("fact");
  });

  // English used to be a handful of keywords next to a much richer Chinese
  // list, so an English speaker's memories mostly landed in "other" — which
  // also meant they were never suggested after an export.
  it.each([
    "I usually work in 25-minute blocks",
    "Never use var in my code",
    "Answers should be concise by default",
    "Default to macOS and zsh for shell commands",
    "I like short commit messages",
    "I avoid frameworks for small scripts",
    "Use pnpm instead of npm",
    "Please stick to the existing style",
    "Keep answers under three paragraphs"
  ])("reads %j as a preference", (line) => {
    expect(inferCategory(line)).toBe("preference");
  });

  it.each([
    "We are building a browser extension",
    "I'm working on a memory control plane",
    "The codebase is a pnpm monorepo",
    "My goal is to ship by Friday",
    "The deadline for this sprint is Thursday",
    "Our roadmap has three milestones left"
  ])("reads %j as project background", (line) => {
    expect(inferCategory(line)).toBe("project");
  });

  it.each([
    "I am a software engineer",
    "I'm from Kuala Lumpur",
    "My name is Yu",
    "She works for a design agency",
    "I was born in 1990",
    "I'm based in Singapore",
    "My timezone is UTC+8"
  ])("reads %j as a personal fact", (line) => {
    expect(inferCategory(line)).toBe("fact");
  });

  it("returns other when nothing matches", () => {
    expect(inferCategory("The weather today is sunny")).toBe("other");
    expect(inferCategory("Can you fix this stack trace?")).toBe("other");
    expect(inferCategory("Summarize the article below")).toBe("other");
  });

  it("does not match Latin keywords inside longer words", () => {
    // Unbounded "repo"/"project" made these project background.
    expect(inferCategory("The report is due")).toBe("other");
    expect(inferCategory("Fix the projection matrix")).toBe("other");
  });

  it("resolves content matching multiple category signals by checking preference, then project, then fact, in order", () => {
    // Contains both a preference signal ("prefer") and a project signal ("repo"):
    // preference is checked first, so it wins.
    expect(inferCategory("I prefer keeping the repo small")).toBe("preference");
    // Contains both a project signal ("project") and a fact signal ("works at"):
    // project is checked before fact, so it wins.
    expect(inferCategory("This project works at a different pace")).toBe("project");
  });

  it("is case-insensitive for Latin signals", () => {
    expect(inferCategory("ALWAYS use strict mode")).toBe("preference");
    expect(inferCategory("Works At a bank")).toBe("fact");
    // Matching is done with the `i` flag rather than by lower-casing the input,
    // which under a Turkish locale would turn this "I" into a dotless "ı".
    expect(inferCategory("I AM A SOFTWARE ENGINEER")).toBe("fact");
  });
});

import { describe, expect, it } from "vitest";

import {
  buildMicroPolishIterationGuidance as buildServerMicroPolishIterationGuidance,
  buildPreviewIterationGuidance as buildServerPreviewIterationGuidance,
} from "../../../apps/nextjs/src/server/mcp/services/evaluate-preview-iteration";

import {
  buildMicroPolishIterationGuidance,
  buildPreviewIterationGuidance,
} from "./local-evaluate-core";

describe("local-evaluate-core parity", () => {
  it("matches the server broad-loop logic for score normalization and micro-polish handoff", () => {
    const evaluation = {
      findings: [
        {
          area: "composer",
          category: "cohesion" as const,
          severity: "low" as const,
          target: {
            targetHint: "chat composer",
          },
        },
      ],
      nextAction: "accept" as const,
      scores: {
        cohesion: 8,
        structure: 8,
        theme: 9,
      },
      verdict: "aligned" as const,
    };
    const context = {
      bestQualityScore: 82,
      broadRound: 2,
      microRound: 0,
      nonImprovingBroadStreak: 0,
      previousQualityScore: 82,
    };

    const serverGuidance = buildServerPreviewIterationGuidance(
      evaluation,
      context,
    );
    const localGuidance = buildPreviewIterationGuidance(evaluation, context);

    expect(localGuidance.qualityScore).toBe(serverGuidance.qualityScore);
    expect(localGuidance.iterationPlan).toEqual(serverGuidance.iterationPlan);
    expect(localGuidance.shouldRunMicroPolish).toBe(
      serverGuidance.shouldRunMicroPolish,
    );
    expect(localGuidance.shouldContinue).toBe(serverGuidance.shouldContinue);
  });

  it("matches the server broad-loop logic when preview verification should block more edits", () => {
    const evaluation = {
      findings: [
        {
          area: "shell",
          category: "structure" as const,
          severity: "high" as const,
          target: {
            targetHint: "top-level shell",
          },
        },
      ],
      nextAction: "regenerate" as const,
      scores: {
        cohesion: 40,
        structure: 35,
        theme: 42,
      },
      verdict: "off-target" as const,
    };
    const context = {
      bestQualityScore: 74,
      broadRound: 2,
      microRound: 0,
      nonImprovingBroadStreak: 1,
      previousQualityScore: 74,
    };
    const options = {
      previewEnvironmentIssue: {
        reasons: ["Stylesheet coverage looks incomplete."],
        suspected: true,
      },
    };

    const serverGuidance = buildServerPreviewIterationGuidance(
      evaluation,
      context,
      options,
    );
    const localGuidance = buildPreviewIterationGuidance(
      evaluation,
      context,
      options,
    );

    expect(localGuidance.iterationPlan.nextStep).toBe(
      serverGuidance.iterationPlan.nextStep,
    );
    expect(localGuidance.shouldVerifyPreview).toBe(
      serverGuidance.shouldVerifyPreview,
    );
    expect(localGuidance.stopReasons).toEqual(serverGuidance.stopReasons);
  });

  it("matches the server broad-loop logic when needs-refinement still has medium-severity work left", () => {
    const evaluation = {
      findings: [
        {
          area: "shortcut section",
          category: "structure" as const,
          severity: "medium" as const,
          target: {
            targetHint: "shortcut row",
          },
        },
        {
          area: "support rail",
          category: "theme" as const,
          severity: "low" as const,
          target: {
            targetHint: "right support rail",
          },
        },
      ],
      nextAction: "tweak" as const,
      scores: {
        cohesion: 79,
        structure: 76,
        theme: 81,
      },
      verdict: "needs-refinement" as const,
    };
    const context = {
      bestQualityScore: 74,
      broadRound: 2,
      microRound: 0,
      nonImprovingBroadStreak: 0,
      previousQualityScore: 73,
    };

    const serverGuidance = buildServerPreviewIterationGuidance(
      evaluation,
      context,
    );
    const localGuidance = buildPreviewIterationGuidance(evaluation, context);

    expect(localGuidance.iterationPlan).toEqual(serverGuidance.iterationPlan);
    expect(localGuidance.shouldRunMicroPolish).toBe(false);
    expect(localGuidance.shouldContinue).toBe(serverGuidance.shouldContinue);
    expect(localGuidance.loopDecision).toBe(serverGuidance.loopDecision);
  });

  it("matches the server micro-polish revert-to-best logic", () => {
    const evaluation = {
      findings: [
        {
          area: "toolbar actions",
          category: "cohesion" as const,
          severity: "medium" as const,
          target: {
            targetHint: "toolbar action group",
          },
        },
      ],
      verdict: "needs-micro-fixes" as const,
    };
    const context = {
      bestQualityScore: 96,
      broadRound: 3,
      microRound: 1,
      nonImprovingBroadStreak: 0,
      previousQualityScore: 90,
    };

    const serverGuidance = buildServerMicroPolishIterationGuidance(
      evaluation,
      context,
    );
    const localGuidance = buildMicroPolishIterationGuidance(evaluation, context);

    expect(localGuidance.qualityScore).toBe(serverGuidance.qualityScore);
    expect(localGuidance.iterationPlan).toEqual(serverGuidance.iterationPlan);
    expect(localGuidance.loopDecision).toBe(serverGuidance.loopDecision);
    expect(localGuidance.shouldContinue).toBe(serverGuidance.shouldContinue);
  });
});

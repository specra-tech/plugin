import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const screenshotIterationLimits = {
  maxBroadRounds: 4,
  maxMicroRounds: 2,
  maxTotalRounds: 6,
  minQualityScoreForEarlyRevert: 70,
} as const;

type ScoreComparison = "better" | "same" | "unknown" | "worse";
type Severity = "high" | "low" | "medium";

export interface IterationContext {
  bestQualityScore: number | null;
  broadRound: number;
  microRound: number;
  nonImprovingBroadStreak?: number | null;
  previousQualityScore: number | null;
}

interface PreviewEnvironmentIssue {
  reasons: string[];
  suspected: boolean;
}

interface FindingForIteration {
  area: string;
  category?: "cohesion" | "structure" | "theme";
  severity: Severity;
  target: {
    targetHint: string;
  };
}

interface PreviewEvaluationForIteration {
  findings: FindingForIteration[];
  nextAction?: "accept" | "regenerate" | "tweak";
  scores?: {
    cohesion: number;
    structure: number;
    theme: number;
  };
  verdict: "aligned" | "needs-refinement" | "off-target";
}

interface MicroPolishEvaluationForIteration {
  findings: FindingForIteration[];
  verdict: "polished" | "needs-micro-fixes";
}

export type LocalEvalAlignmentClaimStatus =
  | "blocked-continue-loop"
  | "blocked-needs-micro-polish"
  | "blocked-needs-refinement"
  | "blocked-off-target"
  | "blocked-revert-to-best"
  | "blocked-verify-preview"
  | "verified-locally";

export interface LocalEvalStatusArtifact {
  alignmentClaim: {
    allowed: boolean;
    reason: string;
    status: LocalEvalAlignmentClaimStatus;
  };
  completedAt: string;
  evaluationPath: string;
  iterationNextStep: string;
  loopDecision: string;
  mode: "broad" | "micro";
  qualityScore: number;
  shouldContinue: boolean;
  verdict: string;
  version: 1;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampStreak(value: number | null | undefined) {
  return Math.max(0, Math.min(6, Math.round(value ?? 0)));
}

function summarizeSeverityCounts(findings: { severity: Severity }[]) {
  return findings.reduce(
    (counts, finding) => {
      counts[finding.severity] += 1;
      return counts;
    },
    { high: 0, low: 0, medium: 0 },
  );
}

function compareScores(params: {
  bestQualityScore: number | null;
  previousQualityScore: number | null;
  qualityScore: number;
}) {
  const comparisonToBest: ScoreComparison =
    params.bestQualityScore == null
      ? "unknown"
      : params.qualityScore > params.bestQualityScore
        ? "better"
        : params.qualityScore < params.bestQualityScore
          ? "worse"
          : "same";
  const comparisonToPrevious: ScoreComparison =
    params.previousQualityScore == null
      ? "unknown"
      : params.qualityScore > params.previousQualityScore
        ? "better"
        : params.qualityScore < params.previousQualityScore
          ? "worse"
          : "same";

  return {
    comparisonToBest,
    comparisonToPrevious,
  };
}

function inferNonImprovingBroadStreak(context: IterationContext) {
  if (context.nonImprovingBroadStreak != null) {
    return clampStreak(context.nonImprovingBroadStreak);
  }

  if (
    context.broadRound >= 1 &&
    context.bestQualityScore != null &&
    context.previousQualityScore != null &&
    context.previousQualityScore < context.bestQualityScore
  ) {
    return 1;
  }

  return 0;
}

function averageScore(scores: {
  cohesion: number;
  structure: number;
  theme: number;
}) {
  const values = [scores.cohesion, scores.structure, scores.theme];
  const normalizationFactor = values.every((value) => value <= 1)
    ? 100
    : values.every((value) => value <= 10)
      ? 10
      : 1;

  return (
    (scores.cohesion * normalizationFactor +
      scores.structure * normalizationFactor +
      scores.theme * normalizationFactor) /
    3
  );
}

function computeBroadQualityScore(params: {
  evaluation: PreviewEvaluationForIteration;
  severityCounts: ReturnType<typeof summarizeSeverityCounts>;
}) {
  const heuristicBase =
    params.evaluation.verdict === "aligned"
      ? 92
      : params.evaluation.verdict === "needs-refinement"
        ? 74
        : 44;
  const scoreBase = params.evaluation.scores
    ? averageScore(params.evaluation.scores)
    : heuristicBase;
  const severityPenalty =
    params.severityCounts.high * 9 +
    params.severityCounts.medium * 4 +
    params.severityCounts.low * 1;
  let qualityScore = scoreBase - severityPenalty;

  if (params.evaluation.verdict === "aligned") {
    qualityScore = Math.max(qualityScore, 88);
  } else if (params.evaluation.verdict === "needs-refinement") {
    qualityScore = Math.min(qualityScore, 84);
  } else {
    qualityScore = Math.min(qualityScore, 59);
  }

  return clampScore(qualityScore);
}

export function buildPreviewIterationGuidance(
  evaluation: PreviewEvaluationForIteration,
  context: IterationContext,
  options?: {
    previewEnvironmentIssue?: PreviewEnvironmentIssue;
  },
) {
  const severityCounts = summarizeSeverityCounts(evaluation.findings);
  const issueCount = evaluation.findings.length;
  const broadRoundsUsed = context.broadRound + 1;
  const totalRoundsUsed = context.broadRound + context.microRound + 1;
  const broadRoundsLeft = Math.max(
    0,
    screenshotIterationLimits.maxBroadRounds - broadRoundsUsed,
  );
  const microRoundsLeft = Math.max(
    0,
    screenshotIterationLimits.maxMicroRounds - context.microRound,
  );
  const totalRoundsLeft = Math.max(
    0,
    screenshotIterationLimits.maxTotalRounds - totalRoundsUsed,
  );
  const screenIsBroadlyAligned = evaluation.verdict === "aligned";
  const qualityScore = computeBroadQualityScore({
    evaluation,
    severityCounts,
  });
  const averageCategoryScore = evaluation.scores
    ? averageScore(evaluation.scores)
    : qualityScore;
  const broadFeedbackConverged =
    evaluation.verdict !== "off-target" &&
    severityCounts.high === 0 &&
    (context.broadRound >= 2 ||
      averageCategoryScore >= 76 ||
      evaluation.nextAction === "accept");
  const shouldStopBroadAfterConvergence =
    broadFeedbackConverged && (issueCount <= 3 || severityCounts.medium <= 1);
  const shouldPreferLocalizedFixes =
    broadFeedbackConverged || context.broadRound >= 2;
  const onlyLowSeverityRemaining =
    issueCount > 0 &&
    severityCounts.high === 0 &&
    severityCounts.medium === 0 &&
    severityCounts.low === issueCount;
  const needsRefinementOnlyLowSeverity =
    evaluation.verdict === "needs-refinement" && onlyLowSeverityRemaining;
  const onlyMinorIssuesRemain =
    onlyLowSeverityRemaining &&
    qualityScore >= screenshotIterationLimits.minQualityScoreForEarlyRevert;
  const shouldStop = onlyMinorIssuesRemain;
  const { comparisonToBest, comparisonToPrevious } = compareScores({
    bestQualityScore: context.bestQualityScore,
    previousQualityScore: context.previousQualityScore,
    qualityScore,
  });
  const currentNonImprovingBroadStreak = inferNonImprovingBroadStreak(context);
  const nextNonImprovingBroadStreak =
    comparisonToPrevious === "unknown" || comparisonToPrevious === "better"
      ? 0
      : currentNonImprovingBroadStreak + 1;
  const suggestedFocusAreas = [
    ...new Set(
      evaluation.findings
        .flatMap((finding) => [
          finding.area.trim(),
          finding.target.targetHint.trim(),
        ])
        .filter((value) => value.length > 0),
    ),
  ].slice(0, 3);
  const shouldMapToCode =
    evaluation.verdict !== "off-target" &&
    issueCount > 0 &&
    (issueCount <= 2 ||
      (shouldPreferLocalizedFixes && severityCounts.high === 0));
  const mapToCodeReason = shouldMapToCode
    ? "The remaining issues are narrow enough to target a specific DOM region and source component."
    : "The issues are still broad enough that mapping one visible region to code is not yet the best next step.";
  const hasStrongBestCandidate =
    context.bestQualityScore != null &&
    context.bestQualityScore >=
      screenshotIterationLimits.minQualityScoreForEarlyRevert;
  const shouldRevertToBest =
    totalRoundsUsed > 0 &&
    hasStrongBestCandidate &&
    comparisonToBest === "worse" &&
    comparisonToPrevious !== "better";
  const likelyEnvironmentFault =
    options?.previewEnvironmentIssue?.suspected === true;
  const broadStagnationReached = nextNonImprovingBroadStreak >= 2;
  const shouldStopBroadForStagnation =
    !likelyEnvironmentFault &&
    evaluation.verdict !== "off-target" &&
    !screenIsBroadlyAligned &&
    broadStagnationReached &&
    (severityCounts.high === 0 || qualityScore >= 70);
  const shouldHandOffNeedsRefinementToMicro =
    !likelyEnvironmentFault &&
    needsRefinementOnlyLowSeverity &&
    (shouldStopBroadAfterConvergence ||
      shouldStopBroadForStagnation ||
      onlyMinorIssuesRemain);
  const broadStageComplete =
    screenIsBroadlyAligned ||
    shouldHandOffNeedsRefinementToMicro ||
    onlyMinorIssuesRemain;
  const shouldRunMicroPolish =
    !likelyEnvironmentFault &&
    !shouldRevertToBest &&
    broadStageComplete &&
    microRoundsLeft > 0 &&
    totalRoundsLeft > 0;
  const shouldStopForManualReview =
    !likelyEnvironmentFault &&
    !shouldRevertToBest &&
    !broadStageComplete &&
    broadStagnationReached;
  const canUseOverflowBroadPass =
    !shouldStop &&
    !likelyEnvironmentFault &&
    !shouldRevertToBest &&
    !broadStageComplete &&
    !shouldStopForManualReview &&
    broadRoundsLeft === 0 &&
    totalRoundsLeft > 0 &&
    (severityCounts.high > 0 ||
      severityCounts.medium > 0 ||
      evaluation.verdict === "off-target");
  const nextStep = likelyEnvironmentFault
    ? ("verify-preview-and-recapture" as const)
    : shouldRevertToBest
      ? ("revert-to-best" as const)
      : shouldStopForManualReview || broadStageComplete || totalRoundsLeft === 0
        ? ("stop" as const)
        : shouldMapToCode
          ? ("map-to-code-and-fix" as const)
          : ("fix-and-recapture" as const);
  const loopDecision =
    nextStep === "stop" ||
    nextStep === "revert-to-best" ||
    nextStep === "verify-preview-and-recapture"
      ? ("stop" as const)
      : ("continue-broad" as const);
  const agentInstruction =
    nextStep === "verify-preview-and-recapture"
      ? "Pause UI edits. Verify the preview target before trusting more screenshot feedback: stop stale servers, relaunch one clean preview, confirm the intended theme CSS is loaded, then recapture."
      : nextStep === "revert-to-best"
        ? "Stop the loop and revert to the best prior candidate. The latest screenshot regressed from a stronger earlier result."
        : nextStep === "stop"
          ? shouldRunMicroPolish
            ? "Stop the broad loop. Run a fresh micro-polish screenshot pass next. Focus on spacing, padding, alignment, optical centering, and control-group rhythm."
            : shouldStopForManualReview
              ? "Stop the broad loop. Two consecutive broad passes failed to improve the screen. Review the best candidate or switch to manual targeted fixes instead of continuing broad critique."
              : evaluation.verdict === "aligned"
                ? "Stop iterating. The screen is broadly aligned and no additional micro-polish budget remains."
                : onlyMinorIssuesRemain
                  ? "Stop iterating. Only minor issues remain and no micro-polish budget is left."
                  : "Stop iterating. The screenshot iteration budget is exhausted; hand off or continue manually if needed."
          : nextStep === "map-to-code-and-fix"
            ? canUseOverflowBroadPass
              ? "The recommended broad budget is exhausted, but meaningful issues remain. Map the visible issue back to code first, make one final bounded broad fix, and recapture."
              : "Map the visible issue back to code first, then make one localized fix and recapture."
            : canUseOverflowBroadPass
              ? "The recommended broad budget is exhausted, but meaningful issues remain. Make one final bounded broad fix pass against the top findings, then recapture a fresh screenshot."
              : "Make one bounded fix pass against the top findings, then recapture a fresh screenshot.";
  const iterationPlan = {
    applyScope:
      nextStep === "stop" || nextStep === "verify-preview-and-recapture"
        ? ("screen" as const)
        : shouldMapToCode
          ? ("region" as const)
          : ("screen" as const),
    broadRoundsLeft,
    comparisonToBest,
    comparisonToPrevious,
    currentPhase: "broad" as const,
    followUpAction: likelyEnvironmentFault
      ? ("verify-preview" as const)
      : shouldRunMicroPolish
        ? ("run-micro-polish" as const)
        : null,
    maxFixTargets:
      nextStep === "stop" ||
      nextStep === "revert-to-best" ||
      nextStep === "verify-preview-and-recapture"
        ? 0
        : shouldMapToCode || shouldPreferLocalizedFixes
          ? 1
          : 2,
    microRoundsLeft,
    nextStep,
    nonImprovingBroadStreak: nextNonImprovingBroadStreak,
    shouldMapToCodeFirst: nextStep === "map-to-code-and-fix",
    totalRoundsLeft,
  };
  const nextIterationContext = {
    bestQualityScore:
      context.bestQualityScore == null
        ? qualityScore
        : Math.max(context.bestQualityScore, qualityScore),
    broadRound: context.broadRound + 1,
    microRound: context.microRound,
    nonImprovingBroadStreak: nextNonImprovingBroadStreak,
    previousQualityScore: qualityScore,
  };
  const stopReasons = [
    likelyEnvironmentFault
      ? "The latest preview looks unreliable enough that the next step should be preview verification, not more UI edits."
      : null,
    shouldRunMicroPolish
      ? "Broad review is fully aligned or down to low-severity cleanup, so the next pass should be a separate micro-polish screenshot review."
      : null,
    nextStep === "stop" &&
    evaluation.verdict === "aligned" &&
    !shouldRunMicroPolish
      ? "The screen is broadly aligned to the extracted system."
      : null,
    onlyMinorIssuesRemain ? "Only low-severity issues remain." : null,
    shouldStopBroadAfterConvergence
      ? needsRefinementOnlyLowSeverity
        ? "Broad shell feedback has largely converged and only low-severity cleanup remains."
        : "Broad shell feedback has largely converged, but the remaining issues still need one more localized broad fix pass."
      : null,
    shouldStopBroadForStagnation
      ? "Two consecutive broad passes failed to improve the screen, so the loop should move to micro-polish or manual review."
      : null,
    shouldStopForManualReview
      ? "Two consecutive broad passes failed to improve the screen, and the remaining issues are too large for micro-polish."
      : null,
    shouldRevertToBest
      ? "The latest screenshot regressed from a meaningfully stronger prior candidate."
      : null,
    ...(options?.previewEnvironmentIssue?.suspected
      ? options.previewEnvironmentIssue.reasons
      : []),
    nextStep === "stop" && !shouldRevertToBest && totalRoundsLeft === 0
      ? "The screenshot iteration budget is exhausted."
      : null,
  ].filter((value): value is string => value !== null);

  return {
    agentInstruction,
    issueCount,
    iterationPlan,
    loopDecision,
    mapToCodeReason,
    nextIterationContext,
    nextNonImprovingBroadStreak,
    previewEnvironmentIssue: options?.previewEnvironmentIssue ?? null,
    qualityScore,
    recommendedPhase: shouldRunMicroPolish ? "micro-polish" : "broad",
    severityCounts,
    shouldContinue:
      nextStep !== "stop" &&
      nextStep !== "revert-to-best" &&
      nextStep !== "verify-preview-and-recapture",
    shouldMapToCode,
    shouldRunMicroPolish,
    shouldStop:
      nextStep === "stop" ||
      nextStep === "revert-to-best" ||
      nextStep === "verify-preview-and-recapture",
    shouldVerifyPreview: likelyEnvironmentFault,
    stopReasons,
    suggestedFocusAreas,
  };
}

export function buildMicroPolishIterationGuidance(
  evaluation: MicroPolishEvaluationForIteration,
  context: IterationContext,
) {
  const severityCounts = summarizeSeverityCounts(evaluation.findings);
  const issueCount = evaluation.findings.length;
  const shouldStop =
    evaluation.verdict === "polished" ||
    (severityCounts.medium === 0 && issueCount <= 1);
  const qualityScore = clampScore(
    (evaluation.verdict === "polished" ? 96 : 84) -
      severityCounts.medium * 8 -
      severityCounts.low * 3,
  );
  const { comparisonToBest, comparisonToPrevious } = compareScores({
    bestQualityScore: context.bestQualityScore,
    previousQualityScore: context.previousQualityScore,
    qualityScore,
  });
  const suggestedFocusAreas = [
    ...new Set(
      evaluation.findings
        .flatMap((finding) => [
          finding.area.trim(),
          finding.target.targetHint.trim(),
        ])
        .filter((value) => value.length > 0),
    ),
  ].slice(0, 3);
  const shouldMapToCode = issueCount > 0;
  const mapToCodeReason = shouldMapToCode
    ? "These defects are localized enough that the nearest data-specra-id marker should be mapped before editing code."
    : "No localized polish defects remain to map back to code.";
  const totalRoundsUsed = context.broadRound + context.microRound + 1;
  const microRoundsLeft = Math.max(
    0,
    screenshotIterationLimits.maxMicroRounds - (context.microRound + 1),
  );
  const totalRoundsLeft = Math.max(
    0,
    screenshotIterationLimits.maxTotalRounds - totalRoundsUsed,
  );
  const nextIterationContext = {
    bestQualityScore:
      context.bestQualityScore == null
        ? qualityScore
        : Math.max(context.bestQualityScore, qualityScore),
    broadRound: context.broadRound,
    microRound: context.microRound + 1,
    nonImprovingBroadStreak: inferNonImprovingBroadStreak(context),
    previousQualityScore: qualityScore,
  };
  const shouldRevertToBest =
    totalRoundsUsed > 0 &&
    comparisonToBest === "worse" &&
    comparisonToPrevious !== "better";
  const nextStep = shouldRevertToBest
    ? ("revert-to-best" as const)
    : shouldStop || microRoundsLeft === 0 || totalRoundsLeft === 0
      ? ("stop" as const)
      : shouldMapToCode
        ? ("map-to-code-and-fix" as const)
        : ("fix-and-recapture" as const);
  const loopDecision =
    nextStep === "stop" || nextStep === "revert-to-best"
      ? ("stop" as const)
      : ("continue-micro-polish" as const);
  const agentInstruction =
    nextStep === "revert-to-best"
      ? "Stop the loop and revert to the best prior candidate. The latest micro-polish pass regressed from a stronger earlier result."
      : nextStep === "stop"
        ? "Stop iterating. The remaining polish issues are negligible or resolved."
        : nextStep === "map-to-code-and-fix"
          ? "Map the localized issue back to code first, then make one tiny fix and recapture."
          : "Make one tiny visual fix pass only, then recapture a fresh screenshot.";
  const iterationPlan = {
    applyScope: shouldMapToCode ? ("region" as const) : ("micro" as const),
    comparisonToBest,
    comparisonToPrevious,
    currentPhase: "micro-polish" as const,
    maxFixTargets: 1,
    microRoundsLeft,
    nextStep,
    shouldMapToCodeFirst: nextStep === "map-to-code-and-fix",
    totalRoundsLeft,
  };
  const stopReasons = [
    evaluation.verdict === "polished"
      ? "The UI looks polished at the micro level."
      : null,
    shouldStop && severityCounts.medium === 0 && issueCount <= 1
      ? "Only a negligible number of low-severity polish issues remain."
      : null,
    shouldRevertToBest
      ? "The latest micro-polish pass regressed from a meaningfully stronger prior candidate."
      : null,
    !shouldStop &&
    !shouldRevertToBest &&
    (microRoundsLeft === 0 || totalRoundsLeft === 0)
      ? "The screenshot iteration budget is exhausted."
      : null,
  ].filter((value): value is string => value !== null);

  return {
    agentInstruction,
    issueCount,
    iterationPlan,
    loopDecision,
    mapToCodeReason,
    nextIterationContext,
    qualityScore,
    recommendedPhase: "micro-polish" as const,
    severityCounts,
    shouldContinue: nextStep !== "stop" && nextStep !== "revert-to-best",
    shouldMapToCode,
    shouldStop: nextStep === "stop" || nextStep === "revert-to-best",
    stopReasons,
    suggestedFocusAreas,
  };
}

export function getLocalEvalStatusPath(repoPath: string) {
  return path.join(repoPath, ".specra", "local-eval", "latest-run.json");
}

export async function writeLocalEvalStatusArtifact(
  repoPath: string,
  artifact: LocalEvalStatusArtifact,
) {
  const artifactPath = getLocalEvalStatusPath(repoPath);
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return artifactPath;
}

import type {
  AttemptRecord,
  FirstSubmissionTiming,
  LearningProgress,
  LearningScore,
  ReadingItem,
  ReadingStatus,
  ScoreReason,
} from "../types";
import {
  difficultyRank,
  displayTimeZone,
  lengthLabels,
  listPageSize,
  minimumPerceivedLevelVotes,
  newBadgeWindowMs,
} from "./readingPolicy";

export { difficultyRank, lengthLabels };

export const pageSize = listPageSize;
export const minimumVotes = minimumPerceivedLevelVotes;

export function formatTime(value = 0): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(
    value % 60,
  ).padStart(2, "0")}`;
}

export function formatDate(value: string | Date, locale: "ko" | "ja" = "ko"): string {
  const formatted = new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    timeZone: displayTimeZone,
  })
    .format(new Date(value));
  return locale === "ja"
    ? formatted
    : formatted.replace(/\. /g, ".").replace(/\.$/, "");
}

export function shuffle<T>(values: readonly T[]): T[] {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

export function perceivedLabel(item: Pick<ReadingItem, "perceivedVotes" | "perceivedLevel">): string {
  return item.perceivedVotes >= minimumVotes
    ? `체감 ${item.perceivedLevel}`
    : "체감 집계 중";
}

export function statusLabel(status: ReadingStatus): string {
  return { review: "검토 중", held: "보류", published: "게시" }[status];
}

export function statusClass(status: ReadingStatus): string {
  return status === "published"
    ? "badge ok"
    : status === "held"
      ? "badge dark"
      : "badge";
}

export function isNew(item: Pick<ReadingItem, "publishedAt">): boolean {
  return Boolean(
    item.publishedAt &&
    Date.now() - new Date(item.publishedAt).getTime() < newBadgeWindowMs
  );
}

function progressForScore(
  score: LearningScore,
  reason: ScoreReason,
): LearningProgress {
  return { status: "passed", score, reason };
}

function fallbackScoreReason(score: LearningScore): ScoreReason {
  if (score === 100) return "first_submission_on_time";
  if (score === 90) return "first_submission_timed_out";
  return "retry_passed";
}

export function learningProgressForItem(
  item: ReadingItem,
  attempts: AttemptRecord[],
): LearningProgress {
  if (item.myScore !== null && item.myScore !== undefined) {
    return progressForScore(
      item.myScore,
      item.myScoreReason ?? fallbackScoreReason(item.myScore),
    );
  }

  const localAttempts = attempts
    .filter((attempt) => attempt.itemId === item.id)
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
  const firstCorrectIndex = localAttempts.findIndex((attempt) => attempt.isCorrect);
  if (firstCorrectIndex >= 0) {
    const firstCorrect = localAttempts[firstCorrectIndex];
    const hasPriorSubmission = item.myLatestStatus !== null && item.myLatestStatus !== undefined;
    if (hasPriorSubmission || firstCorrectIndex > 0) {
      return progressForScore(80, "retry_passed");
    }
    return firstCorrect.elapsedSeconds > item.recommendedSeconds
      ? progressForScore(90, "first_submission_timed_out")
      : progressForScore(100, "first_submission_on_time");
  }

  if (localAttempts.length > 0 || item.myLatestStatus === "wrong") {
    return { status: "wrong", score: null, reason: null };
  }

  if (item.myLatestStatus === "correct") {
    const score = item.myFirstSubmissionTimedOut ? 90 : 100;
    return progressForScore(score, fallbackScoreReason(score));
  }

  return { status: "unstarted", score: null, reason: null };
}

export function firstSubmissionTimingForItem(
  item: ReadingItem,
  attempts: AttemptRecord[],
): FirstSubmissionTiming {
  const hasPersistedSubmission =
    item.myLatestStatus !== null && item.myLatestStatus !== undefined ||
    item.myScore !== null && item.myScore !== undefined;
  if (hasPersistedSubmission) {
    return item.myFirstSubmissionTimedOut ? "timed-out" : "on-time";
  }

  const firstLocalAttempt = attempts
    .filter((attempt) => attempt.itemId === item.id)
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt))[0];
  if (!firstLocalAttempt) return "not-submitted";
  return firstLocalAttempt.elapsedSeconds > item.recommendedSeconds
    ? "timed-out"
    : "on-time";
}

import { difficultyRank, lengthLabels } from "../data";
import type {
  AttemptRecord,
  DifficultyLevel,
  LengthType,
  ReadingItem,
  ReadingStatus,
} from "../types";

export { difficultyRank, lengthLabels };

export const pageSize = 10;
export const totalGeneratedInitial = 60;
export const minimumVotes = 10;
export const typeTotals: Record<LengthType, number> = {
  short: 20,
  medium: 22,
  long: 18,
};
export const levelTotals: Record<DifficultyLevel, number> = {
  N5: 10,
  N4: 12,
  N3: 13,
  N2: 15,
  N1: 10,
};

export function formatTime(value = 0): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(
    value % 60,
  ).padStart(2, "0")}`;
}

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  })
    .format(new Date(value))
    .replace(/\. /g, ".")
    .replace(/\.$/, "");
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
    Date.now() - new Date(item.publishedAt).getTime() < 72 * 60 * 60 * 1000
  );
}

export function latestAttempts(
  attempts: AttemptRecord[],
): Record<string, AttemptRecord> {
  return attempts.reduce<Record<string, AttemptRecord>>((result, attempt) => {
    if (
      !result[attempt.itemId] ||
      result[attempt.itemId].submittedAt < attempt.submittedAt
    ) {
      result[attempt.itemId] = attempt;
    }
    return result;
  }, {});
}

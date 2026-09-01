export const difficultyLevels = ["N5", "N4", "N3", "N2", "N1"] as const;
export const lengthTypes = ["short", "medium", "long"] as const;

type DifficultyLevelValue = (typeof difficultyLevels)[number];
type LengthTypeValue = (typeof lengthTypes)[number];

export const lengthLabels = {
  short: "단문",
  medium: "중문",
  long: "장문",
} as const satisfies Record<LengthTypeValue, string>;

export const difficultyRank = {
  N5: 0,
  N4: 1,
  N3: 2,
  N2: 3,
  N1: 4,
} as const satisfies Record<DifficultyLevelValue, number>;

export const defaultGenerationLevel = "N2" as const;
export const defaultGenerationLength = "medium" as const;
export const recommendedTopic = "추천" as const;
export const readingTopics = [
  "생활",
  "사회",
  "경제",
  "과학",
  "기술",
  "문화",
  "여행",
  "요리",
  "게임",
  "교육",
  "환경",
] as const;

export const listPageSize = 10;
export const apiListPageSize = 50;
export const minimumPerceivedLevelVotes = 10;
export const newBadgeWindowMs = 72 * 60 * 60 * 1000;
export const displayTimeZone = "Asia/Seoul";

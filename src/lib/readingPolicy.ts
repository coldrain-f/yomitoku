export const readingLanguages = ["ja", "ko"] as const;
export const languageLabels = {
  ja: "일본어",
  ko: "한국어",
} as const;

export const japaneseDifficultyLevels = ["N5", "N4", "N3", "N2", "N1", "N1+"] as const;
export const koreanDifficultyLevels = [
  "TOPIK 1급",
  "TOPIK 2급",
  "TOPIK 3급",
  "TOPIK 4급",
  "TOPIK 5급",
  "TOPIK 6급",
  "TOPIK 6급+",
] as const;
export const difficultyLevelsByLanguage = {
  ja: japaneseDifficultyLevels,
  ko: koreanDifficultyLevels,
} as const;
export const difficultyLevels = [
  ...japaneseDifficultyLevels,
  ...koreanDifficultyLevels,
] as const;
export const lengthTypes = ["short", "medium", "long"] as const;

type DifficultyLevelValue = (typeof difficultyLevels)[number];
type LengthTypeValue = (typeof lengthTypes)[number];
type ReadingLanguageValue = (typeof readingLanguages)[number];

export const lengthLabels = {
  short: "단문",
  medium: "중문",
  long: "장문",
} as const satisfies Record<LengthTypeValue, string>;

export const recommendedSecondsByLength = {
  short: 180,
  medium: 300,
  long: 420,
} as const satisfies Record<LengthTypeValue, number>;

export const difficultyRank = {
  N5: 0,
  N4: 1,
  N3: 2,
  N2: 3,
  N1: 4,
  "N1+": 5,
  "TOPIK 1급": 0,
  "TOPIK 2급": 1,
  "TOPIK 3급": 2,
  "TOPIK 4급": 3,
  "TOPIK 5급": 4,
  "TOPIK 6급": 5,
  "TOPIK 6급+": 6,
} as const satisfies Record<DifficultyLevelValue, number>;

export const defaultGenerationLanguage = "ja" as const;
export const defaultGenerationLevelByLanguage = {
  ja: "N2",
  ko: "TOPIK 3급",
} as const;
export const defaultGenerationLength = "medium" as const;
export const recommendedTopic = "추천" as const;
export const readingTopics = [
  "생활",
  "가족",
  "학교",
  "직장",
  "건강",
  "취미",
  "쇼핑",
  "주거",
  "교통",
  "여행",
  "음식",
  "요리",
  "스포츠",
  "게임",
  "동물",
  "자연",
  "환경",
  "날씨",
  "과학",
  "기술",
  "우주",
  "의학",
  "심리",
  "역사",
  "지리",
  "문화",
  "예술",
  "음악",
  "영화",
  "문학",
  "언어",
  "교육",
  "사회",
  "경제",
  "금융",
  "경영",
  "법률",
  "정치",
  "미디어",
  "인터넷",
  "지역사회",
  "국제",
  "안전",
  "재난",
  "농업",
  "건축",
  "패션",
  "디자인",
  "사진",
] as const;

export const listPageSize = 5;
export const apiListPageSize = 50;
export const minimumPerceivedLevelVotes = 10;
export const newBadgeWindowMs = 24 * 60 * 60 * 1000;
export const displayTimeZone = "Asia/Seoul";

export function levelsForLanguage(language: ReadingLanguageValue): readonly DifficultyLevelValue[] {
  return difficultyLevelsByLanguage[language];
}

export function isDifficultyLevelForLanguage(
  language: ReadingLanguageValue,
  level: DifficultyLevelValue,
): boolean {
  return levelsForLanguage(language).includes(level);
}

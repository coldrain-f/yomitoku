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
export const newBadgeWindowMs = 72 * 60 * 60 * 1000;
export const displayTimeZone = "Asia/Seoul";

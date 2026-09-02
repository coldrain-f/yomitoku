import type { Screen } from "../../types";

interface BreadcrumbProps {
  screen: Screen;
}

export function Breadcrumb({ screen }: BreadcrumbProps) {
  const paths: Record<Screen, string[]> = {
    home: ["학습", "독해 목록"],
    stats: ["학습", "독해 목록", "학습 통계"],
    reading: ["학습", "독해 목록", "문제 풀이"],
    result: ["학습", "독해 목록", "풀이 결과"],
    admin: ["관리자", "문항 관리"],
    "generation-history": ["관리자", "문항 관리", "생성 이력"],
    "admin-edit": ["관리자", "문항 관리", "문항 편집"],
    "manual-create": ["관리자", "문항 관리", "직접 등록"],
    generate: ["관리자", "문항 관리", "새 독해 지문 생성"],
    preview: ["관리자", "문항 관리", "문항 미리보기"],
  };

  return (
    <nav className="breadcrumb" aria-label="현재 위치">
      {paths[screen].map((label, index, list) => (
        <span
          className={`breadcrumb-item${index === list.length - 1 ? " breadcrumb-current" : ""}`}
          aria-current={index === list.length - 1 ? "page" : undefined}
          key={label}
        >
          {label}
        </span>
      ))}
    </nav>
  );
}

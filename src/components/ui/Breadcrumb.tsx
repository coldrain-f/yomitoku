import type { Screen } from "../../types";
import { useI18n } from "../../lib/i18n";

interface BreadcrumbProps {
  screen: Screen;
}

export function Breadcrumb({ screen }: BreadcrumbProps) {
  const { t } = useI18n();
  const paths: Record<Screen, string[]> = {
    home: [t("breadcrumb.learning"), t("breadcrumb.readingList")],
    login: [t("breadcrumb.login")],
    stats: [t("breadcrumb.learning"), t("breadcrumb.readingList"), t("breadcrumb.statistics")],
    reading: [t("breadcrumb.learning"), t("breadcrumb.readingList"), t("breadcrumb.solve")],
    result: [t("breadcrumb.learning"), t("breadcrumb.readingList"), t("breadcrumb.result")],
    admin: [t("breadcrumb.admin"), t("breadcrumb.content")],
    "generation-history": [t("breadcrumb.admin"), t("breadcrumb.content"), t("breadcrumb.history")],
    "admin-edit": [t("breadcrumb.admin"), t("breadcrumb.content"), t("breadcrumb.edit")],
    "manual-create": [t("breadcrumb.admin"), t("breadcrumb.content"), t("breadcrumb.manual")],
    generate: [t("breadcrumb.admin"), t("breadcrumb.content"), t("breadcrumb.generate")],
    preview: [t("breadcrumb.admin"), t("breadcrumb.content"), t("breadcrumb.preview")],
  };

  return (
    <nav className="breadcrumb" aria-label={t("breadcrumb.current")}>
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

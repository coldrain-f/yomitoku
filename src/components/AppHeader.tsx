import type { ReactNode } from "react";
import { BarChart3, BookOpen, ChevronDown, Highlighter, LogOut, Menu, Star } from "lucide-react";
import { Icon } from "./ui/Icon";
import { useI18n } from "../lib/i18n";
import type { ReadingLanguage, Role, Screen } from "../types";

interface AppHeaderProps {
  authenticated: boolean;
  role: Role;
  totalGenerated: number;
  completeCount: number;
  progressLanguage: ReadingLanguage;
  screen?: Screen;
  reviewing?: boolean;
  onHome: () => void;
  onOpenAdmin: () => void;
  onOpenStats: () => void;
  onOpenBookmarks: () => void;
  onOpenHighlights: () => void;
  onLogout: () => void;
}

function HeaderMenu({ label, children, compact = false, active = false }: {
  label: string; children: ReactNode; compact?: boolean; active?: boolean;
}) {
  return (
    <details className={`header-menu${compact ? " header-account-menu" : ""}`} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }} onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.currentTarget.open = false;
      event.currentTarget.querySelector("summary")?.focus();
    }} onClick={(event) => {
      if (!(event.target as HTMLElement).closest("button")) return;
      event.currentTarget.open = false;
      event.currentTarget.querySelector("summary")?.focus();
    }}>
      <summary className={active ? "is-active" : ""} aria-label={label}>
        {compact ? <Icon icon={Menu} /> : <><span>{label}</span><Icon icon={ChevronDown} /></>}
      </summary>
      <div className="header-menu-items">{children}</div>
    </details>
  );
}

export function AppHeader({
  authenticated,
  role,
  totalGenerated,
  completeCount,
  progressLanguage,
  screen = "home",
  reviewing = false,
  onHome,
  onOpenAdmin,
  onOpenStats,
  onOpenBookmarks,
  onOpenHighlights,
  onLogout,
}: AppHeaderProps) {
  const { locale, setLocale, t, languageLabel } = useI18n();
  const learning = ["home", "reading", "result"].includes(screen) && !reviewing;
  return (
    <header className="app-header">
      <div className="topbar">
      <button
        className="wordmark"
        type="button"
        aria-label="YOMITOKU, 読み解く"
        onClick={onHome}
      >
        <span lang="ja">読み解く</span>
      </button>
      <div className="header-actions">
        <div className="header-locale-switch" role="group" aria-label={t("header.locale")}>
          {(["ko", "ja"] as const).map((nextLocale) => (
            <button
              className={`header-locale-button${locale === nextLocale ? " is-active" : ""}`}
              type="button"
              aria-pressed={locale === nextLocale}
              key={nextLocale}
              onClick={() => setLocale(nextLocale)}
            >
              {t(`locale.${nextLocale}`)}
            </button>
          ))}
        </div>
        {authenticated ? <HeaderMenu compact label={t("nav.account")}>
          {role === "admin" ? <button type="button" onClick={onOpenAdmin}>{t("header.admin")}</button> : null}
          <button type="button" onClick={onLogout}><Icon icon={LogOut} />{t("header.logout")}</button>
        </HeaderMenu> : null}
      </div>
      </div>
      {authenticated ? <nav className="learning-nav" aria-label={t("nav.label")}>
        <button type="button" className={learning ? "is-active" : ""} aria-current={learning ? "page" : undefined} onClick={onHome}>
          <Icon icon={BookOpen} />{t("nav.learning")}
        </button>
        <HeaderMenu label={t("nav.review")} active={reviewing}>
          <button type="button" onClick={onOpenBookmarks}><Icon icon={Star} />{t("list.bookmarks")}</button>
          <button type="button" onClick={onOpenHighlights}><Icon icon={Highlighter} />{t("list.highlights")}</button>
        </HeaderMenu>
        {authenticated ? (
          <button
            className={screen === "stats" ? "is-active" : ""}
            type="button"
            aria-current={screen === "stats" ? "page" : undefined}
            aria-label={t("header.stats", {
              language: languageLabel(progressLanguage),
              total: totalGenerated,
              complete: completeCount,
            })}
            title={t("header.statsTitle", {
              language: languageLabel(progressLanguage),
            })}
            onClick={onOpenStats}
          >
            <Icon icon={BarChart3} />{t("nav.stats")}
            <span className="nav-progress" aria-hidden="true">{completeCount} / {totalGenerated}</span>
          </button>
        ) : null}
      </nav> : null}
    </header>
  );
}

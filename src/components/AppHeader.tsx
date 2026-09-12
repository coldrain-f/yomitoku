import { LogIn, LogOut } from "lucide-react";
import { Icon } from "./ui/Icon";
import { useI18n } from "../lib/i18n";
import type { ReadingLanguage, Role } from "../types";

interface AppHeaderProps {
  authenticated: boolean;
  role: Role;
  totalGenerated: number;
  completeCount: number;
  progressLanguage: ReadingLanguage;
  onHome: () => void;
  onOpenAdmin: () => void;
  onOpenStats: () => void;
  onLogin: () => void;
  onLogout: () => void;
}

export function AppHeader({
  authenticated,
  role,
  totalGenerated,
  completeCount,
  progressLanguage,
  onHome,
  onOpenAdmin,
  onOpenStats,
  onLogin,
  onLogout,
}: AppHeaderProps) {
  const { locale, setLocale, t, languageLabel } = useI18n();
  return (
    <header className="topbar">
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
        {authenticated && role === "admin" ? (
          <button
            className="header-admin-link"
            type="button"
            title={t("header.admin")}
            onClick={onOpenAdmin}
          >
            {t("header.admin")}
          </button>
        ) : null}
        {authenticated ? (
          <button
            className="header-progress"
            type="button"
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
            <span className="header-progress-current">{completeCount}</span>
            <span className="header-progress-separator" aria-hidden="true">
              /
            </span>
            <span className="header-progress-total">{totalGenerated}</span>
          </button>
        ) : null}
        {authenticated ? (
          <button
            className="header-icon-button header-logout-link"
            type="button"
            aria-label={t("header.logout")}
            title={t("header.logout")}
            onClick={onLogout}
          >
            <Icon icon={LogOut} />
          </button>
        ) : (
          <button
            className="link-button header-login-link"
            type="button"
            onClick={onLogin}
          >
            <Icon icon={LogIn} />
            {t("header.login")}
          </button>
        )}
      </div>
    </header>
  );
}

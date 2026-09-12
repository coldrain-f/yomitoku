import { ArrowRight, Check, Highlighter, Star } from "lucide-react";
import { Icon } from "../../components/ui/Icon";
import { useI18n } from "../../lib/i18n";

interface WelcomeScreenProps {
  onLogin: () => void;
}

export function WelcomeScreen({ onLogin }: WelcomeScreenProps) {
  const { t } = useI18n();

  return (
    <section className="screen screen-welcome" aria-label={t("welcome.aria")}>
      <div className="welcome-hero">
        <div className="welcome-hero-copy">
          <p className="kicker">{t("welcome.kicker")}</p>
          <h1 className="welcome-title">{t("welcome.title")}</h1>
          <p className="welcome-description">{t("welcome.description")}</p>
          <button className="primary-button welcome-login" type="button" onClick={onLogin}>
            {t("welcome.login")}
            <Icon icon={ArrowRight} />
          </button>
          <p className="welcome-login-note">{t("welcome.loginNote")}</p>
        </div>
        <div className="welcome-preview" aria-label={t("welcome.previewAria")}>
          <article className="welcome-preview-card">
            <header className="welcome-preview-head">
              <span>{t("welcome.previewKicker")}</span>
              <span>{t("welcome.previewMeta")}</span>
            </header>
            <p className="welcome-preview-passage" lang="ja">
              {t("welcome.previewPassage")}
            </p>
            <p className="welcome-preview-question">{t("welcome.previewQuestion")}</p>
            <ol className="welcome-preview-choices">
              <li className="is-correct">
                <span>01</span>
                <p>{t("welcome.previewCorrectChoice")}</p>
                <Icon icon={Check} />
              </li>
              <li>
                <span>02</span>
                <p>{t("welcome.previewWrongChoice")}</p>
              </li>
            </ol>
            <footer className="welcome-preview-result">
              <span className="welcome-preview-correct">
                <Icon icon={Check} />
                {t("welcome.previewCorrect")}
              </span>
              <span>
                <strong>100</strong>
                {t("welcome.previewScore")}
              </span>
              <span>
                <Icon icon={Highlighter} />
                {t("welcome.previewHighlights")}
              </span>
            </footer>
          </article>
        </div>
      </div>

      <section className="welcome-features" aria-labelledby="welcome-features-title">
        <div className="welcome-section-heading">
          <p className="kicker">{t("welcome.featuresKicker")}</p>
          <h2 id="welcome-features-title">{t("welcome.featuresTitle")}</h2>
        </div>
        <div className="welcome-feature-grid">
          <article className="welcome-feature">
            <Icon icon={Check} />
            <h3>{t("welcome.featureResultsTitle")}</h3>
            <p>{t("welcome.featureResultsDescription")}</p>
          </article>
          <article className="welcome-feature">
            <Icon icon={Star} />
            <h3>{t("welcome.featureBookmarksTitle")}</h3>
            <p>{t("welcome.featureBookmarksDescription")}</p>
          </article>
          <article className="welcome-feature">
            <Icon icon={Highlighter} />
            <h3>{t("welcome.featureHighlightsTitle")}</h3>
            <p>{t("welcome.featureHighlightsDescription")}</p>
          </article>
        </div>
      </section>

      <div className="welcome-closing">
        <div>
          <p className="kicker">{t("welcome.closingKicker")}</p>
          <h2>{t("welcome.closingTitle")}</h2>
        </div>
        <button className="text-button welcome-closing-login" type="button" onClick={onLogin}>
          {t("welcome.closingLogin")}
          <Icon icon={ArrowRight} />
        </button>
      </div>
    </section>
  );
}

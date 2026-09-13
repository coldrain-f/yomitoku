import { ArrowRight, Check, Highlighter, MessageSquare, Star } from "lucide-react";
import { Icon } from "../../components/ui/Icon";
import { useI18n } from "../../lib/i18n";

interface WelcomeScreenProps {
  onLogin: () => void;
}

const previewChoiceKeys = [
  "welcome.previewChoice1",
  "welcome.previewChoice2",
  "welcome.previewChoice3",
  "welcome.previewChoice4",
] as const;

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
          <article className="paper flush welcome-preview-card" data-reading-language="ja">
            <div className="paper-head welcome-preview-head">
              <div>
                <p className="kicker">{t("welcome.previewKicker")}</p>
                <h2 className="title-jp" lang="ja">{t("welcome.previewTitle")}</h2>
              </div>
              <div className="reading-meta">
                <div className="time-block">
                  <span>{t("welcome.previewRecommended")}</span>
                  <strong>{t("welcome.previewElapsed")}</strong>
                  <div className="progress-track" aria-hidden="true">
                    <span style={{ width: "47%" }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="reading-body welcome-preview-body">
              <div className="passage">
                <p lang="ja">{t("welcome.previewPassage")}</p>
              </div>
              <div className="question-block">
                <h3>{t("welcome.previewQuestion")}</h3>
                <div className="answer-list">
                  {previewChoiceKeys.map((key, index) => (
                    <div
                      className={`answer-choice${index === 0 ? " is-selected" : ""}`}
                      key={key}
                    >
                      <span className="answer-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>{t(key)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="footer-actions welcome-preview-actions">
                <span className="link-button">
                  <Icon icon={MessageSquare} />
                  {t("welcome.previewReport")}
                </span>
                <span className="primary-button">
                  <Icon icon={Check} />
                  {t("welcome.previewSubmit")}
                </span>
              </div>
            </div>
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

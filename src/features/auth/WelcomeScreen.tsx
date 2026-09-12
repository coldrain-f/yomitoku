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
        <ol className="welcome-journey" aria-label={t("welcome.flowTitle")}>
          <li>
            <span className="welcome-step-index">01</span>
            <div>
              <strong>{t("welcome.stepChooseTitle")}</strong>
              <p>{t("welcome.stepChooseDescription")}</p>
            </div>
          </li>
          <li>
            <span className="welcome-step-index">02</span>
            <div>
              <strong>{t("welcome.stepSolveTitle")}</strong>
              <p>{t("welcome.stepSolveDescription")}</p>
            </div>
          </li>
          <li>
            <span className="welcome-step-index">03</span>
            <div>
              <strong>{t("welcome.stepReviewTitle")}</strong>
              <p>{t("welcome.stepReviewDescription")}</p>
            </div>
          </li>
        </ol>
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

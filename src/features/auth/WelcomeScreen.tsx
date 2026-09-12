import { LogIn } from "lucide-react";
import { Icon } from "../../components/ui/Icon";
import { useI18n } from "../../lib/i18n";

interface WelcomeScreenProps {
  onLogin: () => void;
}

export function WelcomeScreen({ onLogin }: WelcomeScreenProps) {
  const { t } = useI18n();

  return (
    <section className="screen screen-welcome" aria-label={t("welcome.aria")}>
      <div className="paper welcome-paper">
        <p className="kicker">{t("welcome.kicker")}</p>
        <h1 className="screen-title">{t("welcome.title")}</h1>
        <p className="body-copy">{t("welcome.description")}</p>
        <ul className="welcome-benefits">
          <li>{t("welcome.benefitResults")}</li>
          <li>{t("welcome.benefitBookmarks")}</li>
          <li>{t("welcome.benefitHighlights")}</li>
        </ul>
        <button className="primary-button welcome-login" type="button" onClick={onLogin}>
          <Icon icon={LogIn} />
          {t("welcome.login")}
        </button>
      </div>
    </section>
  );
}

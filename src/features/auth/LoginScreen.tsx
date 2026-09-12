import { ArrowLeft } from "lucide-react";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { Icon } from "../../components/ui/Icon";
import { useI18n } from "../../lib/i18n";

interface LoginScreenProps {
  clientId: string;
  error: string;
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
  onBack: () => void;
}

export function LoginScreen({
  clientId,
  error,
  onCredential,
  onError,
  onBack,
}: LoginScreenProps) {
  const { t } = useI18n();

  return (
    <section className="screen screen-login" aria-label={t("auth.kicker")}>
      <div className="paper login-paper">
        <p className="kicker">{t("auth.pageKicker")}</p>
        <h1 className="screen-title">{t("auth.pageTitle")}</h1>
        <p className="body-copy">{t("auth.description")}</p>
        <GoogleSignInButton
          clientId={clientId}
          onCredential={onCredential}
          onError={onError}
        />
        {error ? <p className="login-error" role="alert">{error}</p> : null}
        <button className="link-button login-back" type="button" onClick={onBack}>
          <Icon icon={ArrowLeft} />
          {t("auth.back")}
        </button>
      </div>
    </section>
  );
}

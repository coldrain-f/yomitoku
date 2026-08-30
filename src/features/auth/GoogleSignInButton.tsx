import { useEffect, useRef } from "react";

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
        auto_select: boolean;
        cancel_on_tap_outside: boolean;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: {
          type: "standard";
          theme: "outline";
          size: "large";
          text: "signin_with";
          shape: "rectangular";
          locale: string;
          width: number;
        },
      ) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

const scriptId = "google-identity-services";
const scriptSource = "https://accounts.google.com/gsi/client";

function loadGoogleIdentityServices(): Promise<GoogleIdentityServices> {
  if (window.google) return Promise.resolve(window.google);

  const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
  const script = existing ?? document.createElement("script");
  if (!existing) {
    script.id = scriptId;
    script.src = scriptSource;
    script.async = true;
    script.defer = true;
    document.head.append(script);
  }

  return new Promise((resolve, reject) => {
    const resolveGoogle = () => {
      if (window.google) resolve(window.google);
      else reject(new Error("Google 로그인 도구를 불러오지 못했습니다."));
    };
    script.addEventListener("load", resolveGoogle, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Google 로그인 도구를 불러오지 못했습니다.")),
      { once: true },
    );
  });
}

interface GoogleSignInButtonProps {
  clientId: string;
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
}

export function GoogleSignInButton({
  clientId,
  onCredential,
  onError,
}: GoogleSignInButtonProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const credentialHandler = useRef(onCredential);

  useEffect(() => {
    credentialHandler.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!clientId) {
      onError("Google 로그인 설정이 아직 준비되지 않았습니다.");
      return undefined;
    }
    let active = true;
    void loadGoogleIdentityServices()
      .then((google) => {
        if (!active || !rootRef.current) return;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) => credentialHandler.current(credential),
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        rootRef.current.replaceChildren();
        google.accounts.id.renderButton(rootRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          locale: "ko",
          width: 300,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message =
          error instanceof Error
            ? error.message
            : "Google 로그인 도구를 불러오지 못했습니다.";
        onError(message);
      });
    return () => {
      active = false;
    };
  }, [clientId, onError]);

  return (
    <div className="google-sign-in" ref={rootRef} />
  );
}

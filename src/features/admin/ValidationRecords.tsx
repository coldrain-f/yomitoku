import { useI18n, type TranslationFunction } from "../../lib/i18n";
import type { ItemValidation } from "../../types";

function validationRoleLabel(role: string, t: TranslationFunction): string {
  return {
    schema: t("admin.validationSchema"),
    answer: t("admin.validationAnswer"),
    quality: t("admin.validationQuality"),
  }[role] ?? role;
}

function validationStatusLabel(status: string, t: TranslationFunction): string {
  return {
    passed: t("admin.validationPassed"),
    warning: t("admin.validationWarning"),
    failed: t("admin.validationFailed"),
  }[status] ?? status;
}

function validationStatusClass(status: string): string {
  if (status === "passed") return "badge ok";
  if (status === "failed") return "badge danger";
  return "badge";
}

function validationStateFor(validations: ItemValidation[]): "passed" | "warning" | "failed" | "unknown" {
  if (validations.some((validation) => validation.status === "failed")) return "failed";
  if (validations.some((validation) => validation.status === "warning")) return "warning";
  return validations.length ? "passed" : "unknown";
}

export function ValidationRecords({
  validations,
  held = false,
}: {
  validations: ItemValidation[];
  held?: boolean;
}) {
  const { t } = useI18n();
  const state = validationStateFor(validations);
  const records = held
    ? validations.filter((validation) => validation.status !== "passed")
    : validations;

  return (
    <section className="admin-validation" aria-label={held ? t("admin.holdReason") : t("admin.validation")}>
      <div className="admin-section-heading">
        <h2 className="admin-section-title">{held ? t("admin.holdReason") : t("admin.validation")}</h2>
        <span className={validationStatusClass(state)}>
          {state === "unknown"
            ? t("admin.noRecords")
            : t("admin.validationPrefix", { status: validationStatusLabel(state, t) })}
        </span>
      </div>
      {records.length ? (
        <div className="admin-validation-records">
          {records.map((validation) => (
            <article className="admin-validation-record" key={`${validation.validatorRole}-${validation.createdAt}`}>
              <div className="admin-validation-record-head">
                <div>
                  <h3 className="admin-subsection-title">
                    {validationRoleLabel(validation.validatorRole, t)}
                  </h3>
                  <p className="admin-record-model">{validation.modelId}</p>
                </div>
                <div className="admin-record-meta">
                  {validation.score !== null ? (
                    <span className="admin-validation-score">{t("admin.points", { score: validation.score })}</span>
                  ) : null}
                  <span className={validationStatusClass(validation.status)}>
                    {validationStatusLabel(validation.status, t)}
                  </span>
                </div>
              </div>
              {validation.issueCodes.length ? (
                <p className="admin-validation-issues">
                  {validation.issueCodes.join(" · ")}
                </p>
              ) : null}
              {validation.evidence.length ? (
                <ul className="admin-validation-evidence">
                  {validation.evidence.map((evidence, index) => (
                    <li key={`${validation.validatorRole}-${index}`}>{evidence}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="admin-empty-detail">
          {held
            ? t("admin.noValidationHeld")
            : t("admin.noValidation")}
        </p>
      )}
    </section>
  );
}

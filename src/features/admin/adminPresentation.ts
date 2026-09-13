import type { TranslationFunction } from "../../lib/i18n";

export function itemStatusLabel(status: string, t: TranslationFunction): string {
  return {
    review: t("admin.statusReview"),
    held: t("admin.statusHeld"),
    published: t("admin.statusPublished"),
  }[status] ?? status;
}

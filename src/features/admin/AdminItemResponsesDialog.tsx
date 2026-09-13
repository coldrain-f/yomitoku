import { useEffect, useState } from "react";
import { ListPagination } from "../../components/ui/ListPagination";
import { api, type AdminItemFeedback, type AdminItemResponsePage } from "../../lib/api";
import { formatDate } from "../../lib/reading";
import { useI18n } from "../../lib/i18n";
import type { ItemReport } from "../../types";

type ResponseTab = "feedback" | "report";

const pageSize = 5;

const emptyPage = <T,>(): AdminItemResponsePage<T> => ({
  items: [],
  page: 1,
  pageSize,
  totalItems: 0,
  totalPages: 1,
});

interface AdminItemResponsesDialogProps {
  itemId: string;
  evaluationCount: number;
  reportCount: number;
}

export function AdminItemResponsesDialog({
  itemId,
  evaluationCount,
  reportCount,
}: AdminItemResponsesDialogProps) {
  const { errorMessage, levelLabel, locale, t } = useI18n();
  const [tab, setTab] = useState<ResponseTab>("feedback");
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState<AdminItemResponsePage<AdminItemFeedback>>(
    emptyPage,
  );
  const [reports, setReports] = useState<AdminItemResponsePage<ItemReport>>(emptyPage);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");
    const request = tab === "feedback"
      ? api.adminItemFeedback(itemId, page, pageSize)
      : api.adminItemReports(itemId, page, pageSize);
    void request.then(
      (nextPage) => {
        if (!active) return;
        if (tab === "feedback") {
          setFeedback(nextPage as AdminItemResponsePage<AdminItemFeedback>);
        } else {
          setReports(nextPage as AdminItemResponsePage<ItemReport>);
        }
      },
      (requestError: unknown) => {
        if (active) setError(errorMessage(requestError, "admin.responsesLoadFailed"));
      },
    ).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [errorMessage, itemId, page, tab]);

  const current = tab === "feedback" ? feedback : reports;
  const selectTab = (nextTab: ResponseTab) => {
    setTab(nextTab);
    setPage(1);
  };

  return (
    <div className="admin-item-responses-dialog">
      <div className="admin-response-tabs" role="tablist" aria-label={t("admin.userResponses")}>
        <button
          className={`admin-response-tab${tab === "feedback" ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={tab === "feedback"}
          onClick={() => selectTab("feedback")}
        >
          {t("admin.evaluations", { count: evaluationCount })}
        </button>
        <button
          className={`admin-response-tab${tab === "report" ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={tab === "report"}
          onClick={() => selectTab("report")}
        >
          {t("admin.errorReportsCount", { count: reportCount })}
        </button>
      </div>
      {isLoading ? (
        <div className="admin-response-loading" role="status" aria-label={t("common.loading")}>
          <span className="loading-spinner loading-spinner-large" aria-hidden="true" />
        </div>
      ) : null}
      {error ? <p className="dialog-field-error" role="alert">{error}</p> : null}
      {!isLoading && !error && current.totalItems === 0 ? (
        <p className="admin-response-empty">
          {tab === "feedback" ? t("admin.emptyFeedback") : t("admin.emptyReports")}
        </p>
      ) : null}
      {!isLoading && !error && current.totalItems > 0 ? (
        <>
          {tab === "feedback" ? (
            <div className="admin-response-table-wrap">
              <table className="admin-response-table admin-response-feedback-table">
                <thead>
                  <tr>
                    <th>{t("admin.feedbackRating")}</th>
                    <th>{t("admin.perceivedLevel")}</th>
                    <th>{t("admin.feedbackComment")}</th>
                    <th>{t("admin.feedbackDate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {feedback.items.map((entry) => (
                    <tr key={entry.id}>
                      <td data-label={t("admin.feedbackRating")}>
                        <span className="badge">{entry.qualityRating} / 5</span>
                      </td>
                      <td data-label={t("admin.perceivedLevel")}>{levelLabel(entry.perceivedLevel)}</td>
                      <td data-label={t("admin.feedbackComment")} className="admin-response-comment">
                        {entry.comment || t("admin.noComment")}
                      </td>
                      <td data-label={t("admin.feedbackDate")}>
                        <time className="row-date">{formatDate(entry.updatedAt, locale)}</time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-response-table-wrap">
              <table className="admin-response-table admin-response-report-table">
                <thead>
                  <tr>
                    <th>{t("admin.reportContent")}</th>
                    <th>{t("admin.reportStatus")}</th>
                    <th>{t("admin.reportDate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.items.map((entry) => (
                    <tr key={entry.id}>
                      <td data-label={t("admin.reportContent")} className="admin-response-comment">
                        {entry.content}
                      </td>
                      <td data-label={t("admin.reportStatus")}>
                        <span className="badge">
                          {entry.status === "open" ? t("admin.reportReceived") : entry.status}
                        </span>
                      </td>
                      <td data-label={t("admin.reportDate")}>
                        <time className="row-date">{formatDate(entry.createdAt, locale)}</time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="admin-response-pagination">
            <span>{tab === "feedback"
              ? t("admin.evaluations", { count: current.totalItems })
              : t("admin.errorReportsCount", { count: current.totalItems })} · {t("admin.responsePage", {
              page: current.page,
              pages: current.totalPages,
            })}</span>
            {current.totalPages > 1 ? (
              <ListPagination
                page={current.page}
                totalPages={current.totalPages}
                onChange={setPage}
                ariaLabel={t("admin.responsePagination")}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

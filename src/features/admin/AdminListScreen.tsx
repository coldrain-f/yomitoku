import { History, Pencil, Plus, Search, SlidersHorizontal } from "lucide-react";
import { Icon } from "../../components/ui/Icon";
import { ListPagination } from "../../components/ui/ListPagination";
import { LoadingOverlay } from "../../components/ui/LoadingBar";
import { OptionButtons } from "../../components/ui/OptionButtons";
import { useI18n } from "../../lib/i18n";
import { formatDate, minimumVotes, statusClass } from "../../lib/reading";
import { readingLanguages } from "../../lib/readingPolicy";
import type { AdminFilters, ReadingItem, ReadingLanguage } from "../../types";
import { itemStatusLabel } from "./adminPresentation";

interface AdminListScreenProps {
  items: ReadingItem[];
  loading: boolean;
  error: string;
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  filters: AdminFilters;
  query: string;
  setQuery: (query: string) => void;
  onLanguageChange: (language: ReadingLanguage) => void;
  onFilters: () => void;
  onEdit: (item: ReadingItem) => void;
  onGenerate: () => void;
  onManualCreate: () => void;
  onHistory: () => void;
}

export function AdminListScreen({
  items,
  loading,
  error,
  page,
  totalPages,
  totalItems,
  onPageChange,
  filters,
  query,
  setQuery,
  onLanguageChange,
  onFilters,
  onEdit,
  onGenerate,
  onManualCreate,
  onHistory,
}: AdminListScreenProps) {
  const {
    locale,
    t,
    languageLabel,
    levelLabel,
    lengthLabel,
    topicLabel,
    perceivedLabel: localizedPerceivedLabel,
  } = useI18n();
  const hasAppliedFilters =
    filters.level !== "all" ||
    filters.length !== "all" ||
    filters.topic !== "all" ||
    filters.status !== "all" ||
    filters.sort !== "created-desc";

  return (
    <section className="screen screen-admin" aria-label={t("admin.management")}>
      <div className="paper flush">
        <div className="paper-head admin-paper-head">
          <div>
            <p className="kicker">{t("admin.kicker")}</p>
            <h1 className="screen-title">{t("admin.management")}</h1>
          </div>
          <p className="list-result-count">{t("admin.itemCount", { count: totalItems })}</p>
        </div>
        <div className="admin-toolbar">
          <div className="filter-search">
            <Icon icon={Search} />
            <input
              className="title-search"
              type="search"
              placeholder={t("admin.searchPlaceholder")}
              aria-label={t("admin.searchLabel")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="list-language-switch">
            <OptionButtons
              value={filters.language}
              options={readingLanguages.map((language) => ({
                value: language,
                label: languageLabel(language),
              }))}
              onChange={(language) => onLanguageChange(language as ReadingLanguage)}
              ariaLabel={t("admin.contentLanguageAria")}
            />
          </div>
          <div className="admin-toolbar-tools">
            <button
              className={`icon-button list-filter-button${hasAppliedFilters ? " is-active" : ""}`}
              type="button"
              aria-label={t("admin.filter")}
              aria-pressed={hasAppliedFilters}
              title={t("admin.filter")}
              onClick={onFilters}
            >
              <Icon icon={SlidersHorizontal} />
            </button>
          </div>
        </div>
        {loading ? <LoadingOverlay label={t("admin.loadingItems")} /> : null}
        {error ? <p className="list-load-error" role="alert">{error}</p> : null}
        <div className="admin-list" aria-busy={loading}>
          {items.map((item) => (
            <button
              className="admin-row"
              type="button"
              key={item.id}
              onClick={() => onEdit(item)}
            >
              <span>
                <span className="admin-row-title" lang={item.language}>{item.title}</span>
                <span className="row-meta">
                  <span className="badge row-level">{levelLabel(item.officialLevel)}</span>
                  {item.perceivedVotes >= minimumVotes ? (
                    <span className="badge row-perceived">
                      {localizedPerceivedLabel(item)} · {t("admin.responses", { count: item.perceivedVotes })}
                    </span>
                  ) : null}
                  <span className="badge">{lengthLabel(item.lengthType)}</span>
                  <span className="row-topic">{topicLabel(item.topic)}</span>
                </span>
              </span>
              <span className="admin-row-state">
                <span className={statusClass(item.status)}>
                  {itemStatusLabel(item.status, t)}
                </span>
                <time className="row-date">{t("admin.created", { date: formatDate(item.createdAt, locale) })}</time>
                <time className="row-date">{t("admin.updated", { date: formatDate(item.updatedAt, locale) })}</time>
              </span>
              <Icon icon={Pencil} />
            </button>
          ))}
        </div>
        {!loading && items.length === 0 ? (
          <div className="reading-list-empty">
            <p>{t("admin.emptyItems")}</p>
          </div>
        ) : (
          <ListPagination
            page={page}
            totalPages={totalPages}
            onChange={onPageChange}
            ariaLabel={t("admin.itemsPagination")}
          />
        )}
        <div className="home-actions admin-list-actions">
          <button className="text-button" type="button" onClick={onHistory}>
            <Icon icon={History} />
            {t("admin.history")}
          </button>
          <button className="text-button" type="button" onClick={onManualCreate}>
            <Icon icon={Pencil} />
            {t("admin.manualEntry")}
          </button>
          <button className="primary-button" type="button" onClick={onGenerate}>
            <Icon icon={Plus} />{t("admin.newReading")}
          </button>
        </div>
      </div>
    </section>
  );
}

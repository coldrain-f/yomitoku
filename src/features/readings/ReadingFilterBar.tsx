import { RotateCcw, Star, X } from "lucide-react";
import { Icon } from "../../components/ui/Icon";
import { OptionButtons } from "../../components/ui/OptionButtons";
import { useI18n, type TranslationFunction } from "../../lib/i18n";
import { levelsForLanguage } from "../../lib/readingPolicy";
import type { ListFilters } from "../../types";

const sortKeys = {
  "published-desc": "filters.publishedDesc", "published-asc": "filters.publishedAsc",
  "level-asc": "filters.levelAsc", "level-desc": "filters.levelDesc",
  "perceived-asc": "filters.perceivedAsc", "perceived-desc": "filters.perceivedDesc",
  "score-asc": "filters.scoreAsc", "score-desc": "filters.scoreDesc",
} as const;

function statusLabel(status: ListFilters["status"], t: TranslationFunction) {
  if (status.startsWith("score-")) return t("common.score", { score: status.slice(6) });
  return t(status === "unstarted" ? "filters.unstarted" : status === "wrong" ? "filters.wrong" : "filters.all");
}

export function ReadingFilterBar({ filters, setFilters, query, setQuery, authenticated, onReset }: {
  filters: ListFilters;
  setFilters: (filters: ListFilters) => void;
  query: string;
  setQuery: (query: string) => void;
  authenticated: boolean;
  onReset: () => void;
}) {
  const { t, levelLabel, lengthLabel } = useI18n();
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (query) chips.push({ key: "query", label: query, clear: () => setQuery("") });
  if (filters.level !== "all") chips.push({ key: "level", label: levelLabel(filters.level), clear: () => setFilters({ ...filters, level: "all" }) });
  if (filters.length !== "all") chips.push({ key: "length", label: lengthLabel(filters.length), clear: () => setFilters({ ...filters, length: "all" }) });
  if (authenticated && filters.status !== "all") chips.push({ key: "status", label: statusLabel(filters.status, t), clear: () => setFilters({ ...filters, status: "all" }) });
  if (authenticated && filters.bookmarked) chips.push({ key: "bookmarked", label: t("list.bookmarks"), clear: () => setFilters({ ...filters, bookmarked: false }) });
  if (authenticated && filters.firstSubmissionTime !== "all") chips.push({ key: "time", label: `${t("filters.firstTime")} · ${t(filters.firstSubmissionTime === "on-time" ? "filters.onTime" : "filters.timedOut")}`, clear: () => setFilters({ ...filters, firstSubmissionTime: "all" }) });
  if (filters.sort !== "published-desc") chips.push({ key: "sort", label: t(sortKeys[filters.sort]), clear: () => setFilters({ ...filters, sort: "published-desc" }) });
  return <div className="list-filter-bar">
    <div className="quick-filters" aria-label={t("list.quickFilters")}>
      {authenticated ? <>
        <OptionButtons value={filters.status} options={["all", "unstarted", "wrong"].map(value => ({ value, label: statusLabel(value as ListFilters["status"], t) }))}
          ariaLabel={t("filters.resultAria")} onChange={value => setFilters({ ...filters, status: value as ListFilters["status"] })} />
        <button type="button" className={`text-button quick-bookmark${filters.bookmarked ? " is-selected" : ""}`} aria-pressed={filters.bookmarked}
          onClick={() => setFilters({ ...filters, bookmarked: !filters.bookmarked })}>
          <Icon icon={Star} />{t("list.bookmarks")}
        </button>
      </> : null}
      <label className="quick-level">
        <span>{t("filters.level")}</span>
        <select value={filters.level} onChange={event => setFilters({ ...filters, level: event.target.value as ListFilters["level"] })}>
          <option value="all">{t("filters.all")}</option>
          {levelsForLanguage(filters.language).map(level => <option key={level} value={level}>{levelLabel(level)}</option>)}
        </select>
      </label>
    </div>
    {chips.length ? <div className="applied-filters" aria-label={t("list.appliedFilters")}>
      {chips.map(chip => <button className="filter-chip" type="button" key={chip.key} onClick={chip.clear} aria-label={t("list.removeFilter", { label: chip.label })}>
        <span>{chip.label}</span><Icon icon={X} />
      </button>)}
      <button className="filter-reset" type="button" onClick={onReset}><Icon icon={RotateCcw} />{t("common.reset")}</button>
    </div> : null}
  </div>;
}

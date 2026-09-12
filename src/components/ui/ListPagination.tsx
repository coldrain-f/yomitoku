import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Icon } from "./Icon";
import { useI18n } from "../../lib/i18n";

interface ListPaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  ariaLabel?: string;
}

export function ListPagination({
  page,
  totalPages,
  onChange,
  ariaLabel,
}: ListPaginationProps) {
  const { t } = useI18n();
  const numbers = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((number) => number > 0 && number <= totalPages)
    .sort((a, b) => a - b);

  return (
    <nav className="list-pagination" aria-label={ariaLabel ?? t("pagination.readings")}>
      <button
        className="pagination-button"
        type="button"
        disabled={page === 1}
        aria-label={t("pagination.previous")}
        onClick={() => onChange(page - 1)}
      >
        <Icon icon={ChevronLeft} />
      </button>
      {numbers.map((number, index) => (
        <span key={number}>
          {index > 0 && number - numbers[index - 1] > 1 ? (
            <span className="pagination-ellipsis">...</span>
          ) : null}
          <button
            className={`pagination-button${number === page ? " is-current" : ""}`}
            type="button"
            aria-current={number === page ? "page" : undefined}
            onClick={() => onChange(number)}
          >
            {number}
          </button>
        </span>
      ))}
      <button
        className="pagination-button"
        type="button"
        disabled={page === totalPages}
        aria-label={t("pagination.next")}
        onClick={() => onChange(page + 1)}
      >
        <Icon icon={ChevronRight} />
      </button>
    </nav>
  );
}

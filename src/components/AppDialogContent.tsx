import { OptionButtons } from "./ui/OptionButtons";
import { topics } from "../data";
import { lengthLabels } from "../lib/reading";
import type {
  AdminFilters,
  DialogConfig,
  FeedbackValues,
  ListFilters,
  StateSetter,
} from "../types";

interface AppDialogContentProps {
  type: DialogConfig["type"];
  authenticated: boolean;
  filterDraft: ListFilters;
  setFilterDraft: StateSetter<ListFilters>;
  adminFilterDraft: AdminFilters;
  setAdminFilterDraft: StateSetter<AdminFilters>;
  reportText: string;
  setReportText: StateSetter<string>;
  feedback: FeedbackValues;
  setFeedback: StateSetter<FeedbackValues>;
  dialogError: string;
}

export function AppDialogContent({
  type,
  authenticated,
  filterDraft,
  setFilterDraft,
  adminFilterDraft,
  setAdminFilterDraft,
  reportText,
  setReportText,
  feedback,
  setFeedback,
  dialogError,
}: AppDialogContentProps) {
  if (type === "list-filter") {
    return (
      <div className="dialog-filter-field">
        <div className="dialog-filter-section">
          <span className="form-label">난이도</span>
          <OptionButtons
            value={filterDraft.level}
            options={[
              { value: "all", label: "전체" },
              "N5",
              "N4",
              "N3",
              "N2",
              "N1",
            ]}
            onChange={(level) =>
              setFilterDraft({
                ...filterDraft,
                level: level as ListFilters["level"],
              })
            }
            ariaLabel="난이도 필터"
          />
        </div>
        <div className="dialog-filter-section">
          <span className="form-label">유형</span>
          <OptionButtons
            value={filterDraft.length}
            options={[
              { value: "all", label: "전체" },
              ...Object.entries(lengthLabels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
            onChange={(length) =>
              setFilterDraft({
                ...filterDraft,
                length: length as ListFilters["length"],
              })
            }
            ariaLabel="유형 필터"
          />
        </div>
        {authenticated ? (
          <div className="dialog-filter-section">
            <span className="form-label">풀이 상태</span>
            <OptionButtons
              value={filterDraft.status}
              options={[
                { value: "all", label: "전체" },
                { value: "unstarted", label: "미풀이" },
                { value: "wrong", label: "오답" },
                { value: "correct", label: "정답" },
              ]}
              onChange={(status) =>
                setFilterDraft({
                  ...filterDraft,
                  status: status as ListFilters["status"],
                })
              }
              ariaLabel="풀이 상태 필터"
            />
          </div>
        ) : null}
        <label className="dialog-filter-section">
          <span className="form-label">정렬</span>
          <select
            className="select-field"
            value={filterDraft.sort}
            onChange={(event) =>
              setFilterDraft({
                ...filterDraft,
                sort: event.target.value as ListFilters["sort"],
              })
            }
          >
            <option value="published-desc">등록일 최신순</option>
            <option value="published-asc">등록일 오래된순</option>
            <option value="level-asc">난이도 낮은순</option>
            <option value="level-desc">난이도 높은순</option>
            <option value="perceived-asc">체감 난이도 낮은순</option>
            <option value="perceived-desc">체감 난이도 높은순</option>
          </select>
        </label>
      </div>
    );
  }

  if (type === "admin-filter") {
    return (
      <div className="dialog-admin-filter-field">
        <div className="dialog-filter-section">
          <span className="form-label">난이도</span>
          <OptionButtons
            value={adminFilterDraft.level}
            options={[
              { value: "all", label: "전체" },
              "N5",
              "N4",
              "N3",
              "N2",
              "N1",
            ]}
            onChange={(level) =>
              setAdminFilterDraft({
                ...adminFilterDraft,
                level: level as AdminFilters["level"],
              })
            }
            ariaLabel="난이도 필터"
          />
        </div>
        <div className="dialog-filter-section">
          <span className="form-label">유형</span>
          <OptionButtons
            value={adminFilterDraft.length}
            options={[
              { value: "all", label: "전체" },
              ...Object.entries(lengthLabels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
            onChange={(length) =>
              setAdminFilterDraft({
                ...adminFilterDraft,
                length: length as AdminFilters["length"],
              })
            }
            ariaLabel="유형 필터"
          />
        </div>
        <label className="dialog-filter-section">
          <span className="form-label">주제</span>
          <select
            className="select-field"
            value={adminFilterDraft.topic}
            onChange={(event) =>
              setAdminFilterDraft({
                ...adminFilterDraft,
                topic: event.target.value as AdminFilters["topic"],
              })
            }
          >
            <option value="all">전체</option>
            {topics.map((topic) => (
              <option key={topic}>{topic}</option>
            ))}
          </select>
        </label>
        <div className="dialog-filter-section">
          <span className="form-label">상태</span>
          <OptionButtons
            value={adminFilterDraft.status}
            options={[
              { value: "all", label: "전체" },
              { value: "review", label: "검토 중" },
              { value: "held", label: "보류" },
              { value: "published", label: "게시" },
            ]}
            onChange={(status) =>
              setAdminFilterDraft({
                ...adminFilterDraft,
                status: status as AdminFilters["status"],
              })
            }
            ariaLabel="상태 필터"
          />
        </div>
        <label className="dialog-filter-section">
          <span className="form-label">정렬</span>
          <select
            className="select-field"
            value={adminFilterDraft.sort}
            onChange={(event) =>
              setAdminFilterDraft({
                ...adminFilterDraft,
                sort: event.target.value as AdminFilters["sort"],
              })
            }
          >
            <option value="updated-desc">수정일 최신순</option>
            <option value="updated-asc">수정일 오래된순</option>
            <option value="created-desc">등록일 최신순</option>
            <option value="created-asc">등록일 오래된순</option>
            <option value="title-asc">제목 가나다순</option>
            <option value="level-asc">난이도 낮은순</option>
            <option value="level-desc">난이도 높은순</option>
            <option value="perceived-asc">체감 난이도 낮은순</option>
            <option value="perceived-desc">체감 난이도 높은순</option>
            <option value="status-asc">상태순</option>
          </select>
        </label>
      </div>
    );
  }

  if (type === "report") {
    return (
      <label className="dialog-report-field">
        <span className="form-label">제보 내용</span>
        <textarea
          className="dialog-report-text"
          value={reportText}
          onChange={(event) => setReportText(event.target.value)}
          placeholder="지문, 문제, 선택지에서 이상한 부분을 알려 주세요."
        />
        {dialogError ? (
          <span className="dialog-field-error">{dialogError}</span>
        ) : null}
      </label>
    );
  }

  if (type === "feedback") {
    return (
      <div className="dialog-feedback-field">
        <div className="rating-group">
          <span className="form-label">문항 품질</span>
          <OptionButtons
            value={feedback.quality}
            options={[
              { value: "1", label: "매우 아쉬움" },
              { value: "2", label: "아쉬움" },
              { value: "3", label: "보통" },
              { value: "4", label: "좋음" },
              { value: "5", label: "매우 좋음" },
            ]}
            onChange={(quality) =>
              setFeedback({
                ...feedback,
                quality: quality as FeedbackValues["quality"],
              })
            }
            ariaLabel="문항 품질"
          />
        </div>
        <div className="rating-group">
          <span className="form-label">체감 난이도</span>
          <OptionButtons
            value={feedback.level}
            options={["N5", "N4", "N3", "N2", "N1"]}
            onChange={(level) =>
              setFeedback({
                ...feedback,
                level: level as FeedbackValues["level"],
              })
            }
            ariaLabel="체감 난이도"
          />
        </div>
        <label className="dialog-feedback-text-label">
          <span className="form-label">개선 의견</span>
          <textarea
            className="dialog-feedback-text"
            value={feedback.comment}
            onChange={(event) =>
              setFeedback({ ...feedback, comment: event.target.value })
            }
          />
        </label>
        {dialogError ? (
          <span className="dialog-field-error">{dialogError}</span>
        ) : null}
      </div>
    );
  }

  return null;
}

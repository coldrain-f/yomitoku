import { OptionButtons } from "./ui/OptionButtons";
import { Trash2 } from "lucide-react";
import { GoogleSignInButton } from "../features/auth/GoogleSignInButton";
import { Icon } from "./ui/Icon";
import { formatDate, lengthLabels } from "../lib/reading";
import {
  languageLabels,
  generationLevelsForLanguage,
  levelsForLanguage,
  readingTopics,
} from "../lib/readingPolicy";
import type { ReadingTranslation } from "../lib/api";
import type {
  AdminFilters,
  DialogConfig,
  FeedbackValues,
  HighlightCollectionPage,
  HighlightRemovalConfirmation,
  ListFilters,
  ReadingLanguage,
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
  feedbackLanguage: ReadingLanguage;
  setFeedback: StateSetter<FeedbackValues>;
  dialogError: string;
  googleClientId: string;
  onGoogleCredential: (credential: string) => void;
  onGoogleError: (message: string) => void;
  translation: ReadingTranslation | null;
  translationLoading: boolean;
  translationError: string;
  highlightCollection: HighlightCollectionPage;
  highlightLanguage: "all" | ReadingLanguage;
  highlightQuery: string;
  onHighlightLanguageChange: (language: "all" | ReadingLanguage) => void;
  onHighlightQueryChange: (query: string) => void;
  onHighlightSearch: () => void;
  onHighlightPageChange: (page: number) => void;
  highlightsLoading: boolean;
  highlightsError: string;
  removingHighlightId: string | null;
  highlightRemoval: HighlightRemovalConfirmation | null;
  onCancelHighlightRemoval: () => void;
  onConfirmHighlightRemoval: () => void;
  onRemoveHighlight: (readingItemId: string, highlightId: string) => void | Promise<void>;
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
  feedbackLanguage,
  setFeedback,
  dialogError,
  googleClientId,
  onGoogleCredential,
  onGoogleError,
  translation,
  translationLoading,
  translationError,
  highlightCollection,
  highlightLanguage,
  highlightQuery,
  onHighlightLanguageChange,
  onHighlightQueryChange,
  onHighlightSearch,
  onHighlightPageChange,
  highlightsLoading,
  highlightsError,
  removingHighlightId,
  highlightRemoval,
  onCancelHighlightRemoval,
  onConfirmHighlightRemoval,
  onRemoveHighlight,
}: AppDialogContentProps) {
  if (type === "google-login") {
    return (
      <div>
        <GoogleSignInButton
          clientId={googleClientId}
          onCredential={onGoogleCredential}
          onError={onGoogleError}
        />
        {dialogError ? (
          <p className="dialog-field-error">{dialogError}</p>
        ) : null}
      </div>
    );
  }

  if (type === "score-guide") {
    return (
      <div className="score-guide-dialog">
        <dl className="score-guide-list">
          <div>
            <dt className="badge ok">✓ 100</dt>
            <dd>첫 제출을 권장 시간 내 통과</dd>
          </div>
          <div>
            <dt className="badge warning">✓ 90</dt>
            <dd>첫 제출 시간 초과 통과</dd>
          </div>
          <div>
            <dt className="badge retry">✓ 80</dt>
            <dd>오답 후 재시도 통과</dd>
          </div>
        </dl>
        <p className="score-guide-note">
          문항별 점수 배지를 탭하면 해당 점수의 사유를 확인할 수 있습니다.
        </p>
      </div>
    );
  }

  if (type === "highlights") {
    return (
      <div className="highlight-collection-dialog">
        <form
          className="highlight-collection-controls"
          onSubmit={(event) => {
            event.preventDefault();
            onHighlightSearch();
          }}
        >
          <label className="sr-only" htmlFor="highlight-collection-search">
            제목 또는 하이라이트 검색
          </label>
          <div className="highlight-collection-search">
            <input
              id="highlight-collection-search"
              type="search"
              value={highlightQuery}
              placeholder="제목 또는 문장 검색"
              onChange={(event) => onHighlightQueryChange(event.target.value)}
            />
            <button className="text-button" type="submit" disabled={highlightsLoading}>
              검색
            </button>
          </div>
          <OptionButtons
            value={highlightLanguage}
            options={[
              { value: "all", label: "전체" },
              { value: "ja", label: "일본어" },
              { value: "ko", label: "한국어" },
            ]}
            onChange={(language) =>
              onHighlightLanguageChange(language as "all" | ReadingLanguage)
            }
            ariaLabel="하이라이트 언어 필터"
            disabled={highlightsLoading}
          />
        </form>
        {highlightsLoading ? (
          <p className="highlight-collection-status" role="status">
            하이라이트를 불러오는 중입니다.
          </p>
        ) : null}
        {highlightsError ? (
          <p className="dialog-field-error" role="alert">
            {highlightsError}
          </p>
        ) : null}
        {!highlightsLoading && !highlightsError && highlightCollection.totalItems === 0 ? (
          <p className="highlight-collection-empty">
            저장한 하이라이트가 없습니다. 지문에서 복습할 문장을 선택해 보세요.
          </p>
        ) : null}
        {!highlightsLoading && !highlightsError && highlightCollection.items.map((item) => (
          <details
            className="highlight-collection-group"
            key={item.readingItemId}
          >
            <summary className="highlight-collection-heading">
              <div>
                <h3>{item.title}</h3>
                <p className="highlight-collection-summary">
                  하이라이트 {item.highlights.length}개 · {item.lastSubmittedAt
                    ? `최근 제출 ${formatDate(item.lastSubmittedAt)}`
                    : `최근 저장 ${formatDate(item.lastHighlightedAt)}`}
                </p>
              </div>
              <div className="highlight-collection-meta">
                <span className="badge">{languageLabels[item.language]}</span>
                <span className="badge">{item.officialLevel}</span>
                <span className="badge">{lengthLabels[item.lengthType]}</span>
                <span>{item.topic}</span>
              </div>
            </summary>
            <ul className="highlight-collection-list">
              {item.highlights.map((highlight) => (
                <li key={highlight.id}>
                  <p lang={item.language}>{highlight.selectedText}</p>
                  <button
                    className="icon-button highlight-collection-remove"
                    type="button"
                    aria-label={`${item.title}의 하이라이트 제거`}
                    title="하이라이트 제거"
                    disabled={removingHighlightId === highlight.id}
                    onClick={() =>
                      void onRemoveHighlight(
                        item.readingItemId,
                        highlight.id,
                      )
                    }
                  >
                    <Icon icon={Trash2} />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ))}
        {!highlightsLoading && !highlightsError && highlightCollection.totalItems > 0 ? (
          <div className="highlight-collection-pagination">
            <span>
              {highlightCollection.totalItems}개 문항 중 {highlightCollection.page} / {highlightCollection.totalPages}
            </span>
            {highlightCollection.totalPages > 1 ? (
              <div>
                <button
                  className="text-button"
                  type="button"
                  disabled={highlightCollection.page === 1}
                  onClick={() => onHighlightPageChange(highlightCollection.page - 1)}
                >
                  이전
                </button>
                <button
                  className="text-button"
                  type="button"
                  disabled={highlightCollection.page === highlightCollection.totalPages}
                  onClick={() => onHighlightPageChange(highlightCollection.page + 1)}
                >
                  다음
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {highlightRemoval ? (
          <div
            className="highlight-removal-confirmation"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="highlight-removal-title"
          >
            <div className="highlight-removal-confirmation-card">
              <p className="kicker">Remove highlight</p>
              <h3 id="highlight-removal-title">이 하이라이트를 제거할까요?</h3>
              <p className="highlight-removal-title">{highlightRemoval.title}</p>
              <p className="highlight-removal-text" lang={highlightRemoval.language}>
                {highlightRemoval.selectedText}
              </p>
              <div className="highlight-removal-meta">
                <span className="badge">{highlightRemoval.officialLevel}</span>
                <span className="badge">{lengthLabels[highlightRemoval.lengthType]}</span>
                <span>{highlightRemoval.topic}</span>
              </div>
              <p className="highlight-removal-note">제거한 하이라이트는 복구할 수 없습니다.</p>
              <div className="highlight-removal-actions">
                <button className="text-button" type="button" onClick={onCancelHighlightRemoval}>
                  취소
                </button>
                <button className="primary-button" type="button" onClick={onConfirmHighlightRemoval}>
                  제거하기
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (type === "list-filter") {
    return (
      <div className="dialog-filter-field">
        <div className="dialog-filter-section">
          <span className="form-label">난이도</span>
          <OptionButtons
            value={filterDraft.level}
            options={[
              { value: "all", label: "전체" },
              ...levelsForLanguage(filterDraft.language),
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
          <>
            <div className="dialog-filter-section">
              <span className="form-label">결과</span>
              <OptionButtons
                value={filterDraft.status}
                options={[
                  { value: "all", label: "전체" },
                  { value: "unstarted", label: "미풀이" },
                  { value: "wrong", label: "오답" },
                  { value: "score-100", label: "100점" },
                  { value: "score-90", label: "90점" },
                  { value: "score-80", label: "80점" },
                ]}
                onChange={(status) =>
                  setFilterDraft({
                    ...filterDraft,
                    status: status as ListFilters["status"],
                  })
                }
                ariaLabel="결과 필터"
              />
            </div>
            <div className="dialog-filter-section">
              <span className="form-label">첫 제출 시간</span>
              <OptionButtons
                value={filterDraft.firstSubmissionTime}
                options={[
                  { value: "all", label: "전체" },
                  { value: "on-time", label: "시간 내" },
                  { value: "timed-out", label: "시간 초과" },
                ]}
                onChange={(firstSubmissionTime) =>
                  setFilterDraft({
                    ...filterDraft,
                    firstSubmissionTime: firstSubmissionTime as ListFilters["firstSubmissionTime"],
                  })
                }
                ariaLabel="첫 제출 시간 필터"
              />
            </div>
          </>
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
            <option value="score-desc">점수 높은순</option>
            <option value="score-asc">점수 낮은순</option>
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
              ...levelsForLanguage(adminFilterDraft.language),
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
            {readingTopics.map((topic) => (
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
            <option value="created-desc">등록일 최신순</option>
            <option value="created-asc">등록일 오래된순</option>
            <option value="updated-desc">수정일 최신순</option>
            <option value="updated-asc">수정일 오래된순</option>
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
            options={generationLevelsForLanguage(feedbackLanguage)}
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

  if (type === "translation") {
    const translationSections = translation
      ? [
          { label: "제목", segment: translation.title },
          { label: "지문", segment: translation.passage },
          ...(translation.questions.length
            ? translation.questions.map((segment, index) => ({
                label: `문제 ${index + 1}`,
                segment,
              }))
            : [{ label: "문제", segment: translation.question }]),
        ]
      : [];
    return (
      <div className="translation-dialog">
        {translationLoading ? (
          <p className="translation-status" role="status">
            문항을 번역하는 중입니다.
          </p>
        ) : null}
        {translationError ? (
          <p className="dialog-field-error" role="alert">
            {translationError}
          </p>
        ) : null}
        {translation ? (
          <div className="translation-comparison">
            <section className="translation-pane">
              <h3>{languageLabels[translation.sourceLanguage]} 원문</h3>
              <dl className="translation-sections">
                {translationSections.map(({ label, segment }) => (
                  <div className="translation-section" key={label}>
                    <dt>{label}</dt>
                    <dd lang={translation.sourceLanguage}>{segment.sourceText}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="translation-pane">
              <h3>{languageLabels[translation.targetLanguage]} 번역</h3>
              <dl className="translation-sections">
                {translationSections.map(({ label, segment }) => (
                  <div className="translation-section" key={label}>
                    <dt>{label}</dt>
                    <dd lang={translation.targetLanguage}>
                      {segment.translatedText}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}

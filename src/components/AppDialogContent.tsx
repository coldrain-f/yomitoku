import { OptionButtons } from "./ui/OptionButtons";
import { Trash2 } from "lucide-react";
import { GoogleSignInButton } from "../features/auth/GoogleSignInButton";
import { Icon } from "./ui/Icon";
import { lengthLabels } from "../lib/reading";
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
  HighlightCollectionEntry,
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
  highlights: HighlightCollectionEntry[];
  highlightsLoading: boolean;
  highlightsError: string;
  removingHighlightId: string | null;
  onRemoveHighlight: (readingItemId: string, highlightId: string) => Promise<void>;
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
  highlights,
  highlightsLoading,
  highlightsError,
  removingHighlightId,
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
    const groups = new Map<
      string,
      { item: HighlightCollectionEntry; highlights: HighlightCollectionEntry[] }
    >();
    for (const highlight of highlights) {
      const group = groups.get(highlight.readingItemId);
      if (group) {
        group.highlights.push(highlight);
      } else {
        groups.set(highlight.readingItemId, {
          item: highlight,
          highlights: [highlight],
        });
      }
    }

    return (
      <div className="highlight-collection-dialog">
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
        {!highlightsLoading && !highlightsError && highlights.length === 0 ? (
          <p className="highlight-collection-empty">
            저장한 하이라이트가 없습니다. 지문에서 복습할 문장을 선택해 보세요.
          </p>
        ) : null}
        {[...groups.values()].map(({ item, highlights: itemHighlights }) => (
          <section className="highlight-collection-group" key={item.readingItemId}>
            <div className="highlight-collection-heading">
              <h3>{item.title}</h3>
              <div className="highlight-collection-meta">
                <span className="badge">{languageLabels[item.language]}</span>
                <span className="badge">{item.officialLevel}</span>
                <span className="badge">{lengthLabels[item.lengthType]}</span>
                <span>{item.topic}</span>
              </div>
            </div>
            <ul className="highlight-collection-list">
              {itemHighlights.map((highlight) => (
                <li key={highlight.id}>
                  <p lang={highlight.language}>{highlight.selectedText}</p>
                  <button
                    className="icon-button highlight-collection-remove"
                    type="button"
                    aria-label={`${item.title}의 하이라이트 제거`}
                    title="하이라이트 제거"
                    disabled={removingHighlightId === highlight.id}
                    onClick={() =>
                      void onRemoveHighlight(
                        highlight.readingItemId,
                        highlight.id,
                      )
                    }
                  >
                    <Icon icon={Trash2} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
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

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock3,
  Pencil,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Icon } from "../../components/ui/Icon";
import { ListPagination } from "../../components/ui/ListPagination";
import { LoadingBar } from "../../components/ui/LoadingBar";
import { OptionButtons } from "../../components/ui/OptionButtons";
import type { GenerationModelOptions } from "../../lib/api";
import {
  difficultyRank,
  formatDate,
  lengthLabels,
  minimumVotes,
  pageSize,
  perceivedLabel,
  statusClass,
  statusLabel,
} from "../../lib/reading";
import {
  defaultGenerationLevelByLanguage,
  languageLabels,
  levelsForLanguage,
  readingLanguages,
  readingTopics,
  recommendedTopic,
} from "../../lib/readingPolicy";
import type {
  AdminFilters,
  DifficultyLevel,
  GenerationValues,
  LengthType,
  ReadingItem,
  ReadingLanguage,
  StateSetter,
  Topic,
} from "../../types";

interface AdminScreenProps {
  items: ReadingItem[];
  loading: boolean;
  filters: AdminFilters;
  onLanguageChange: (language: ReadingLanguage) => void;
  onFilters: () => void;
  onEdit: (item: ReadingItem) => void;
  onGenerate: () => void;
}

interface AdminEditProps {
  item: ReadingItem;
  draft: ReadingItem;
  setDraft: StateSetter<ReadingItem | null>;
  onSave: () => void;
  onHold: () => void;
  onPublish: () => void;
  onDelete: () => void;
  onBack: () => void;
}

interface GenerateScreenProps {
  values: GenerationValues;
  setValues: StateSetter<GenerationValues>;
  modelOptions: GenerationModelOptions | null;
  modelError: string;
  isCreating: boolean;
  progressLabel: string;
  error: string;
  onCreate: () => void;
  onBack: () => void;
}

interface PreviewScreenProps {
  item: ReadingItem;
  onHold: () => void;
  onPublish: () => void;
  onDelete: () => void;
  onBack: () => void;
}

export function AdminScreen({
  items,
  loading,
  filters,
  onLanguageChange,
  onFilters,
  onEdit,
  onGenerate,
}: AdminScreenProps) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const rows = useMemo(
    () =>
      items
        .filter(
          (item) =>
            (filters.level === "all" || filters.level === item.officialLevel) &&
            filters.language === item.language &&
            (filters.length === "all" || filters.length === item.lengthType) &&
            (filters.topic === "all" || filters.topic === item.topic) &&
            (filters.status === "all" || filters.status === item.status) &&
            item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        )
        .sort((left, right) => {
          if (filters.sort === "created-desc") {
            return (
              new Date(right.createdAt).getTime() -
              new Date(left.createdAt).getTime()
            );
          }
          if (filters.sort === "created-asc") {
            return (
              new Date(left.createdAt).getTime() -
              new Date(right.createdAt).getTime()
            );
          }
          if (filters.sort === "updated-asc") {
            return (
              new Date(left.updatedAt).getTime() -
              new Date(right.updatedAt).getTime()
            );
          }
          if (filters.sort === "title-asc") {
            return left.title.localeCompare(right.title, "ja");
          }
          if (filters.sort === "level-asc") {
            return (
              difficultyRank[left.officialLevel] -
              difficultyRank[right.officialLevel]
            );
          }
          if (filters.sort === "level-desc") {
            return (
              difficultyRank[right.officialLevel] -
              difficultyRank[left.officialLevel]
            );
          }
          if (filters.sort === "perceived-asc") {
            return (
              difficultyRank[left.perceivedLevel] -
              difficultyRank[right.perceivedLevel]
            );
          }
          if (filters.sort === "perceived-desc") {
            return (
              difficultyRank[right.perceivedLevel] -
              difficultyRank[left.perceivedLevel]
            );
          }
          if (filters.sort === "status-asc") {
            return (
              ["review", "held", "published"].indexOf(left.status) -
              ["review", "held", "published"].indexOf(right.status)
            );
          }
          return (
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime()
          );
        }),
    [filters, items, query],
  );
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pages);
  const pageRows = rows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const hasAppliedFilters =
    filters.level !== "all" ||
    filters.length !== "all" ||
    filters.topic !== "all" ||
    filters.status !== "all" ||
    filters.sort !== "created-desc";

  useEffect(() => setPage(1), [filters, query]);

  return (
    <section className="screen screen-admin" aria-label="관리자 문항 관리">
      <div className="paper flush">
        <div className="paper-head admin-paper-head">
          <div>
            <p className="kicker">Administrator</p>
            <h1 className="screen-title">문항 관리</h1>
          </div>
          <div className="admin-head-actions">
            <span className="badge dark">관리자</span>
          </div>
        </div>
        <div className="admin-toolbar">
          <div className="filter-search">
            <Icon icon={Search} />
            <input
              className="title-search"
              type="search"
              placeholder="제목으로 찾기"
              aria-label="관리 문항 제목 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="list-language-switch">
            <OptionButtons
              value={filters.language}
              options={readingLanguages.map((language) => ({
                value: language,
                label: languageLabels[language],
              }))}
              onChange={(language) =>
                onLanguageChange(language as ReadingLanguage)
              }
              ariaLabel="관리 문항 언어"
            />
          </div>
          <button
            className={`icon-button list-filter-button${hasAppliedFilters ? " is-active" : ""}`}
            type="button"
            aria-label="필터 및 정렬"
            aria-pressed={hasAppliedFilters}
            title="필터 및 정렬"
            onClick={onFilters}
          >
            <Icon icon={SlidersHorizontal} />
          </button>
        </div>
        {loading ? <LoadingBar label="관리 문항을 불러오는 중입니다." /> : null}
        <div className="admin-list" aria-busy={loading}>
          {pageRows.map((item) => (
            <button
              className="admin-row"
              type="button"
              key={item.id}
              onClick={() => onEdit(item)}
            >
              <span>
                <span className="admin-row-title">{item.title}</span>
                <span className="row-meta">
                  <span className="badge row-level">{item.officialLevel}</span>
                  <span className="badge row-perceived">
                    {perceivedLabel(item)} · {item.perceivedVotes}명
                  </span>
                  <span className="badge">{lengthLabels[item.lengthType]}</span>
                  <span className="row-topic">{item.topic}</span>
                </span>
              </span>
              <span className="admin-row-state">
                <span className={statusClass(item.status)}>
                  {statusLabel(item.status)}
                </span>
                <time className="row-date">등록 {formatDate(item.createdAt)}</time>
                <time className="row-date">수정 {formatDate(item.updatedAt)}</time>
              </span>
              <Icon icon={Pencil} />
            </button>
          ))}
        </div>
        {!loading && rows.length === 0 ? (
          <div className="reading-list-empty">
            <p>조건에 맞는 문항이 없습니다.</p>
          </div>
        ) : (
          <ListPagination
            page={currentPage}
            totalPages={pages}
            onChange={setPage}
            ariaLabel="관리 문항 목록 페이지"
          />
        )}
        <div className="home-actions">
          <button className="primary-button" type="button" onClick={onGenerate}>
            <Icon icon={Plus} />새 독해 지문 생성
          </button>
        </div>
      </div>
    </section>
  );
}

export function AdminEdit({
  item,
  draft,
  setDraft,
  onSave,
  onHold,
  onPublish,
  onDelete,
  onBack,
}: AdminEditProps) {

  const updateChoice = (index: number, text: string) =>
    setDraft({
      ...draft,
      choices: draft.choices.map((choice, choiceIndex) =>
        choiceIndex === index ? { ...choice, text } : choice,
      ),
    });

  return (
    <section className="screen screen-admin-edit" aria-label="관리자 문항 편집">
      <div className="paper">
        <div className="admin-edit-heading">
          <div>
            <p className="kicker">Content management</p>
            <h1 className="screen-title">문항 편집</h1>
          </div>
          <span className={statusClass(item.status)}>
            {statusLabel(item.status)}
          </span>
        </div>
        <div className="admin-edit-form">
          <label className="admin-field admin-field-wide">
            <span className="form-label">제목</span>
            <input
              className="input-field"
              type="text"
              value={draft.title}
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
            />
          </label>
          <div className="admin-metadata-grid">
            <label className="admin-field">
              <span className="form-label">콘텐츠 언어</span>
              <select
                className="select-field"
                value={draft.language}
                onChange={(event) => {
                  const language = event.target.value as ReadingLanguage;
                  setDraft({
                    ...draft,
                    language,
                    officialLevel: levelsForLanguage(language).includes(draft.officialLevel)
                      ? draft.officialLevel
                      : defaultGenerationLevelByLanguage[language],
                  });
                }}
              >
                {readingLanguages.map((language) => (
                  <option key={language} value={language}>
                    {languageLabels[language]}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span className="form-label">난이도</span>
              <select
                className="select-field"
                value={draft.officialLevel}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    officialLevel: event.target.value as DifficultyLevel,
                  })
                }
              >
                {levelsForLanguage(draft.language).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <div className="admin-field admin-summary-field">
              <span className="form-label">체감 난이도</span>
              <div className="admin-summary-value">
                <strong>{perceivedLabel(item)}</strong>
                <span>
                  응답 {item.perceivedVotes}명 ·{" "}
                  {item.perceivedVotes >= minimumVotes ? "공개" : "비공개"}
                </span>
              </div>
            </div>
            <label className="admin-field">
              <span className="form-label">유형</span>
              <select
                className="select-field"
                value={draft.lengthType}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    lengthType: event.target.value as LengthType,
                  })
                }
              >
                {Object.entries(lengthLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span className="form-label">주제</span>
              <select
                className="select-field"
                value={draft.topic}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    topic: event.target.value as Topic,
                  })
                }
              >
                {readingTopics.map((topic) => (
                  <option key={topic}>{topic}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="admin-field admin-field-wide">
            <span className="form-label">지문</span>
            <textarea
              className="admin-textarea"
              value={draft.passage}
              onChange={(event) =>
                setDraft({ ...draft, passage: event.target.value })
              }
            />
          </label>
          <label className="admin-field admin-field-wide">
            <span className="form-label">문제</span>
            <textarea
              className="admin-textarea admin-question-textarea"
              value={draft.question}
              onChange={(event) =>
                setDraft({ ...draft, question: event.target.value })
              }
            />
          </label>
          <section className="admin-options-section">
            <div className="admin-options-heading">
              <span className="form-label">선택지</span>
              <label className="admin-answer-select">
                정답{" "}
                <select
                  className="select-field"
                  value={draft.choices.findIndex((choice) => choice.isCorrect)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      choices: draft.choices.map((choice, index) => ({
                        ...choice,
                        isCorrect: index === Number(event.target.value),
                      })),
                    })
                  }
                >
                  {draft.choices.map((choice, index) => (
                    <option value={index} key={choice.id}>
                      {String(index + 1).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="admin-options-list">
              {draft.choices.map((choice, index) => (
                <label className="admin-option" key={choice.id}>
                  <span className="answer-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <input
                    className="input-field"
                    type="text"
                    value={choice.text}
                    onChange={(event) => updateChoice(index, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </section>
          <label className="admin-field admin-field-wide">
            <span className="form-label">해설</span>
            <textarea
              className="admin-textarea admin-explanation-textarea"
              value={draft.explanation}
              onChange={(event) =>
                setDraft({ ...draft, explanation: event.target.value })
              }
            />
          </label>
          <section className="admin-insights">
            <div className="admin-section-heading">
              <h2 className="admin-section-title">문항 반응</h2>
              <span className="admin-section-note">
                평가 {item.perceivedVotes}명
              </span>
            </div>
            <dl className="admin-insight-list">
              <div>
                <dt>문항 평가</dt>
                <dd>{item.quality ? `${item.quality} / 5` : "평가 없음"}</dd>
              </div>
              <div>
                <dt>체감 난이도</dt>
                <dd>
                  {item.perceivedVotes >= minimumVotes
                    ? `${item.perceivedLevel} · ${item.perceivedVotes}명`
                    : `집계 중 · ${item.perceivedVotes}명`}
                </dd>
              </div>
              <div>
                <dt>오류 제보</dt>
                <dd>{item.reportCount}건</dd>
              </div>
            </dl>
            <div className="admin-latest-report">
              <span className="form-label">최근 오류 제보</span>
              <p>{item.latestReport}</p>
              <time className="row-date">{formatDate(item.updatedAt)}</time>
            </div>
          </section>
          <section className="admin-validation">
            <div className="admin-section-heading">
              <h2 className="admin-section-title">생성 검증</h2>
              <span
                className={
                  item.validation.status === "passed" ? "badge ok" : "badge danger"
                }
              >
                {item.validation.status === "passed" ? "검증 통과" : "검증 확인"}
              </span>
            </div>
            <dl className="admin-validation-list">
              <div>
                <dt>정답 검증</dt>
                <dd>{item.validation.answer}</dd>
              </div>
              <div>
                <dt>오답 설계</dt>
                <dd>{item.validation.distractor}</dd>
              </div>
              <div>
                <dt>해설 논리</dt>
                <dd>{item.validation.explanation}</dd>
              </div>
            </dl>
          </section>
        </div>
        <div className="footer-actions admin-edit-actions">
          <div className="admin-edit-secondary">
            <button
              className="link-button"
              type="button"
              onClick={() => onBack()}
            >
              관리 목록으로
            </button>
            <button
              className="link-button preview-delete"
              type="button"
              onClick={onDelete}
            >
              <Icon icon={Trash2} />
              삭제
            </button>
          </div>
          <div className="admin-edit-main">
            <button className="text-button" type="button" onClick={onHold}>
              <Icon icon={Clock3} />
              {item.status === "held"
                ? "보류 취소"
                : item.status === "published"
                  ? "보류로 전환"
                  : "보류"}
            </button>
            {item.status !== "published" ? (
              <button className="text-button" type="button" onClick={onPublish}>
                <Icon icon={Upload} />
                게시하기
              </button>
            ) : null}
            <button className="primary-button" type="button" onClick={onSave}>
              <Icon icon={Save} />
              저장하기
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function GenerateScreen({
  values,
  setValues,
  modelOptions,
  modelError,
  isCreating,
  progressLabel,
  error,
  onCreate,
  onBack,
}: GenerateScreenProps) {
  return (
    <section
      className="screen screen-generate"
      aria-label="지문 생성"
      aria-busy={isCreating}
    >
      <div className="paper">
        <p className="kicker">Generate</p>
        <h1 className="screen-title">새 독해 지문 생성</h1>
        <div className="form-grid generation-form-grid">
          <div className="form-section">
            <span className="form-label">콘텐츠 언어</span>
            <OptionButtons
              value={values.language}
              options={readingLanguages.map((language) => ({
                value: language,
                label: languageLabels[language],
              }))}
              onChange={(value) => {
                const language = value as ReadingLanguage;
                setValues({
                  ...values,
                  language,
                  level: defaultGenerationLevelByLanguage[language],
                });
              }}
              ariaLabel="콘텐츠 언어"
              disabled={isCreating}
            />
          </div>
          <div className="form-section">
            <span className="form-label">난이도</span>
            <OptionButtons
              value={values.level}
              options={levelsForLanguage(values.language)}
              onChange={(level) =>
                setValues({
                  ...values,
                  level: level as DifficultyLevel,
                })
              }
              ariaLabel="난이도"
              disabled={isCreating}
            />
          </div>
          <div className="form-section">
            <span className="form-label">유형</span>
            <OptionButtons
              value={values.length}
              options={Object.entries(lengthLabels).map(([value, label]) => ({
                value,
                label,
              }))}
              onChange={(length) =>
                setValues({
                  ...values,
                  length: length as LengthType,
                })
              }
              ariaLabel="유형"
              disabled={isCreating}
            />
          </div>
          <div className="form-section">
            <div className="generate-topic-field">
              <span className="form-label">주제</span>
              <select
                className="select-field"
                value={values.topic}
                disabled={isCreating}
                onChange={(event) =>
                  setValues({
                    ...values,
                    topic: event.target.value as GenerationValues["topic"],
                  })
                }
              >
                <option value={recommendedTopic}>추천 (랜덤)</option>
                {readingTopics.map((topic) => (
                  <option key={topic}>{topic}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-section">
            <span className="form-label">문제 생성 AI</span>
            <select
              className="select-field"
              value={values.generatorModel}
              disabled={isCreating || !modelOptions}
              onChange={(event) =>
                setValues({
                  ...values,
                  generatorModel: event.target.value,
                })
              }
            >
              {modelOptions ? (
                modelOptions.models.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))
              ) : (
                <option value="">{modelError || "모델 목록을 불러오는 중입니다."}</option>
              )}
            </select>
          </div>
          <div className="form-section">
            <span className="form-label">검증 AI</span>
            <select
              className="select-field"
              value={values.validatorModel}
              disabled={isCreating || !modelOptions}
              onChange={(event) =>
                setValues({
                  ...values,
                  validatorModel: event.target.value,
                })
              }
            >
              {modelOptions ? (
                modelOptions.models.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))
              ) : (
                <option value="">{modelError || "모델 목록을 불러오는 중입니다."}</option>
              )}
            </select>
          </div>
        </div>
        {values.language === "ja" ? (
          <div className="furigana-row">
            <span className="form-label">후리가나</span>
            <OptionButtons
              value="off"
              options={[
                { value: "off", label: "미표기" },
                { value: "on", label: "표기", disabled: true },
              ]}
              onChange={() => {}}
              ariaLabel="후리가나"
              disabled={isCreating}
            />
          </div>
        ) : null}
        {isCreating ? (
          <LoadingBar className="generation-progress" label={progressLabel} />
        ) : null}
        {error ? <p className="generation-error" role="alert">{error}</p> : null}
        <div className="footer-actions">
          <button className="link-button" type="button" onClick={onBack} disabled={isCreating}>
            관리 목록으로
          </button>
          <button className="primary-button" type="button" onClick={onCreate} disabled={isCreating || !modelOptions || !values.generatorModel || !values.validatorModel}>
            <Icon icon={Sparkles} />
            {isCreating ? "지문 생성 중" : "지문 만들기"}
          </button>
        </div>
      </div>
    </section>
  );
}

export function PreviewScreen({
  item,
  onHold,
  onPublish,
  onDelete,
  onBack,
}: PreviewScreenProps) {
  const held = item.status === "held";

  return (
    <section className="screen screen-preview" aria-label="생성된 문항 검토">
      <article className="paper flush">
        <div className="paper-head">
          <div>
            <p className="kicker">Generated draft</p>
            <h1 className="title-jp">{item.title}</h1>
            <div className="preview-context">
              <span className={statusClass(item.status)}>
                {statusLabel(item.status)}
              </span>
              <span>
                {languageLabels[item.language]} · {item.officialLevel} · {lengthLabels[item.lengthType]} ·{" "}
                {item.topic}
              </span>
            </div>
          </div>
        </div>
        <div className="reading-body">
          <div className="passage">
            {item.passage.split("\n\n").map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="question-block">
            <h3>{item.question}</h3>
            <div className="preview-answer-list">
              {item.choices.map((choice, index) => (
                <div
                  className={`preview-choice${choice.isCorrect ? " is-answer" : ""}`}
                  key={choice.id}
                >
                  <span className="answer-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{choice.text}</span>
                  {choice.isCorrect ? (
                    <span className="preview-answer-key">
                      <Icon icon={Check} />
                      정답
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="answer-explanation preview-explanation">
              <strong>
                {String(
                  item.choices.findIndex((choice) => choice.isCorrect) + 1,
                ).padStart(2, "0")}
                이 정답인 이유
              </strong>
              <span>{item.explanation}</span>
            </div>
          </div>
          <div className="footer-actions preview-actions">
            <div className="preview-actions-secondary">
              {held ? (
                <button className="link-button" type="button" onClick={onBack}>
                  관리 목록으로
                </button>
              ) : null}
              <button
                className="link-button preview-delete"
                type="button"
                onClick={onDelete}
              >
                <Icon icon={Trash2} />
                삭제
              </button>
            </div>
            <div className="preview-actions-main">
              <button
                className={`text-button${held ? " is-selected" : ""}`}
                type="button"
                aria-pressed={held}
                onClick={onHold}
              >
                <Icon icon={Clock3} />
                {held ? "보류 취소" : "보류"}
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={held}
                onClick={onPublish}
              >
                <Icon icon={Upload} />
                게시하기
              </button>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}

import { Plus, Sparkles, X } from "lucide-react";
import { Icon } from "../../components/ui/Icon";
import { LoadingBar } from "../../components/ui/LoadingBar";
import { OptionButtons } from "../../components/ui/OptionButtons";
import { useI18n } from "../../lib/i18n";
import type { GenerationModelOptions } from "../../lib/api";
import {
  defaultGenerationLevelByLanguage,
  generationLevelsForLanguage,
  readingLanguages,
  readingTopics,
  recommendedTopic,
} from "../../lib/readingPolicy";
import type {
  DifficultyLevel,
  GenerationValues,
  LengthType,
  ReadingLanguage,
  StateSetter,
} from "../../types";

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
  const { t, languageLabel, levelLabel, lengthLabel, topicLabel } = useI18n();
  const keywordInputs = values.keywords.length > 0 ? values.keywords : [""];
  const updateKeyword = (index: number, value: string) => {
    const keywords = [...keywordInputs];
    keywords[index] = value;
    setValues({ ...values, keywords });
  };
  const removeKeyword = (index: number) => {
    setValues({
      ...values,
      keywords: keywordInputs.filter((_, keywordIndex) => keywordIndex !== index),
    });
  };
  const addKeyword = () => {
    if (keywordInputs.length >= 5) return;
    setValues({ ...values, keywords: [...keywordInputs, ""] });
  };

  return (
    <section
      className="screen screen-generate"
      aria-label={t("admin.generateAria")}
      aria-busy={isCreating}
    >
      <div className="paper">
        <p className="kicker">{t("admin.kicker")}</p>
        <h1 className="screen-title">{t("admin.generate")}</h1>
        <div className="form-grid generation-form-grid">
          <div className="form-section">
            <span className="form-label">{t("admin.contentLanguage")}</span>
            <OptionButtons
              value={values.language}
              options={readingLanguages.map((language) => ({
                value: language,
                label: languageLabel(language),
              }))}
              onChange={(value) => {
                const language = value as ReadingLanguage;
                setValues({
                  ...values,
                  language,
                  level: defaultGenerationLevelByLanguage[language],
                });
              }}
              ariaLabel={t("admin.contentLanguage")}
              disabled={isCreating}
            />
          </div>
          <div className="form-section">
            <span className="form-label">{t("admin.level")}</span>
            <OptionButtons
              value={values.level}
              options={generationLevelsForLanguage(values.language).map((value) => ({
                value,
                label: levelLabel(value),
              }))}
              onChange={(level) =>
                setValues({
                  ...values,
                  level: level as DifficultyLevel,
                })
              }
              ariaLabel={t("admin.level")}
              disabled={isCreating}
            />
          </div>
          <div className="form-section">
            <span className="form-label">{t("admin.length")}</span>
            <OptionButtons
              value={values.length}
              options={(["short", "medium", "long"] as const).map((value) => ({
                value,
                label: lengthLabel(value),
              }))}
              onChange={(length) =>
                setValues({
                  ...values,
                  length: length as LengthType,
                })
              }
              ariaLabel={t("admin.length")}
              disabled={isCreating}
            />
          </div>
          <div className="form-section">
            <div className="generate-topic-field">
              <span className="form-label">{t("admin.topic")}</span>
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
                <option value={recommendedTopic}>{t("admin.recommendedRandom")}</option>
                {readingTopics.map((topic) => (
                  <option key={topic}>{topicLabel(topic)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-section">
            <span className="form-label">{t("admin.generatorAi")}</span>
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
                <option value="">{modelError || t("admin.modelsLoading")}</option>
              )}
            </select>
          </div>
          <div className="form-section">
            <span className="form-label">{t("admin.validatorAi")}</span>
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
                <option value="">{modelError || t("admin.modelsLoading")}</option>
              )}
            </select>
          </div>
          <div className="form-section generation-keywords-section">
            <span className="form-label">{t("admin.keywords")}</span>
            <div className="generation-keyword-list">
              {keywordInputs.map((keyword, index) => (
                <div className="generation-keyword-input" key={`keyword-${index}`}>
                  <input
                    className="input-field"
                    type="text"
                    value={keyword}
                    placeholder={t("admin.keyword", { number: index + 1 })}
                    aria-label={t("admin.keyword", { number: index + 1 })}
                    maxLength={40}
                    disabled={isCreating}
                    onChange={(event) => updateKeyword(index, event.target.value)}
                  />
                  {keywordInputs.length > 1 ? (
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={t("admin.deleteKeywordItem", { number: index + 1 })}
                      title={t("admin.deleteKeyword")}
                      disabled={isCreating}
                      onClick={() => removeKeyword(index)}
                    >
                      <Icon icon={X} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <button
              className="link-button generation-keyword-add"
              type="button"
              disabled={isCreating || keywordInputs.length >= 5}
              onClick={addKeyword}
            >
              <Icon icon={Plus} />
              {t("admin.addKeyword")}
            </button>
          </div>
        </div>
        {values.language === "ja" ? (
          <div className="furigana-row">
            <span className="form-label">{t("admin.furigana")}</span>
            <OptionButtons
              value="off"
              options={[
                { value: "off", label: t("admin.furiganaOff") },
                { value: "on", label: t("admin.furiganaOn"), disabled: true },
              ]}
              onChange={() => {}}
              ariaLabel={t("admin.furigana")}
              disabled={isCreating}
            />
          </div>
        ) : null}
        {isCreating ? (
          <LoadingBar className="generation-progress" label={progressLabel} />
        ) : null}
        {error ? <p className="generation-error" role="alert">{error}</p> : null}
        <div className="footer-actions">
          <button className="link-button" type="button" onClick={onBack}>
            {t("admin.backToManagement")}
          </button>
          <button className="primary-button" type="button" onClick={onCreate} disabled={isCreating || !modelOptions || !values.generatorModel || !values.validatorModel}>
            <Icon icon={Sparkles} />
            {isCreating ? t("admin.generating") : t("admin.create")}
          </button>
        </div>
      </div>
    </section>
  );
}


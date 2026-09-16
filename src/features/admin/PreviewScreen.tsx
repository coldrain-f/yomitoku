import { Check, Clock3, Trash2, Upload } from "lucide-react";
import { Icon } from "../../components/ui/Icon";
import { useI18n } from "../../lib/i18n";
import { statusClass } from "../../lib/reading";
import type { ReadingItem } from "../../types";
import { itemStatusLabel } from "./adminPresentation";
import { ValidationRecords } from "./ValidationRecords";

interface PreviewScreenProps {
  item: ReadingItem;
  onHold: () => void;
  onPublish: () => void;
  onDelete: () => void;
  onBack: () => void;
}

export function PreviewScreen({
  item,
  onHold,
  onPublish,
  onDelete,
  onBack,
}: PreviewScreenProps) {
  const { t, languageLabel, levelLabel, lengthLabel, topicLabel } = useI18n();
  const held = item.status === "held";

  return (
    <section
      className="screen screen-preview"
      aria-label={t("admin.previewAria")}
      data-reading-language={item.language}
    >
      <article className="paper flush">
        <div className="paper-head">
          <div>
            <p className="kicker">{t("admin.generatedDraft")}</p>
            <h1 className="title-jp" lang={item.language}>{item.title}</h1>
            <div className="preview-context">
              <span className={statusClass(item.status)}>
                {itemStatusLabel(item.status, t)}
              </span>
              <span>
                {languageLabel(item.language)} · {levelLabel(item.officialLevel)} · {lengthLabel(item.lengthType)} ·{" "}
                {topicLabel(item.topic)}
              </span>
            </div>
          </div>
        </div>
        <div className="reading-body">
          <div className="passage">
            {item.passage.split(/\r?\n\s*\r?\n/).map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
            ))}
          </div>
          {item.questions.map((question, questionIndex) => (
            <div className="question-block" key={question.id}>
              {item.questions.length > 1 ? <p className="question-number">{t("admin.questionNumber", { number: questionIndex + 1 })}</p> : null}
              <h3>{question.question}</h3>
              <div className="preview-answer-list">
                {question.choices.map((choice, index) => (
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
                        {t("admin.correct")}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="answer-explanation preview-explanation">
                <strong>
                  {t("admin.correctReason", {
                    number: String(question.choices.findIndex((choice) => choice.isCorrect) + 1).padStart(2, "0"),
                  })}
                </strong>
                <span>{question.explanation}</span>
              </div>
            </div>
          ))}
          {held ? <ValidationRecords validations={item.validations} held /> : null}
          <div className="footer-actions preview-actions">
            <div className="preview-actions-secondary">
              {held ? (
                <button className="link-button" type="button" onClick={onBack}>
                  {t("admin.backToManagement")}
                </button>
              ) : null}
              <button
                className="link-button preview-delete"
                type="button"
                onClick={onDelete}
              >
                <Icon icon={Trash2} />
                {t("admin.delete")}
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
                {held ? t("admin.cancelHold") : t("admin.hold")}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={onPublish}
              >
                <Icon icon={Upload} />
                {t("admin.publish")}
              </button>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}


export function readingQuestionId(index: number) {
  return `reading-question-${index + 1}`;
}

export function focusReadingSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.focus({ preventScroll: true });
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView?.({ behavior: reduceMotion ? "instant" : "smooth", block: "start" });
}

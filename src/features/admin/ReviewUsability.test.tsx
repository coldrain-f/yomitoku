import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "../../lib/i18n";
import { readingItem } from "../../test/fixtures";
import { PreviewScreen } from "./PreviewScreen";
import { GenerateScreen } from "./GenerateScreen";
import { readingTopics } from "../../lib/readingPolicy";

it("shows validation records on review drafts and provides an edit action", () => {
  localStorage.setItem("yomitoku.ui-locale", "ko");
  const edit = vi.fn();
  render(<LocaleProvider><PreviewScreen item={readingItem} onEdit={edit} onHold={vi.fn()} onPublish={vi.fn()} onDelete={vi.fn()} onBack={vi.fn()} /></LocaleProvider>);
  expect(document.querySelector(".admin-validation")).not.toBe(null);
  fireEvent.click(screen.getByRole("button", {name:"문항 편집"}));
  expect(edit).toHaveBeenCalledOnce();
});

it("keeps canonical topic values when the generation UI is Japanese", () => {
  localStorage.setItem("yomitoku.ui-locale", "ja");
  const setValues = vi.fn();
  render(<LocaleProvider><GenerateScreen values={{language:"ja",level:"N3",length:"short",topic:readingTopics[0],keywords:[],generatorModel:"test",validatorModel:"test"}} setValues={setValues} modelOptions={null} modelError="" isCreating={false} progressLabel="" error="" onCreate={vi.fn()} onBack={vi.fn()} /></LocaleProvider>);
  const topic = document.getElementById("generation-topic")!;
  fireEvent.change(topic, {target:{value:readingTopics[1]}});
  expect(setValues).toHaveBeenCalledWith(expect.objectContaining({topic:readingTopics[1]}));
  expect(document.querySelector(".generation-model-settings")?.hasAttribute("open")).toBe(false);
});

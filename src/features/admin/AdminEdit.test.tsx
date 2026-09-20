import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../lib/i18n";
import { readingItem } from "../../test/fixtures";
import { AdminEdit } from "./AdminEdit";

describe("AdminEdit", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("offers readable recommended-time choices instead of a raw seconds input", () => {
    window.localStorage.setItem("yomitoku.ui-locale", "ko");
    const setDraft = vi.fn();

    render(
      <LocaleProvider>
        <AdminEdit
          item={readingItem}
          draft={readingItem}
          setDraft={setDraft}
          onSave={vi.fn()}
          onHold={vi.fn()}
          onPublish={vi.fn()}
          onDelete={vi.fn()}
          onBack={vi.fn()}
          manual
        />
      </LocaleProvider>,
    );

    const timeSelect = screen.getByLabelText("권장 시간");
    expect(screen.getByRole("option", { name: "1분 30초" })).toBeTruthy();

    fireEvent.change(timeSelect, { target: { value: "120" } });
    expect(setDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ recommendedSeconds: 120 }),
    );
  });
});

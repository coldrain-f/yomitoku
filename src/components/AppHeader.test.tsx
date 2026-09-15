import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AppHeader } from "./AppHeader";
import { LocaleProvider } from "../lib/i18n";

it("connects review actions and closes the menu after selection", () => {
  localStorage.setItem("yomitoku.ui-locale", "ko");
  const bookmarks = vi.fn();
  const highlights = vi.fn();
  const {container} = render(<LocaleProvider><AppHeader authenticated role="admin" totalGenerated={59} completeCount={34} progressLanguage="ja" onHome={vi.fn()} onOpenAdmin={vi.fn()} onOpenStats={vi.fn()} onOpenBookmarks={bookmarks} onOpenHighlights={highlights} onLogout={vi.fn()}/></LocaleProvider>);
  const menu = container.querySelector('.learning-nav details') as HTMLDetailsElement;
  menu.open = true;
  fireEvent.click(screen.getByRole('button', {name:'북마크'}));
  expect(bookmarks).toHaveBeenCalledOnce();
  expect(menu.open).toBe(false);
  menu.open = true;
  fireEvent.click(screen.getByRole('button', {name:'내 하이라이트'}));
  expect(highlights).toHaveBeenCalledOnce();
  expect(menu.open).toBe(false);
});

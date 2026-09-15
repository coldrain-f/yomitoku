import { useRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { useModalFocus } from "./useModalFocus";

function Fixture() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref, open, () => setOpen(false));
  return <><button onClick={() => setOpen(true)}>Open</button>{open ? <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1}><button>First</button><button>Last</button></div> : null}</>;
}

it("traps Tab, dismisses on Escape, and restores the opener's focus", () => {
  render(<Fixture />);
  const opener = screen.getByText("Open");
  opener.focus();
  fireEvent.click(opener);
  const first = screen.getByText("First");
  const last = screen.getByText("Last");
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, {key: "Tab", shiftKey:true});
  expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last, {key: "Tab"});
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, {key: "Escape"});
  expect(screen.queryByRole("dialog")).toBe(null);
  expect(document.activeElement).toBe(opener);
});

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../lib/i18n";
import { WelcomeScreen } from "./WelcomeScreen";

describe("WelcomeScreen", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("introduces the learning flow and leads users to login", () => {
    window.localStorage.setItem("yomitoku.ui-locale", "ko");
    const onLogin = vi.fn();

    render(
      <LocaleProvider>
        <WelcomeScreen onLogin={onLogin} />
      </LocaleProvider>,
    );

    expect(
      screen.getByRole("heading", {
        name: "독해를 풀고, 기록으로 실력을 쌓으세요",
      }),
    ).toBeTruthy();
    expect(screen.getByText("내게 맞는 독해 선택")).toBeTruthy();
    expect(screen.getByText("하이라이트 모아보기")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "학습 시작하기" }));

    expect(onLogin).toHaveBeenCalledOnce();
  });
});

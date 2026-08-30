import { BarChart3, LogIn, LogOut } from "lucide-react";
import { Icon } from "./ui/Icon.jsx";

export function AppHeader({
  authenticated,
  role,
  totalGenerated,
  completeCount,
  onHome,
  onOpenAdmin,
  onOpenStats,
  onLogin,
  onLogout,
}) {
  return (
    <header className="topbar">
      <button
        className="wordmark"
        type="button"
        aria-label="YOMITOKU, 読み解く"
        onClick={onHome}
      >
        <span lang="ja">読み解く</span>
      </button>
      <div className="header-actions">
        {authenticated && role === "admin" ? (
          <button
            className="link-button header-admin-link"
            type="button"
            onClick={onOpenAdmin}
          >
            관리자 화면
          </button>
        ) : null}
        {authenticated ? (
          <button
            className="header-progress"
            type="button"
            aria-label={`학습 통계: 생성된 전체 문제 ${totalGenerated}개 중 ${completeCount}개 풀이 완료`}
            title="학습 통계"
            onClick={onOpenStats}
          >
            <Icon icon={BarChart3} />
            <span>
              {completeCount} / {totalGenerated}
            </span>
          </button>
        ) : null}
        {authenticated ? (
          <button
            className="link-button header-logout-link"
            type="button"
            aria-label="로그아웃"
            title="로그아웃"
            onClick={onLogout}
          >
            <Icon icon={LogOut} />
          </button>
        ) : (
          <button
            className="link-button header-login-link"
            type="button"
            onClick={onLogin}
          >
            <Icon icon={LogIn} />
            로그인
          </button>
        )}
      </div>
    </header>
  );
}

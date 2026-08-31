interface LoadingBarProps {
  label: string;
  className?: string;
}

export function LoadingBar({ label, className = "" }: LoadingBarProps) {
  return (
    <div className={`loading-bar ${className}`.trim()} role="status" aria-live="polite">
      <span className="loading-bar-track" aria-hidden="true">
        <span />
      </span>
      <span className="loading-bar-label">{label}</span>
    </div>
  );
}

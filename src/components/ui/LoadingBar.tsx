interface LoadingBarProps {
  label: string;
  className?: string;
}

export function LoadingBar({ label, className = "" }: LoadingBarProps) {
  return (
    <div className={`loading-bar ${className}`.trim()} role="status" aria-live="polite">
      <span className="loading-bar-content">
        <span className="loading-spinner" aria-hidden="true" />
        <span className="loading-bar-label">{label}</span>
      </span>
      <span className="loading-bar-track" aria-hidden="true"><span /></span>
    </div>
  );
}

export function LoadingOverlay({ label }: Pick<LoadingBarProps, "label">) {
  return (
    <div className="loading-overlay" role="status" aria-label={label} aria-live="polite">
      <span className="loading-spinner loading-spinner-large" aria-hidden="true" />
    </div>
  );
}

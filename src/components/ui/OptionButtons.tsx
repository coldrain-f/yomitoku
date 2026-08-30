interface OptionButtonOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface OptionButtonsProps {
  value: string;
  options: Array<string | OptionButtonOption>;
  onChange: (value: string) => void;
  ariaLabel: string;
}

export function OptionButtons({
  value,
  options,
  onChange,
  ariaLabel,
}: OptionButtonsProps) {
  return (
    <div className="choice-group" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const item =
          typeof option === "string" ? { value: option, label: option } : option;
        return (
          <button
            className={`text-button${value === item.value ? " is-selected" : ""}`}
            type="button"
            aria-pressed={value === item.value}
            key={item.value}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

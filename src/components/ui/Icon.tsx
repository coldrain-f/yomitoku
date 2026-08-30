import type { LucideIcon, LucideProps } from "lucide-react";

interface IconProps extends Omit<LucideProps, "ref"> {
  icon: LucideIcon;
}

export function Icon({ icon: Component, ...props }: IconProps) {
  return <Component data-lucide="" aria-hidden="true" {...props} />;
}

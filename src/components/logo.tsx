import logoUrl from "@/assets/isotopiq-logo.png";

export function Logo({ className = "h-8 w-auto", showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <img
      src={logoUrl}
      alt="Isotopiq"
      className={className}
      style={!showWordmark ? { objectFit: "cover", objectPosition: "left", width: "1em", height: "1em" } : undefined}
    />
  );
}

export function Logo({ size = 24, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  const inner = Math.round(size * 0.6);
  return (
    <span className="flex items-center gap-2 select-none">
      <span
        className="inline-flex items-center justify-center rounded-[6px] bg-aurora"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3,10 9,5 13,8 21,3" stroke="#fff" strokeWidth="1.8" />
          <polyline points="3,14 9,19 13,16 21,21" stroke="#fff" strokeWidth="1.8" strokeOpacity="0.4" />
        </svg>
      </span>
      {showWordmark && <span className="text-strong font-semibold text-foreground">Darpan</span>}
    </span>
  );
}

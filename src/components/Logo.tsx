export default function Logo({
  size = 36,
  withWordmark = true,
  className = '',
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="logo-glow shrink-0"
        role="img"
        aria-label="Jasfer Hosting logo"
      >
        <defs>
          <linearGradient id="jasfer-mark" x1="6" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F5E9FF" />
            <stop offset="0.35" stopColor="#C084FC" />
            <stop offset="0.7" stopColor="#A855F7" />
            <stop offset="1" stopColor="#7C3AED" />
          </linearGradient>
          <linearGradient id="jasfer-face" x1="10" y1="10" x2="38" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2A1B4A" />
            <stop offset="1" stopColor="#0B0817" />
          </linearGradient>
        </defs>
        <rect x="1.5" y="1.5" width="45" height="45" rx="13" fill="url(#jasfer-face)" stroke="url(#jasfer-mark)" strokeWidth="1.6" />
        <path d="M15 11.5h18v19.2c0 4.1-3.1 6.8-7.4 6.8-3.6 0-6.4-1.9-7.6-5.1l5-2.1c.6 1.5 1.4 2.2 2.7 2.2 1.5 0 2.3-1 2.3-2.9V16.4H15V11.5Z" fill="url(#jasfer-mark)" />
        <path d="M30.5 31.5l5.5 5.5" stroke="url(#jasfer-mark)" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="35.6" cy="12.4" r="2.4" fill="#E879F9" opacity="0.9" />
      </svg>
      {withWordmark && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-extrabold tracking-[0.16em] text-white">JASFER</span>
          <span className="text-[9px] font-semibold tracking-[0.42em] text-jasfer-300/80">HOSTING</span>
        </span>
      )}
    </span>
  );
}

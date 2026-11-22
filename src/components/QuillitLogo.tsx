interface QuillitLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-8 h-8',
};

/**
 * Minimal architectural fountain-pen nib mark in crisp vector SVG.
 * Uses currentColor so it adapts seamlessly to light paper and dark ink themes
 * with zero boxed containers or raster imagery.
 */
export function QuillitLogo({ size = 'md', className = '' }: QuillitLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 text-ink-primary ${SIZE_CLASSES[size]} ${className}`}
    >
      <path
        d="M12 2.5C14 6.1 17.3 9.5 18.2 12.6L15.3 18.2H8.7L5.8 12.6C6.7 9.5 10 6.1 12 2.5Z"
        fill="currentColor"
        fillOpacity="0.08"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path
        d="M12 2.5V11.3"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      <circle cx="12" cy="13" r="1.45" fill="currentColor" />
      <path
        d="M8.5 21H15.5"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
    </svg>
  );
}

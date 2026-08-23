type IconProps = { className?: string };

export function FolderIcon({ className = "size-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.75 6.75h6l2 2h8.5v8.5H3.75z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M3.75 8.75h16.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function CollectionIcon({ className = "size-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 5.5h14v13H5z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 9h8M8 12h8M8 15h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function GlobeIcon({ className = "size-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.75 12h16.5M12 3.75c2.25 2.2 3.25 5 3.25 8.25S14.25 18.05 12 20.25C9.75 18.05 8.75 15.25 8.75 12S9.75 5.95 12 3.75Z" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}


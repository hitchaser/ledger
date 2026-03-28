export default function Avatar({ src, name, size = 'md', className = '' }) {
  const sizes = {
    xs: 'w-5 h-5 text-[9px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-14 h-14 text-xl',
    xl: 'w-20 h-20 text-2xl',
  };

  const sizeClass = sizes[size] || sizes.md;
  const initial = (name || '?')[0].toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0 ${className}`}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center font-medium text-zinc-400 flex-shrink-0 ${className}`}>
      {initial}
    </div>
  );
}

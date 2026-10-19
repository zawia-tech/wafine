export function SectionHeading({
  eyebrow,
  heading,
  intro,
  align = 'center',
  tone = 'base-100',
}: {
  eyebrow: string;
  heading: string;
  intro?: string;
  align?: 'center' | 'left';
  tone?: 'base-100' | 'pine';
}) {
  const inverted = tone === 'pine';
  return (
    <div className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-xl'}>
      <p className={`text-xs font-semibold uppercase tracking-wider ${inverted ? 'text-neutral-content/70' : 'text-secondary'}`}>
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{heading}</h2>
      {intro && <p className={`mt-4 text-base ${inverted ? 'text-neutral-content/80' : 'text-base-content/75'}`}>{intro}</p>}
    </div>
  );
}

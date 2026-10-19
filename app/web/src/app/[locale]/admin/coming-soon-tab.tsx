/** Placeholder for backoffice sections that are still being designed (Billing, CRM). */
export function ComingSoonTab({ title }: { title: string }) {
  return (
    <section aria-labelledby={`soon-${title}`} className="card border border-dashed border-base-300 bg-base-100">
      <div className="card-body items-center gap-2 text-center">
        <h2 id={`soon-${title}`} className="card-title text-lg">
          {title}
        </h2>
        <p className="text-sm text-base-content/75">Coming soon — design in progress.</p>
      </div>
    </section>
  );
}

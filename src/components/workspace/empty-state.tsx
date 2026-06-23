export function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 pb-32 text-center">
      <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
        Nexus CRM
      </h1>
      <p className="mt-4 max-w-md text-base text-muted-foreground">
        Drop a task, contact, or rough idea. Track projects, manage relationships,
        and keep conversations in one quiet command center.
      </p>
    </div>
  );
}

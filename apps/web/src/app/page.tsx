import { Button } from "@truframe/ui/components/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6">
      <p className="text-sm font-medium text-muted-foreground">Truframe</p>
      <h1 className="text-4xl font-semibold tracking-tight">
        Design websites visually. Get real code.
      </h1>
      <p className="text-lg text-muted-foreground">
        A visual builder that compiles your design into a Next.js or Astro project you own.
      </p>
      <div>
        <Button asChild>
          <a href="/api/health">Check platform status</a>
        </Button>
      </div>
    </main>
  );
}

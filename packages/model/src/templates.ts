/**
 * Starter templates for new projects. Each is a document JSON fixture in `./templates/`.
 * The document format here is provisional (`schemaVersion: 0`): P2-1 defines the real model
 * schema, migrates these fixtures to it, and seeds the project document from them.
 */
import blank from "./templates/blank.json" with { type: "json" };
import landing from "./templates/landing.json" with { type: "json" };
import portfolio from "./templates/portfolio.json" with { type: "json" };
import saas from "./templates/saas.json" with { type: "json" };

export type TemplateMeta = {
  id: "blank" | "landing" | "portfolio" | "saas";
  name: string;
  description: string;
};

/** Display order in the New Project dialog. */
export const TEMPLATES: readonly TemplateMeta[] = [
  { id: "blank", name: "Blank", description: "One empty page." },
  { id: "landing", name: "Landing page", description: "Hero, features and a call to action." },
  { id: "portfolio", name: "Portfolio", description: "Intro, selected work and an About page." },
  { id: "saas", name: "SaaS", description: "Product hero and a pricing page." },
];

const DOCUMENTS: Record<TemplateMeta["id"], unknown> = { blank, landing, portfolio, saas };

/** The starter document for a template (a fresh copy each call). */
export function templateDocument(id: TemplateMeta["id"]): unknown {
  return structuredClone(DOCUMENTS[id]);
}

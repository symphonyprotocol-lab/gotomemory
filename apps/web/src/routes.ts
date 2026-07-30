export type WebRoute = "home";

/**
 * The marketing site has exactly one page. Unknown paths fall back to it rather
 * than 404ing, and there is deliberately no public share route — conversations
 * never leave the user's machine.
 */
export function resolveRoute(_pathname: string): WebRoute {
  return "home";
}

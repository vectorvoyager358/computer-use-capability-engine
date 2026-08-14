import type { ExceptionHandler, ObservationMatch } from "../schema/capability";
import type { Observation } from "../surface/surface";

export function matchingHandler(
  handlers: ExceptionHandler[] | undefined,
  observation: Observation,
): ExceptionHandler | undefined {
  if (!handlers) return undefined;
  return handlers.find((handler) => matches(handler.match, observation));
}

function matches(match: ObservationMatch, observation: Observation): boolean {
  switch (match.kind) {
    case "text":
      return observation.text.includes(match.value);
    case "url":
      return observation.url.includes(match.value);
    case "dialog":
      return (observation.dialog ?? "").includes(match.value);
    case "role_name":
      return observation.text.includes(match.value);
  }
}

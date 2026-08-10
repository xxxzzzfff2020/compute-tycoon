export const REVIEW_RESET_PARAM = "reviewReset";
export const REVIEW_RESET_MESSAGE = "检查点已重置";

interface ReviewUrlParts {
  search: string;
  pathname: string;
  hash: string;
}

export interface ReviewResetActions extends ReviewUrlParts {
  teardown: () => void;
  removeItem: (key: string) => void;
  navigate: (url: string) => void;
}

export interface ReviewResetMarkerActions extends ReviewUrlParts {
  replaceState: (url: string) => void;
}

function buildReviewUrl(pathname: string, params: URLSearchParams, hash: string): string {
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

/**
 * Reset ordering is intentionally explicit: an active app must stop its
 * lifecycle writers before its Review slot is removed or navigated away.
 */
export function resetReviewCheckpoint(
  id: string,
  namespace: string,
  actions: ReviewResetActions,
): void {
  const params = new URLSearchParams(actions.search);
  params.set("checkpoint", id);
  params.set(REVIEW_RESET_PARAM, "1");
  const nextUrl = buildReviewUrl(actions.pathname, params, actions.hash);

  actions.teardown();
  actions.removeItem(namespace);
  actions.navigate(nextUrl);
}

/** Consume the one-shot reset marker while preserving all other query state. */
export function consumeReviewResetMarker(actions: ReviewResetMarkerActions): boolean {
  const params = new URLSearchParams(actions.search);
  if (params.get(REVIEW_RESET_PARAM) !== "1") return false;

  params.delete(REVIEW_RESET_PARAM);
  actions.replaceState(buildReviewUrl(actions.pathname, params, actions.hash));
  return true;
}

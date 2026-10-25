export function suggestionState(status: string, queued = false) {
  const displayStatus = queued || status === "queued" ? "rendering" : status;
  return {
    displayStatus,
    canReject: displayStatus === "suggested" || displayStatus === "approved",
    renderAction: displayStatus === "suggested" ? "approve" : displayStatus === "rendered" ? "rerender" : displayStatus === "failed" ? "retry" : null,
  };
}
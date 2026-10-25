import { describe, expect, it } from "vitest";
import { suggestionState } from "@/lib/suggestion-state";

describe("Suggestion state actions", () => {
  it("suggested candidates allow rejection and approval before render", () => {
    expect(suggestionState("suggested")).toEqual({ displayStatus: "suggested", canReject: true, renderAction: "approve" });
  });
  it.each(["queued", "rendering"])("%s candidates are rendering without actions", (status) => {
    expect(suggestionState(status)).toEqual({ displayStatus: "rendering", canReject: false, renderAction: null });
  });
  it("waiting browser jobs suppress actions immediately", () => {
    expect(suggestionState("approved", true)).toEqual({ displayStatus: "rendering", canReject: false, renderAction: null });
  });
  it("rendered candidates allow rerendering rather than approval", () => {
    expect(suggestionState("rendered")).toEqual({ displayStatus: "rendered", canReject: false, renderAction: "rerender" });
  });
  it("failed candidates allow retrying rather than approval or rejection", () => {
    expect(suggestionState("failed")).toEqual({ displayStatus: "failed", canReject: false, renderAction: "retry" });
  });
  it.each(["approved", "rejected"])("%s candidates cannot be approved again", (status) => {
    expect(suggestionState(status).renderAction).toBeNull();
  });
});
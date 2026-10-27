import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ClipCard } from "@/components/clip-card";

const clip = {
  id: "clip-1",
  title: "Test clip",
  clip_url: "https://example.com/clip.mp4",
  duration_s: 30,
  created_at: "2026-01-01T00:00:00.000Z",
};

describe("ClipCard captions badge", () => {
  it("shows a CC badge when captions were burned in", () => {
    render(<ClipCard clip={{ ...clip, captions_burned: true }} />);

    expect(screen.getByText("CC")).toBeInTheDocument();
  });

  it("hides the CC badge when captions were not burned in", () => {
    render(<ClipCard clip={{ ...clip, captions_burned: false }} />);

    expect(screen.queryByText("CC")).not.toBeInTheDocument();
  });
});

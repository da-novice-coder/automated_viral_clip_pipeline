import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Clip Studio — YouTube to vertical clips" },
      { name: "description", content: "Paste a YouTube link, get AI-picked vertical clips ready to post." },
      { property: "og:title", content: "Clip Studio — YouTube to vertical clips" },
      { property: "og:description", content: "Paste a YouTube link, get AI-picked vertical clips ready to post." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});

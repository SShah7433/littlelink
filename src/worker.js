import PostalMime from "postal-mime";

const LIVETRACK_REGEX = /https:\/\/livetrack\.garmin\.com\/session\/[a-zA-Z0-9\-_/]+/;
const TWENTY_FOUR_HOURS = 86400;
const RACE_PAGE_PATHS = new Set(["/race", "/race/", "/race.html"]);
const RACE_STATUS_PATH = "/api/race-status";

export default {
  async email(message, env, ctx) {
    const from = message.from;

    if (from !== "noreply@garmin.com") {
      // not a garmin email
      return
    }

    const rawEmail = await new Response(message.raw).arrayBuffer();
    const parser = new PostalMime();
    const parsed = await parser.parse(rawEmail);

    const bodyText = (parsed.text || "") + (parsed.html || "");
    const match = bodyText.match(LIVETRACK_REGEX);

    if (match) {
      await env.LIVETRACK_KV.put("livetrack:current", match[0], {
        expirationTtl: TWENTY_FOUR_HOURS,
      });
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === RACE_STATUS_PATH) {
      if (request.method !== "GET") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "GET" },
        });
      }

      const livetrackUrl = await env.LIVETRACK_KV.get("livetrack:current");
      return Response.json(
        { livetrackUrl },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (RACE_PAGE_PATHS.has(url.pathname)) {
      const livetrackUrl = await env.LIVETRACK_KV.get("livetrack:current");

      if (livetrackUrl) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: livetrackUrl,
            "Cache-Control": "no-store",
          },
        });
      }

      const racePageUrl = new URL(request.url);
      racePageUrl.pathname = "/race.html";
      const racePageResponse = await env.ASSETS.fetch(racePageUrl);
      const response = new Response(racePageResponse.body, racePageResponse);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    return env.ASSETS.fetch(request);
  },
};

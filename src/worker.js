import PostalMime from "postal-mime";

const LIVETRACK_REGEX = /https:\/\/livetrack\.garmin\.com\/session\/[a-zA-Z0-9\-_/]+/;
const TWENTY_FOUR_HOURS = 86400;

export default {
  async email(message, env, ctx) {
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
    const assetResponse = await env.ASSETS.fetch(request);

    const contentType = assetResponse.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return assetResponse;
    }

    const livetrackUrl = await env.LIVETRACK_KV.get("livetrack:current");

    const response = new Response(assetResponse.body, assetResponse);
    response.headers.set("Cache-Control", "no-store");

    if (!livetrackUrl) {
      return response;
    }

    const buttonHtml = `<a class="button button-garmin" href="${livetrackUrl}" target="_blank" rel="noopener" role="button"><img class="icon" aria-hidden="true" src="/images/icons/garmin.svg" alt="Garmin Logo">Track my Run</a>`;

    return new HTMLRewriter()
      .on(".button-stack", {
        element(el) {
          el.prepend(buttonHtml, { html: true });
        },
      })
      .transform(response);
  },
};

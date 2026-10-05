# YouTube Data API

The home page requests the latest video, live broadcast, and Short from the KODAKO STUDIOS gaming channel using the YouTube Data API v3. Results are cached in the current browser tab for six hours. It reads the channel's uploads playlist rather than running a search query.

## Configure the API key

1. In Google Cloud Console, select or create a project and enable **YouTube Data API v3**.
2. Create an API key in **APIs & Services → Credentials**.
3. Restrict the key to **YouTube Data API v3** under API restrictions.
4. Under website/referrer restrictions, allow the production site:
   - `https://kodakostudios.github.io/*`
   - Add a localhost referrer only if you need local browser testing, then remove it when no longer needed.
5. Put the key in `youtube-config.js` as the `apiKey` value. The key is necessarily visible in a static GitHub Pages site, so referrer and API restrictions are required; never use an unrestricted key.
6. Publish `youtube-config.js`, `youtube-api.js`, `index.html`, and `styles.css` to GitHub Pages.

The game channel is configured by its channel ID in `youtube-config.js`. Channel IDs are more reliable than legacy usernames. To use another channel, replace `channelId` with its ID (starting with `UC`). If no `channelId` is configured, the script falls back to `channelUsername`.

## Limits and classification

- Each uncached page load uses low-cost API reads and scans up to 3,000 recent uploads, stopping early when a regular video, live broadcast, and Short are all found. This helps find regular videos when many Shorts and live-stream archives were published recently. Results are cached for six hours per browser tab.
- YouTube's Data API does not expose a definitive Shorts classification in the video resource. This page labels non-live videos up to three minutes long as Shorts; a short regular video may therefore be classified as a Short. The latest-video card only shows videos longer than three minutes, so a Short is never used as a fallback there.
- The live card selects the latest live, scheduled, or archived broadcast found in the uploads playlist. Archived livestreams are excluded from the regular-video card. A broadcast may not appear until YouTube lists it there or exposes its live-stream metadata.
- Google Cloud's YouTube Data API quota is subject to Google's current quota limits and terms. If a key is missing, blocked, or out of quota, the page shows a readable status and does not pretend data loaded.

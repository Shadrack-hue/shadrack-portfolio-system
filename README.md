# Portfolio System and IntelStream

This repository serves the Portfolio System and the IntelStream research workspace at https://shadrack-portfolio-system.vercel.app/intelstream.html. The current professional portfolio is https://shadrackfavour.vercel.app.

## IntelStream

`intelstream.html` and `assets/intelstream.*` implement the responsive search workspace. `api/search.js` is a same-origin Vercel Node.js function; `lib/search.js` retrieves public results concurrently from:

- Wikipedia: background extracts, thumbnails, and article coordinates when available.
- Google News RSS: publisher headlines and links, using the Kenya English edition.
- Hacker News via Algolia: community stories, dates, points, and discussion links.

Search is available without an account or paid API keys. Location is appended as a search keyword; it is not a geographic radius filter. Relevance is supplied by each source. No generative AI or semantic ranking is configured, and the interface makes that clear. Source coverage varies by topic; successful providers remain usable when another provider is unavailable.

Visitors can filter by source, sort dated results, show results with images, save up to 100 sources in their browser, and export the selected results as Markdown. Saved items do not sync between devices. Image and article rights remain with the linked sources; Wikipedia extracts retain a link to the source page.

Requests validate input, time out upstream requests after ten seconds, reject oversized responses and unsafe links, and report upstream failures. A bounded in-memory cache holds complete responses for five minutes and partial responses for thirty seconds. Identical in-flight queries are coalesced. A per-instance limit allows twenty uncached searches per IP per minute; this is best-effort protection, not a distributed rate limiter. For larger traffic, configure platform-wide request limits. Search query text is sent to the three named providers; it is not logged by application code.

## Development and checks

Use Node.js 24:

```sh
npm ci --ignore-scripts
npm test
npm run check
npm run build
npm run dev
```

The local server listens on port 4173. Tests use provider fixtures, make no paid calls, and do not send contact messages. Live provider availability must also be checked on the deployed preview.

`npm run build` copies only the four public HTML pages, the existing Speed Insights file, and browser assets into `dist`. Server code, tests, configuration, and the legacy extensionless prototype are excluded. Vercel discovers `api/search.js` separately as a serverless function. Existing portfolio pages are retained unchanged.

## Contact and telemetry

The contact form uses the existing Formspree endpoint. It validates required fields and email format, prevents duplicate submissions, displays provider success or failure, and preserves the message if delivery fails. It also submits normally without JavaScript. Test delivery only with an explicitly authorized message; UI checks should not send mail.

Web Analytics and Speed Insights remain integrated. Enable the corresponding Vercel products in the dashboard to collect metrics. No authentication credentials should be collected by IntelStream until a real account service is deliberately implemented.

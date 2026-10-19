# no-scroll: Phase 1 investigation

Research only, no code. Phase 2 waits for Bosco's approval.

Written 2026-10-19. Tags used throughout:

- **[source]**: read in the Userscripts v4.8.6 source, its README and issues, or vendor docs (links at the end).
- **[observed]**: seen on 2026-10-19 in Playwright 1.64.1 WebKit (build 2370), logged out, with iPhone 17 Pro emulation and Desktop Safari at 1440x900, or with curl.
- **[inferred]**: reasoning or prior knowledge, not observed. Anything that matters is on the device list in section 7.

Two things are missing before Phase 2 (6.1): the spec I received stops at "Metadata: @inject-into content, @run-at document-start, @noframes, @grant GM.addStyle,", and `tiktok-no-feed.user.js` is not in this repo.

## Summary

- **TikTok's mobile layout can't do either job.** Logged out, `/messages` redirects to the For You feed and search hands off to the app. Unless D2 shows otherwise logged in, tiktok.com stays in Request Desktop Website and the TikTok script targets the desktop layout.
- **Feeds never put the current video in the URL.** TikTok's desktop feed makes no history calls, its mobile feed `replaceState`s to the same `/foryou`, and Instagram's mobile Reels feed changed reels with no URL change. Gating the feed route is the only URL-level control, and it is enough: "one video per tap" only has to handle video pages.
- **Instagram moves between reels with `replaceState` and opens a new post or reel with `pushState`.** The Navigation API reports both (as replace and push), so URL tracking needs no polling, and Back (a traverse) can never re-trigger the gate. Both sites also `replaceState` the current URL right after load, so the scripts compare video ids, not URLs.
- **An Instagram reel has four URL shapes:** `/reel/<code>/`, `/<user>/reel/<code>/` (what grids and permalinks use), `/reels/<code>/` (the Reels feed), and `/p/<code>/`, which serves a reel without redirecting.
- **Reels in the home feed cannot be seen logged out.** Proposal: the primary signal is the post's own permalink (the anchor around its `<time>`) pointing at a `/reel/` URL, with a `<video>` in the post as the fallback. D5 decides.
- **Userscripts' `document-start` is not early.** Injection waits for a native round trip, so the gate must handle a page that has already rendered and started playing.
- **Updates are manual in the App Store build** (Userscripts for iOS 1.8.6, which is v4.8.6): Check Updates in the popup. A script without `@version` and `@updateURL` can never update (#248), and one failing update URL fails the check for every script.
- **Vercel needs almost nothing:** static files in `public/` and a `vercel.json` with a noindex header plus two rewrites that serve each `.user.js` at its `.meta.js` URL. Vercel's default `.js` Content-Type already renders inline in WebKit.
- **iOS 26 adds every Home Screen site as a web app by default.** The launchers must be added with "Open as Web App" off, or (per reports) the userscripts will not run.

## 1. Userscripts on iOS

The App Store build is Userscripts for iOS 1.8.6 (2026-01-11), matching extension v4.8.6 on GitHub (released the day before); v5.0 is still a TestFlight beta. Everything here was read in the v4.8.6 source unless marked otherwise. [source: App Store lookup, GitHub releases]

### 1.1 Setup

- Install Userscripts and open the app once (since iOS app 1.5.0 it creates a default scripts folder, visible in Files).
- Settings > Apps > Safari > Extensions > Userscripts: allow it, then set website access. The README recommends Always Allow on All Websites. The minimum for this project is tiktok.com, instagram.com, and the Vercel domain (for the install prompt, 1.2).

### 1.2 Installing from a URL [source: README, `action-popup/App.svelte`]

- The path must end in `.user.js`. The popup strips `?query` and `#hash` first: `url.split(/[?#]/)[0].endsWith(".user.js")`.
- Safari has to display the file rather than download it (4.3).
- On iOS the popup does not open by itself: tap AA in the address bar, then Userscripts. It shows "Tap to install", or "Tap to re-install" when a script with the same `@name` exists.
- The popup re-fetches the URL itself with `fetch()` ("refetch script from URL to avoid tampered DOM content"), so it never reads the rendered page. Any non-2xx response shows "Fetching failed, refresh to retry." [inferred] If the extension is not allowed on the Vercel domain, this cross-origin fetch may also fail, because Vercel sends no CORS headers; the fix is allowing Userscripts on that site, not a header.
- The native side requires a `// ==UserScript==` block with `@name` and saves the file as `<sanitized @name>.user.js`. So `@name` must never change: a renamed script installs as a second file and both run.

### 1.3 Updates, and the issue #248 caveat [source: issues #248, #836, #894; `Ext-Safari/Functions.swift`]

- #248: Userscripts never falls back to the URL a script was installed from, so a script without `@version` and `@updateURL` can never update. #248 was closed in 2025; the follow-up (#836, record the install URL) is still open. The maintainer's guidance there: `@updateURL` is the metadata-only file, `@downloadURL` the full script, and pointing both at the full script is fine "if you don't care about user traffic consumption".
- What v4.8.6 does:
  - A script is updatable only with both `@version` and `@updateURL`.
  - `@updateURL` must end in `js` (`updateUrl.hasSuffix(type)`): no query string or hash.
  - It fetches `@updateURL` natively (http upgraded to https, 30 s timeout, HTTP 200 required, decoded as UTF-8) and parses it; the parse needs a metadata block with `@name` and `@version`.
  - Versions compare as dot-separated integers, and a non-numeric part counts as 0 (`1.2.0-beta` equals `1.2.0`). Use plain `1.2.3`.
  - New code comes from `@downloadURL`, or from `@updateURL` when `@downloadURL` is missing. With a real metadata-only `.meta.js` and no `@downloadURL`, an update would replace the script with its bare metadata block.
  - One failing update URL fails the check for every script: `checkForRemoteUpdates` returns nil on the first failure and the popup shows "failed to check for updates".
- Updates are manual in the App Store build. Automatic checks were switched off in v4.8.x in December 2025 (#894) because a slow update fetch froze the whole extension. Flow: open the popup, tap the Updates icon, tap "Check Updates", then "Update" or "Update All". New code applies from the next page load. Fallback: open the `.user.js` URL again and "Tap to re-install".

### 1.4 No editor on iOS [source: README]

The iOS app has no script editor; scripts are plain files in the scripts folder, editable with any third-party editor. "After files are added, removed or edited, you will need to open the popup at least 1 time to see those changes reflected in your browsing experience."

### 1.5 The metadata keys we use [source: README, `content-scripts/entry-userscripts.js`, `background/main.js`]

- `@inject-into content`: the code runs via `Function()` in the content script's isolated world. It shares the DOM with the page but not its JS globals, and GM APIs exist only here (a script with grants and `auto` is forced to `content` anyway). So the script cannot wrap the page's `history.pushState`; it has to watch URL changes from outside (5.3).
- `@run-at document-start`: Userscripts' own content script is declared at `document_start`, but before injecting it awaits extension storage and a background-to-native round trip (`REQ_USERSCRIPTS`). So document-start means "as early as that round trip allows", not "before the page's scripts". The gate has to work on a page that has already rendered and started playing, and cannot assume `document.body` exists.
- `@noframes`: the native side withholds code from subframes (`isTop` check).
- `@grant GM.addStyle`: implemented as `browser.tabs.insertCSS(tab, { code, cssOrigin: "user" })`. It is async, targets the top frame, is not a DOM node (the page cannot remove it) and lasts until the document unloads, across SPA route changes. User-origin CSS loses to the site's CSS unless marked `!important` (user `!important` beats author `!important`). Route-specific rules need a hook the script toggles, such as an attribute on `<html>`.
- `@match`: at least one `@match` or `@include` is required; http/https only.
- Useful on device: when a script runs, the page console logs `Injecting: <name> (js/content)`.

## 2. Route maps

### 2.1 TikTok

Probed logged out on 2026-10-19 in three contexts: iPhone 17 Pro emulation (mobile layout), Desktop Safari at 1440x900, and a Mac UA with touch at 980x1800 standing in for Request Desktop Website (TikTok served it the desktop layout). TikTok showed slider CAPTCHAs on `/tag/cats`, `/@tiktok`, `/search/video` and after opening a search result, plus two HTTP 403s. None were touched, so the profile-grid flow is unobserved.

"Desktop layout" below is what an iPhone gets with Request Desktop Website.

| Route | What it is | Desktop layout | Mobile layout | Rule |
|---|---|---|---|---|
| `/`, `/foryou` | For You feed | Scroll-snap feed (`div#column-list-container`); moving between videos (arrow keys, wheel, `feed-navigation-next`) never touches the URL or history [observed] | Each swipe calls `replaceState(.., "/foryou")`; the URL never carries a video id [observed] | gate |
| `/following` | Following feed | Logged out: a suggested-creators grid [observed] | Logged out: "Log in to see videos" [observed] | gate |
| `/friends` | Friends feed | Logged out: ends at `/foryou?lang=en` (the page re-requests `/friends`, which 302s) [observed] | same [observed] | gate |
| `/explore` | Explore grid | Category chips and a video grid [observed] | 302 to `/foryou?lang=en` [observed] | gate |
| `/discover`, `/discover/<topic>` | Mobile's Explore | n/a | Trending grid and topic pages; also where the mobile search link sits [observed] | gate |
| `/live`, `/live/following`, `/live/gaming` | LIVE feed, a separate app (the nav link does a full page load) | [observed] | [observed] | gate |
| `/@<user>/live` | One LIVE room, with "Recommended LIVE streams" | [observed] | Logged out: error page [observed] | gate (6.3) |
| `/messages` | DMs | Logged out: 302 to `/login?redirect_url=...messages` [observed] | Logged out: 302 to `/foryou?lang=en` [observed] | allow |
| `/inbox` | Mobile inbox tab (`dm-icon`) | n/a | Logged out: "Messages and notifications will appear here" [observed]; logged in unknown (D2) | allow |
| `/search?q=<q>&t=<ms>` | Search, Top tab | Results render. TikTok's own search box pushes `/search?q=<q>&t=<Date.now()>` [observed] | Landing page only; submitting deep-links to the app (`snssdk1233://search`) [observed] | allow |
| `/search/user`, `/search/video`, `/search/photo` (`?q=`) | Result tabs, switched by pushState from `button` tabs with no href; the LIVE tab opens the login modal logged out [observed] | | `/search/video` 302s to `/foryou` [observed] | allow |
| `/@<user>` | Profile grid | CAPTCHA, then 403 [observed] | CAPTCHA [observed] | allow |
| `/@<user>/video/<id>`, `/@<user>/photo/<id>` | One post | Fresh load: a single-item page with no next control; ArrowDown and wheel do nothing [observed]. From search: an in-page overlay pushed as `/@<user>/video/<id>?q=<q>&t=<ms>` over the still-mounted results, with a "Go to next video" arrow (`button[data-e2e="arrow-right"]`) and "Creator videos" / "You may like" lists [observed]. What next does to the URL was not observed (CAPTCHA, D4) | Fresh load: a separate landing page; tapping a related video deep-links to the app [observed] | allow, with one video per tap |
| `/tag/<x>`, `/music/<x>` | Hashtag and sound grids | CAPTCHA [observed] | CAPTCHA [observed] | allow (6.3) |
| everything else (`/login`, `/tiktokstudio/...`, `/@` own profile, settings) | | | | allow |

Answers to the spec's TikTok questions:

- **Feed routes:** `/`, `/foryou`, `/following`, `/friends`, `/explore` (desktop), `/discover` (mobile), `/live` and its subpaths.
- **`/messages`:** exists in the desktop layout only. In the mobile layout it redirects to the feed, and mobile's Inbox tab is `/inbox`.
- **Search URL:** `https://www.tiktok.com/search?q=<query>`. `t` is just `Date.now()` at submit and can be omitted: a direct load of `/search?q=cats` renders results on desktop.
- **Video URLs:** `/@<user>/video/<id>` and `/@<user>/photo/<id>`, plus `?q=&t=` when opened from search.
- **Browse-mode swiping:** inside a feed the URL never changes per video (no history calls on desktop; `replaceState` to the same `/foryou` on mobile), so URL rules can only catch entry into a feed, which the gate covers. Opening a search result pushes the video URL. The next arrow in that overlay is the one unobserved case.
- **The mobile layout is a dead end for this project:** logged out it has neither DMs nor web search results (both hand off to the app). If D2 confirms that logged in, TikTok lives in Request Desktop Website and the script targets the desktop layout.

Stable hooks (all observed). TikTok's class names carry per-bundle build hashes (`css-<hash>-7937d88b--...` on desktop, others on mobile), so the script keys on `data-e2e`.

| Target | Desktop layout | Mobile layout |
|---|---|---|
| For You, Explore, Following, LIVE | `a[data-e2e="nav-foryou"]` (href `/`), `nav-explore`, `nav-following`, `nav-live` | `a[data-e2e="home-icon"]` (`/`), `a[data-e2e="discover-icon"]` (`/discover`); drawer `nav-foryou`, `nav-following` |
| Friends, Messages | not shown logged out (D3) | Inbox `a[data-e2e="dm-icon"]` (`/inbox`) |
| Logo | `a[data-e2e="tiktok-logo"]` (href `/`) | `a[data-e2e="tiktok-logo"]` in the drawer |
| Search | `button[data-e2e="nav-search"]` opens `form[data-e2e="search-box"]` with `input[data-e2e="search-user-input"][name="q"]` | `a[href="/search"]` |
| Video | `article[data-e2e="recommend-list-item-container"]` > `div[id^="xgwrapper-"]` > `video` | `div[data-e2e="video-slide-active"]` > `video` |
| Search-result overlay | `button[data-e2e="browse-close"]`, `button[data-e2e="arrow-right"]` | n/a |

### 2.2 Instagram

Probed logged out on 2026-10-19 with iPhone 17 Pro emulation and Desktop Safari. No consent banner, CAPTCHA or block appeared. Most pages put a sign-up dialog or a full-page "use the app" screen in front of the content; those are logged-out nags and say nothing about the logged-in app.

| Route | What it is | Desktop, logged out | Mobile, logged out | Rule |
|---|---|---|---|---|
| `/` | Home feed | Login form [observed] | Landing page plus the bottom tab bar [observed] | allow, with reels hidden in the feed (section 3) |
| `/reels/`, `/reels/<code>/` | Reels tab | Plays a feed. A bare `/reels/` becomes `/reels/<code>/` by `replaceState` within 2 s. The next button (`div[role="button"][aria-label="Navigate to next Reel"]`), the wheel and the arrow keys each move one reel and `replaceState` to that reel's `/reels/<code>/` [observed] | Plays a feed under a closable "Watch this reel in the app" dialog. Scrolling moved to the 2nd and 3rd reel with no URL change; a real finger swipe could not be tested [observed] | gate |
| `/reel/<code>/`, `/<user>/reel/<code>/` | One reel | Post layout with one player, no next or prev control; arrow keys do nothing and the wheel only scrolls the page. The "More posts from <user>" grid below does `pushState` to `/<user>/reel/<code>/` [observed] | Full-page "Watch this reel in the app". "Continue on web" pushes `?l=1` and shows that one reel with nothing to move on to [observed]. Logged in unknown (D7) | allow, with one video per tap |
| `/p/<code>/`, `/<user>/p/<code>/` | One post. Also serves reels: `/p/<reel code>/` returns 200 with no redirect and a canonical of `/reel/<code>/` [observed] | | | allow |
| `/explore/` | Explore grid when logged in [inferred] | A "Popular on Instagram" topic list [observed] | Same; the tab bar labels the link "Search & Explore" [observed] | gate, links rewritten to search |
| `/explore/search/` | Search page on mobile web [inferred] | 302 to `/accounts/login/` [observed] | same [observed] | allow |
| `/explore/search/keyword/?q=<q>` | Keyword search results | 302 to login, and `next=` keeps the query, so the route is real [observed] | same [observed] | allow |
| `/explore/tags/<tag>/` | Hashtag page | 301 to `/popular/<tag>/?utm_source=explore_tag`, a grid of autoplaying reels [observed]; logged in unknown (D8) | same [observed] | allow |
| `/direct/inbox/`, `/direct/t/<id>/` | DMs | 302 to login [observed] | same [observed] | allow |
| `/<user>/` | Profile | 12 tiles: reels link `/<user>/reel/<code>/` and carry `svg[aria-label="Clip"]`, photos link `/<user>/p/<code>/` [observed] | Every tile links to `applink.instagram.com`; reels carry `svg[aria-label="Video"]` [observed] | allow |
| `/<user>/reels/` | Profile Reels tab | 12 reel tiles [observed] | 12 applink tiles [observed] | allow (6.3) |
| `/stories/<user>/...` | Stories | Full-page sign-up screen [observed] | same [observed] | allow |
| everything else (`/accounts/...`, `/popular/...`, locations) | | | | allow |

Answers to the spec's Instagram questions:

- **`/`:** the home feed; allowed, minus reels (section 3).
- **`/reels/`:** the Reels feed. The URL becomes `/reels/<code>/` at once, and on desktop follows each reel via `replaceState`. On mobile the URL did not follow the visible reel. Gate it all.
- **`/reel/<id>/`:** one reel. Logged out, neither layout lets you move on to another reel, except the desktop "More posts" grid, which pushes `/<user>/reel/<code>/`. Whether the logged-in mobile page lets you swipe into more reels is D7.
- **`/explore/`:** logged out, a topic list; logged in, the Explore grid [inferred]. Gate, and send its links to search.
- **Search page on mobile web:** `/explore/search/` [inferred from the login redirect; rendering logged in is D8].
- **Keyword search:** `/explore/search/keyword/?q=<query>` (exists; rendering logged in is D8).
- **`/explore/tags/<tag>/`:** logged out, a 301 to `/popular/<tag>/`. D8 checks where hashtag results land logged in.
- **`/direct/inbox/`:** DMs, behind login.
- **`/<user>/reels/`:** the profile's Reels grid.
- **`/stories/`:** the stories viewer (logged out, a sign-up screen).
- **Swiping from a single reel:** not possible logged out. The URL changes per reel only inside the Reels feed, by `replaceState`.

Stable hooks. Instagram's class names are atomic and generated (`x1i10hfl ...`), so the script keys on `href` and, where unavoidable, `aria-label`. Aria-labels are English strings and change with the account language.

| Target | Desktop | Mobile |
|---|---|---|
| Reels tab link | `a[href="/reels/"]` [inferred, logged in] | `a[href="/reels/"]` with `svg[aria-label="Reels"]` [observed] |
| Explore link | `a[href="/explore/"]` [inferred, logged in] | `a[href="/explore/"]` with `svg[aria-label="Search & Explore"]` [observed] |
| Video player | `div[aria-label="Video player"][role="group"]` [observed] | same [observed] |
| Reels feed controls | `div[role="toolbar"][aria-label="Reels navigation controls"]` [observed] | none |
| Reel tile in a grid | `a[href*="/reel/"]` with `svg[aria-label="Clip"]` [observed] | `svg[aria-label="Video"]`; the href is an applink logged out [observed] |
| A post's own permalink | the anchor around its `<time datetime>`: `/<user>/reel/<code>/` or `/<user>/p/<code>/` [observed] | an applink logged out; logged in unknown (D5) |

The logged-out mobile tab bar links `/?nb=l`, `/u/direct/`, `/reels/`, `/explore/` and `/u/profile/` [observed]; the logged-in hrefs are D9.

## 3. Reels in the Instagram home feed

Logged out, `/` is a login form (desktop) or a landing page (mobile), so the feed itself could not be observed. The post and reel pages are the best evidence available:

- A post's own permalink is the anchor around its `<time datetime=...>`: `/<user>/reel/<code>/` for reels and `/<user>/p/<code>/` for photos, whatever URL was loaded [observed, desktop].
- Comment timestamps link to `/p/<code>/c/<id>/` even on reels, so a `/p/` link proves nothing [observed].
- Players are `div[aria-label="Video player"][role="group"]` around a `<video>` with a `blob:` source [observed].
- Desktop post and reel pages contain no `<article>`; the mobile post page has one [observed]. Whether mobile feed items are `<article>` is unknown.
- Logged-out mobile pages link posts to `applink.instagram.com`, so the mobile feed's permalink format is unknown too [observed].

Candidate signals, best first:

| Signal | Selector, within a feed item | For | Against |
|---|---|---|---|
| Permalink | `a[href*="/reel/"]` (the anchor around the item's `<time>`) | Language-independent, semantic, and what desktop post pages do | Unconfirmed in the mobile feed, which might link reels as `/p/` |
| Player | `video` | Language-independent; catches every reel whatever the link says | Also hides older non-reel videos and carousels that contain a video |
| Labels | `[aria-label="Video player"]`, `svg[aria-label="Clip"]`, "Reels" badges | Specific | English strings that break under another language setting |
| Audio link | `a[href^="/reels/audio/"]` | Reels carry a sound link [inferred] | Not seen at all today |

**Proposal:** the permalink is the primary signal. The player is the fallback, used only if D5 shows the mobile feed linking reels as `/p/`. Suggested-reels modules: hide the feed-level block that links to `/reels/<code>/` or `/reel/<code>/` and has no `<time>` permalink of its own; D6 identifies that container. Feed items are re-rendered as you scroll [inferred], so matching re-runs on DOM mutations and marks each match with an attribute that a `GM.addStyle` rule hides.

## 4. Vercel

### 4.1 Layout

With framework preset "Other" and no build command, Vercel serves `public/` if it exists, otherwise the repo root [source: Vercel docs, Configuring a Build]. Putting the site in `public/` keeps this file and the README off the site, with no build step and no `package.json`.

```
public/
  index.html                   install page
  tiktok.html                  launcher, served at /tiktok
  instagram.html               launcher, served at /instagram
  tiktok-no-feed.user.js
  instagram-no-reels.user.js
vercel.json
```

### 4.2 vercel.json

```json
{
  "cleanUrls": true,
  "headers": [
    { "source": "/(.*)", "headers": [{ "key": "X-Robots-Tag", "value": "noindex" }] }
  ],
  "rewrites": [
    { "source": "/tiktok-no-feed.meta.js", "destination": "/tiktok-no-feed.user.js" },
    { "source": "/instagram-no-reels.meta.js", "destination": "/instagram-no-reels.user.js" }
  ]
}
```

- `cleanUrls` serves `tiktok.html` at `/tiktok` (and redirects `/tiktok.html` there) [source].
- `X-Robots-Tag: noindex` goes on every path, scripts included. Vercel adds noindex to preview deployments only, never to the current production deployment [source: Vercel KB], so this header is needed.
- Rewrites only apply when no file exists at the source path ("precedence is given to the filesystem prior to rewrites being applied") [source], so `public/` must not contain real `.meta.js` files.

### 4.3 Content-Type for `.user.js`

- [observed] Vercel serves static `.js` as `content-type: application/javascript; charset=utf-8` with `content-disposition: inline; filename="..."` (curl on two Vercel-hosted static sites).
- [observed] WebKit (iPhone and desktop emulation, local server) renders all of these inline: `application/javascript; charset=utf-8` with and without that Content-Disposition, `text/javascript`, and `text/plain; charset=utf-8`. `text/plain` without a charset renders but garbles non-ASCII. `application/octet-stream` starts a download, which would mean no install prompt.
- **Decision:** keep Vercel's default and add no Content-Type header. It already renders inline, and overriding Content-Type on static files through `vercel.json` has unresolved community reports of being ignored (Vercel documents per-file content types only through the Build Output API). Keep both scripts ASCII-only, which the no-em-dash rule mostly guarantees anyway.
- The install does not depend on the header beyond "Safari shows the file": the popup re-fetches and decodes as UTF-8 regardless (1.2).

### 4.4 Caching

[observed] Plain static files on Vercel come back with `cache-control: public, max-age=0, must-revalidate`, so every "Check Updates" sees the newest deploy. Confirm with `curl -I` after the first deploy.

### 4.5 How `.meta.js` gets produced: rewrite, not a build script

- The rewrite serves the full `.user.js` at the `.meta.js` URL. Userscripts only parses the metadata block of whatever it downloads and needs `@name` and `@version` from it (1.3), which the full script has.
- No build step: no `package.json`, no build command or output directory, nothing generated that can drift, and the deployed file is byte-identical to the repo file.
- It also defuses the 1.3 trap: if `@downloadURL` ever goes missing, the fallback download from `@updateURL` still gets the full script, not a bare metadata block.
- Cost: a manual update check downloads the whole script (tens of KB) instead of about 1 KB. Irrelevant for one phone. A build script would only pay off with many clients polling often.
- Even simpler would be `@updateURL` pointing straight at the `.user.js`: v4.8.6 only checks that the URL ends in `js`, and the maintainer in #248 endorses it. I kept `.meta.js` because the README asks for it and the spec names it.

### 4.6 The deployed origin before the first deploy

- Vercel names the production domain `<project-name>.vercel.app` when that is free (a suffixed variant otherwise) and shows it under Project > Settings > Domains [inferred].
- Hard-code absolute https URLs in `@updateURL` and `@downloadURL`. Order: (1) import the repo into Vercel, which deploys once; a placeholder origin in that deploy is harmless because nothing is installed yet; (2) read the production domain; (3) commit the real URLs and push; (4) install on the phone from the production domain.
- Not build-time stamping from `VERCEL_PROJECT_PRODUCTION_URL` (available at build time [source]): it needs a build step, makes the deployed file differ from the repo, and the variable switches to the shortest custom domain if one is ever added, silently changing the URL that installed copies poll.
- Use the production domain, never a per-deployment URL (`no-scroll-<hash>-<scope>.vercel.app`): under Standard Protection, the recommended setting, those require a Vercel login while production domains stay public [source]. Never choose "All Deployments" protection, which would put the production domain behind a login and break installs and updates.

### 4.7 No third-party requests

- Pages use inline CSS and JS only: no web fonts, no external images. Static hosting sets no cookies.
- The Vercel Toolbar is injected on preview deployments by default and loads from vercel.live; production is off by default [source]. Turn it off for Preview in Project Settings > General > Vercel Toolbar, or never open preview URLs.
- Vercel Web Analytics and Speed Insights stay off (they need a dashboard switch and an added script).

### 4.8 Home Screen launchers on iOS 26

- iOS 26 turned "Open as Web App" on by default in Add to Home Screen, for every site, manifest or not; switching it off saves a plain bookmark [source: heise]. [inferred] Safari extensions are reported not to run in Home Screen web apps (Apple developer forum thread 715634, user reports), and a cross-origin redirect out of a web app opens an in-app browser sheet rather than Safari. So the launchers must be added with "Open as Web App" off, and the install page must say so. D13 confirms.
- Launcher pages carry no manifest and no `apple-mobile-web-app-capable` meta.
- A page that redirects immediately cannot be added to the Home Screen: by the time Share is tapped, the address bar shows tiktok.com. Proposal: redirect with `location.replace()` unless `document.referrer` is the install page, in which case show the add-to-Home-Screen steps instead. A launch from the Home Screen has no referrer, so it redirects.

## 5. Proposed rules

Paths are matched without the query string.

### 5.1 TikTok

- **Layout:** desktop, with tiktok.com set to Request Desktop Website (AA menu; Safari remembers it per site), pending D2 and question 3.
- **Gate:** `/`, `/foryou`, `/following`, `/friends`, `/explore`, `/discover` and anything under it, `/live` and anything under it, `/@<user>/live`.
- **Allow:** everything else, including `/messages`, `/inbox`, `/search` and its tabs, profiles, posts, `/tag/`, `/music/`, login and settings.
- **Hide (desktop layout):** `a[data-e2e="nav-foryou"]`, `a[data-e2e="nav-explore"]`, `a[data-e2e="nav-following"]`, `a[data-e2e="nav-live"]`, `a[data-e2e="tiktok-logo"]`, plus the logged-in Friends item once D3 names it. If the mobile layout stays in use: `a[data-e2e="home-icon"]`, `a[data-e2e="discover-icon"]` and the drawer's `nav-foryou` and `nav-following`.
- **Rewrite:** none.
- **One video per tap:** the video id comes from `/@<user>/video/<id>` or `/@<user>/photo/<id>`. The moves this catches are the search overlay's next arrow and its "Creator videos" and "You may like" lists (D4 confirms they change the URL).
- **Gate actions:** the search box opens `https://www.tiktok.com/search?q=<query>`; Messages opens `https://www.tiktok.com/messages`.

### 5.2 Instagram

- **Gate:** `/reels/` and anything under it (`/reels/<code>/`, `/reels/audio/<id>/`), and `/explore/` itself (not `/explore/search/...`, `/explore/tags/...` or `/explore/locations/...`).
- **Allow:** everything else: the home feed, posts and reels by permalink, search, hashtags, `/popular/`, DMs, stories, profiles including `/<user>/reels/`.
- **Hide:** `a[href="/reels/"]` (mobile tab bar and desktop sidebar), and on desktop `a[href="/explore/"]` (desktop search is a side panel, so nothing is lost).
- **Rewrite (mobile):** `a[href="/explore/"]` opens `/explore/search/` instead, keeping search one tap away without the grid.
- **One video per tap:** the video id comes from `/reel/<code>/`, `/<user>/reel/<code>/` or `/reels/<code>/`. `/p/<code>/` does not count, since it may be a photo.
- **Home feed:** hide reel posts and suggested-reels modules (section 3).
- **Gate actions:** the search box opens `https://www.instagram.com/explore/search/keyword/?q=<query>`; Messages opens `https://www.instagram.com/direct/inbox/`.

### 5.3 Shared behavior (both scripts)

- **Noticing route changes.** Both sites are SPAs, and a content-world script cannot wrap the page's `history.pushState` (1.5). The Navigation API reports every same-document navigation: WebKit fired `navigate` events of type push and replace for both sites' own history calls [observed], and Safari has shipped the API since 26.2 [source: WebKit bug 258384, partial at first]. `navigate` fires before the URL commits, so `location.href` is the old URL and `event.destination.url` the new one, and `navigationType` separates push and replace from traverse (Back and Forward). If D1 shows no `navigation` object on the phone, the fallback is polling `location.href` plus a flag around the gate's own Back. One path, chosen by D1.
- **Gated route:** show the gate (ported from v1): "What are you here for?", a search box, a Messages button. While it is up, mute and pause every video, including ones that start later: `play` does not bubble but can be captured, so one capturing `play` listener on `document` catches all of them. Stop key, wheel and touch events inside the gate from reaching the page. Caveat for the port: listeners the page registers on `window` or `document` in the capture phase still run first, so the gate can only stop bubble-phase handlers. Check that TikTok's arrow keys do not move the feed under an open gate.
- **One video per tap:** on a push or replace navigation where both the old and the new URL are video URLs with different ids, show the gate with a Back button (`history.back()`). Traverse navigations never trigger it, so the gate's own Back cannot loop. Fresh loads and arrivals from search, DMs or a profile pass, because the previous URL is not a video URL. Ids, not URLs: TikTok appends `?q=&t=` from search, and both sites `replaceState` the same path right after load [observed].
- **Hiding nav links:** CSS through `GM.addStyle`, every rule `!important` (1.5), keyed on `data-e2e` for TikTok and exact `href` for Instagram.
- **Rewriting a nav link:** changing an SPA link's `href` does not change where it goes, because the router's click handler pushes the route from its own state [inferred]. A rewrite is a capturing `click` listener on `document` that matches the link, calls `preventDefault()` and `stopPropagation()`, and navigates with `location.assign()`. Capturing at `document` runs before React's handlers on its root container.
- **Matching:** `@match https://www.tiktok.com/*` and `@match https://www.instagram.com/*`. Every final URL observed was on `www`.
- **CSP:** not a problem. Instagram's `style-src` allows `'unsafe-inline'`, TikTok's policy is permissive, and `GM.addStyle` goes through `tabs.insertCSS`, which page CSP does not govern [observed headers].

## 6. Open questions

### 6.1 Blocking Phase 2

1. **The rest of the spec.** What I received ends at "Metadata: @inject-into content, @run-at document-start, @noframes, @grant GM.addStyle,". Please paste the remainder, including the per-site sections that the nav-link rule refers to. Where they disagree with section 5, they win.
2. **v1.** `tiktok-no-feed.user.js` is not in `no-scroll` (no commits and no files, locally or on GitHub). Phase 2 ports its gate, so please add it or paste it.

### 6.2 Decisions for you

3. **TikTok in desktop mode for good?** Logged out, the mobile layout has neither DMs nor web search (2.1). If D2 shows the same logged in, I would write the TikTok script for the desktop layout and give the mobile layout route gating only.
4. **TikTok launcher target.** `/messages` (needs desktop mode) or `/`, which lands on the gate with search and Messages. I lean `/messages`: it skips loading the For You feed under the gate.
5. **In-feed reels: hide or placeholder?** My default is to hide them outright, switching to a one-line placeholder if hiding makes the feed jump or load endlessly.
6. **Launcher icons.** No `apple-touch-icon` (iOS generates one) or two plain neutral PNGs? I would start with none and look at what iOS shows.
7. **CSP on the Vercel pages.** A `Content-Security-Policy` header would turn "no third-party requests" into a browser-enforced rule, at the cost of one more header to keep correct. I would skip it unless you want the guarantee.

### 6.3 Rule calls (my defaults, overridable)

8. TikTok `/@<user>/live` (one LIVE room): gate, since it leads into recommended streams.
9. TikTok `/tag/<x>` and `/music/<x>` grids: allow, as search-like destinations.
10. TikTok photo posts count as videos for one video per tap, since they sit in the same swipe stream.
11. Instagram `/<user>/reels/` (a profile's Reels grid): allow. Opening one reel from it is fine; one video per tap stops reel-to-reel from there.
12. Instagram `/p/` to `/p/` moves (the desktop post modal's arrows, logged in) never gate, because a `/p/` URL may be a photo.
13. Tapping a "More posts" tile under a reel shows the gate: the rule is URL-based and cannot tell a tap from a swipe.

## 7. Bosco verifies on device

Everything here needs a logged-in account or a real iPhone, so I could not observe it. Send back what each item asks for; the answers settle the selectors and the open rules.

### 7.0 Web Inspector setup (once)

1. iPhone: Settings > Apps > Safari > Advanced > Web Inspector: on.
2. Mac: Safari > Settings > Advanced > "Show features for web developers": on.
3. Connect the iPhone by cable, unlock it, and tap Trust if asked.
4. Open the page in Safari on the iPhone. On the Mac: Develop menu > (your iPhone) > the tab. Use the Console tab for the snippets below. To inspect something, use the Elements tab's element-selection crosshair and tap the thing on the phone.

URL logger, used by several checks. Paste it after the page loads, then interact; every URL change is logged, with the history entry type when the Navigation API exists:

```js
(() => {
  let last = location.href;
  console.log("start", last, "history.length", history.length, "navigation:", typeof navigation);
  if (typeof navigation === "object") navigation.addEventListener("navigate", e => console.log("navigate", e.navigationType, e.destination.url));
  setInterval(() => { if (location.href !== last) { console.log("url", last, "->", location.href, "history.length", history.length); last = location.href; } }, 200);
})();
```

### 7.1 Both sites

- **D1. iOS version and Navigation API.** Settings > General > About for the iOS version; in the console, `typeof navigation`. Send both.

### 7.2 TikTok

- **D2. DMs and search per layout.** Logged in, in the normal mobile layout: open the Inbox tab (`/inbox`); can you open a DM thread? Search for a word; do results show, or does it try to open the app? Then AA > Request Desktop Website and open `https://www.tiktok.com/messages`: does the inbox work? Send the final URLs.
- **D3. Nav links in desktop mode.** Run:
  ```js
  [...document.querySelectorAll('a[href]')].filter(a => /^\/(|foryou|following|friends|explore|live|messages)(\?|$)/.test(a.getAttribute('href'))).map(a => [a.getAttribute('href'), a.dataset.e2e, a.getAttribute('aria-label'), a.textContent.trim().slice(0, 30)])
  ```
  Send the output.
- **D4. Video to video in desktop mode.** Paste the URL logger, then: (a) open a search result and use its next arrow; (b) in the same overlay, open an item from "Creator videos" or "You may like"; (c) open a video from a profile grid and use whatever next control appears. Send the log lines: does the URL change per video, and does `history.length` grow (push) or stay (replace)?

### 7.3 Instagram

- **D5. Reels in the home feed (spec item 3).** On `https://www.instagram.com/`, scroll until you have passed at least one reel and one photo, then run:
  ```js
  copy(JSON.stringify([...document.querySelectorAll('article')].map((a, i) => ({
    i,
    links: [...new Set([...a.querySelectorAll('a[href]')].map(x => x.getAttribute('href')).filter(h => /\/(p|reel|reels)\//.test(h)))],
    timeLink: a.querySelector('a[href] time')?.closest('a').getAttribute('href'),
    videos: a.querySelectorAll('video').length,
    labels: [...a.querySelectorAll('[aria-label]')].map(x => x.getAttribute('aria-label')).filter(l => /reel|clip|video|audio/i.test(l)),
    text: a.innerText.slice(0, 60).replace(/\s+/g, ' ')
  })), null, 1))
  ```
  It copies the result to the clipboard; paste it to me and say which items were reels on screen. If it prints `[]`, feed items are not `<article>` on mobile web: select one whole post with the crosshair, walk up to the element that wraps exactly one post, and send its tag and attributes.
- **D6. Suggested-reels modules.** With a "Suggested reels" strip (or similar) on screen, run:
  ```js
  [...document.querySelectorAll('main a[href*="/reel"]')].filter(a => !a.closest('article')).map(a => a.getAttribute('href'))
  ```
  Then select the strip's outermost container with the crosshair and send its tag, its attributes, and where it sits relative to the posts around it.
- **D7. One reel, then swipe.** Open a reel from a DM. Paste the URL logger and try to swipe up. Can you reach another reel, and what does the URL do?
- **D8. Search URLs.** Tap the search or explore tab: URL? Tap into the search field: URL? Type a word and submit: URL? Open a hashtag result: URL?
- **D9. Nav links.** Run:
  ```js
  [...document.querySelectorAll('a[href]')].filter(a => /^\/((reels|explore|direct)\/|\?|$)/.test(a.getAttribute('href'))).map(a => [a.getAttribute('href'), a.getAttribute('aria-label'), a.querySelector('svg')?.getAttribute('aria-label')])
  ```
  once on the home feed and once in a DM thread. Send both outputs.
- **D10. Profile grid.** Open a profile and tap a reel tile, then a photo tile: what URL does each open, and is there a next control? Paste the URL logger first and send its lines.

### 7.4 After the Phase 2 deploy

- **D11. Install prompt.** Open `https://<domain>/tiktok-no-feed.user.js`: the source shows as text, not a download prompt. AA > Userscripts then shows "Tap to install". If it says "Fetching failed", allow Userscripts on the Vercel site and retry.
- **D12. Update flow.** After a version bump is deployed: popup > Updates icon > Check Updates lists the script, Update applies it, and the next page load logs the new version.
- **D13. Home Screen.** Add `/tiktok` with "Open as Web App" off. Launching it opens a Safari tab on tiktok.com, and the console shows `Injecting: ...`. Optionally add a second copy with the toggle on and confirm the script does not run there, so we know the install page's warning is real.

## Sources

- Userscripts: [README](https://github.com/quoid/userscripts), [issue #248](https://github.com/quoid/userscripts/issues/248), [issue #836](https://github.com/quoid/userscripts/issues/836), [issue #894](https://github.com/quoid/userscripts/issues/894), [PR #620](https://github.com/quoid/userscripts/pull/620), [v4.8.6 source](https://github.com/quoid/userscripts/tree/v4.8.6) (`src/ext/action-popup/App.svelte`, `src/ext/background/main.js`, `src/ext/content-scripts/entry-userscripts.js`, `xcode/Ext-Safari/Functions.swift`, `xcode/Ext-Safari/SafariWebExtensionHandler.swift`).
- Vercel: [vercel.json](https://vercel.com/docs/project-configuration/vercel-json), [Configuring a Build](https://vercel.com/docs/builds/configure-a-build), [System environment variables](https://vercel.com/docs/environment-variables/system-environment-variables), [Vercel Toolbar](https://vercel.com/docs/vercel-toolbar/managing-toolbar), [Deployment Protection](https://vercel.com/docs/deployment-protection), [Preview deployments and noindex](https://vercel.com/kb/guide/are-vercel-preview-deployment-indexed-by-search-engines), [community thread on Content-Type in vercel.json](https://community.vercel.com/t/vercel-functions-content-type-header-in-vercel-json-not-working/334).
- iOS and WebKit: [heise on iOS 26 web apps](https://heise.de/-10749652), [Apple developer forum thread 715634](https://developer.apple.com/forums/thread/715634), [WebKit bug 258384 (Navigation API)](https://bugs.webkit.org/show_bug.cgi?id=258384).
- Probe evidence (JSON logs, screenshots, DOM snapshots) stayed in the session scratchpad and is not committed.

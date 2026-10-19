// ==UserScript==
// @name         nofeed TikTok
// @description  TikTok for messages and search only: the feeds send you to search.
// @version      1.0.2
// @match        https://www.tiktok.com/*
// @inject-into  content
// @run-at       document-start
// @noframes
// @grant        GM.addStyle
// @updateURL    https://nofeed-bosco.vercel.app/tiktok-no-feed.meta.js
// @downloadURL  https://nofeed-bosco.vercel.app/tiktok-no-feed.user.js
// ==/UserScript==

const TIKTOK = "https://www.tiktok.com";
const SEARCH_URL = `${TIKTOK}/search`;

const FEED_ROUTES = [
  ["for-you", /^\/(foryou)?$/i],
  ["following", /^\/following$/i],
  ["friends", /^\/friends$/i],
  ["explore", /^\/explore$/i],
  ["discover", /^\/discover(\/.*)?$/i],
  ["live", /^\/live(\/.*)?$/i],
  ["live-room", /^\/@[^/]+\/live$/i],
];

function routePath(url) {
  return new URL(url, TIKTOK).pathname.replace(/\/+$/, "") || "/";
}

function classify(url) {
  const path = routePath(url);
  const feed = FEED_ROUTES.find(([, pattern]) => pattern.test(path));
  return feed ? { rule: "redirect", name: feed[0] } : { rule: "allow", name: "default" };
}

function videoId(url) {
  const match = routePath(url).match(/^\/@[^/]+\/(?:video|photo)\/(\d+)$/);
  return match ? match[1] : null;
}

function isSwipe(fromUrl, toUrl, navigationType) {
  if (!fromUrl || navigationType === "traverse") return false;
  const from = videoId(fromUrl);
  const to = videoId(toUrl);
  return from !== null && to !== null && from !== to;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { classify, videoId, isSwipe, SEARCH_URL };
}

function main() {
  addStyle(`${BADGE_CSS}
a[data-e2e="nav-foryou"], a[data-e2e="nav-following"], a[data-e2e="nav-friends"],
a[data-e2e="nav-explore"], a[data-e2e="nav-live"], a[data-e2e="tiktok-logo"],
a[data-e2e="home-icon"], a[data-e2e="discover-icon"],
a[href="/foryou"], a[href^="/foryou?"], a[href="/following"], a[href^="/following?"],
a[href="/friends"], a[href^="/friends?"], a[href="/explore"], a[href^="/explore?"],
a[href="/discover"], a[href^="/discover?"], a[href="/live"], a[href^="/live?"] {
  display: none !important;
}`);

  const badge = element("div", { id: "nofeed-badge" });
  let currentUrl = location.href;

  window.addEventListener("popstate", () => onUrlChange("traverse"));
  setInterval(() => onUrlChange("push"), 200);
  render(null, currentUrl, "load");

  function onUrlChange(navigationType) {
    if (location.href === currentUrl) return;
    const fromUrl = currentUrl;
    currentUrl = location.href;
    render(fromUrl, currentUrl, navigationType);
  }

  function render(fromUrl, toUrl, navigationType) {
    const route = classify(toUrl);
    if (route.rule === "redirect") {
      leaveFor(SEARCH_URL);
    } else if (isSwipe(fromUrl, toUrl, navigationType)) {
      leaveFor(fromUrl);
    } else {
      showBadge(toUrl, `${route.rule}: ${route.name}`);
    }
  }

  function showBadge(url, label) {
    if (!debugEnabled()) return;
    badge.textContent = `${routePath(url)} | ${label}`;
    if (!badge.isConnected) document.documentElement.append(badge);
  }
}

function leaveFor(url) {
  for (const media of document.querySelectorAll("video, audio")) {
    media.muted = true;
    media.pause();
  }
  location.replace(url);
}

function debugEnabled() {
  try {
    if (location.hash.includes("nofeed-debug")) sessionStorage.setItem("nofeed-debug", "on");
    return sessionStorage.getItem("nofeed-debug") === "on";
  } catch {
    return false;
  }
}

function addStyle(css) {
  const fallback = () => (document.head || document.documentElement).append(element("style", {}, css));
  if (typeof GM !== "undefined" && GM.addStyle) GM.addStyle(css).catch(fallback);
  else fallback();
}

function element(tag, attributes = {}, text = "") {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text) node.textContent = text;
  return node;
}

const BADGE_CSS = `
#nofeed-badge {
  all: initial !important;
  position: fixed !important;
  left: 8px !important;
  bottom: 8px !important;
  z-index: 2147483647 !important;
  max-width: calc(100vw - 16px) !important;
  overflow: hidden !important;
  padding: 4px 8px !important;
  border-radius: 6px !important;
  background: rgba(0, 0, 0, 0.8) !important;
  color: #fff !important;
  font: 12px/1.3 ui-monospace, Menlo, monospace !important;
  white-space: nowrap !important;
  text-overflow: ellipsis !important;
  pointer-events: none !important;
}
`;

if (typeof document !== "undefined") {
  main();
}

// ==UserScript==
// @name         nofeed Instagram
// @description  Instagram without Reels: the Reels tab and Explore sit behind a gate, and reels leave the home feed.
// @version      1.0.1
// @match        https://www.instagram.com/*
// @inject-into  content
// @run-at       document-start
// @noframes
// @grant        GM.addStyle
// @updateURL    https://nofeed-bosco.vercel.app/instagram-no-reels.meta.js
// @downloadURL  https://nofeed-bosco.vercel.app/instagram-no-reels.user.js
// ==/UserScript==

const INSTAGRAM = "https://www.instagram.com";

const GATED_ROUTES = [
  ["reels", /^\/reels(\/.*)?$/i],
  ["explore", /^\/explore$/i],
];

function routePath(url) {
  return new URL(url, INSTAGRAM).pathname.replace(/\/+$/, "") || "/";
}

function classify(url) {
  const path = routePath(url);
  const gated = GATED_ROUTES.find(([, pattern]) => pattern.test(path));
  if (gated) return { rule: "gate", name: gated[0] };
  return { rule: "allow", name: path === "/" ? "home feed, reels hidden" : "default" };
}

function rewriteHref(href) {
  const url = new URL(href, INSTAGRAM);
  return url.origin === INSTAGRAM && routePath(url.href) === "/explore" ? `${INSTAGRAM}/explore/search/` : null;
}

function videoId(url) {
  const match = routePath(url).match(/^\/(?:[^/]+\/)?reels?\/([\w-]+)$/);
  return match ? match[1] : null;
}

function isSwipe(fromUrl, toUrl, navigationType) {
  if (!fromUrl || navigationType === "traverse") return false;
  const from = videoId(fromUrl);
  const to = videoId(toUrl);
  return from !== null && to !== null && from !== to;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { classify, rewriteHref, videoId, isSwipe };
}

const REEL_LINK = 'a[href*="/reel/"], a[href^="/reels/"]:not([href="/reels/"]):not([href^="/reels/audio/"])';

function main() {
  addStyle(`${GATE_CSS}
a[href="/reels/"], a[href="/reels"], [data-nofeed-reel] {
  display: none !important;
}`);

  const gate = buildGate();
  const badge = element("div", { id: "nofeed-badge" });
  let currentUrl = location.href;
  let gated = false;
  let scanQueued = false;

  document.addEventListener(
    "play",
    (event) => {
      if (gated && event.target instanceof HTMLMediaElement) silence(event.target);
    },
    true,
  );
  document.addEventListener(
    "click",
    (event) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      const target = link && rewriteHref(link.getAttribute("href"));
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      location.assign(target);
    },
    true,
  );
  new MutationObserver(queueFeedScan).observe(document.documentElement, { childList: true, subtree: true });
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
    let label = `${route.rule}: ${route.name}`;
    if (route.rule === "gate") {
      showGate(false);
    } else if (isSwipe(fromUrl, toUrl, navigationType)) {
      showGate(true);
      label = "gate: one video per tap";
    } else {
      hideGate();
    }
    showBadge(toUrl, label);
    queueFeedScan();
  }

  function queueFeedScan() {
    if (scanQueued || routePath(location.href) !== "/") return;
    scanQueued = true;
    setTimeout(() => {
      scanQueued = false;
      if (routePath(location.href) === "/") hideFeedReels();
    }, 100);
  }

  function showGate(withBack) {
    gated = true;
    gate.back.hidden = !withBack;
    document.documentElement.setAttribute("data-nofeed-gate", "");
    if (!gate.root.isConnected) document.documentElement.append(gate.root);
    document.querySelectorAll("video, audio").forEach(silence);
  }

  function hideGate() {
    gated = false;
    document.documentElement.removeAttribute("data-nofeed-gate");
    gate.root.remove();
  }

  function showBadge(url, label) {
    if (!debugEnabled()) return;
    badge.textContent = `${routePath(url)} | ${label}`;
    if (!badge.isConnected) document.documentElement.append(badge);
  }
}

function hideFeedReels() {
  const reels = new Set();
  for (const article of document.querySelectorAll("article")) {
    if (article.querySelector(REEL_LINK)) reels.add(article);
  }
  for (const link of document.querySelectorAll(REEL_LINK)) {
    if (link.closest("article")) continue;
    const block = feedBlock(link);
    if (block) reels.add(block);
  }
  for (const node of document.querySelectorAll("[data-nofeed-reel]")) {
    if (!reels.has(node)) node.removeAttribute("data-nofeed-reel");
  }
  for (const node of reels) node.setAttribute("data-nofeed-reel", "");
}

function feedBlock(link) {
  for (let node = link; node.parentElement && node.parentElement !== document.body; node = node.parentElement) {
    for (const sibling of node.parentElement.children) {
      if (sibling !== node && (sibling.tagName === "ARTICLE" || sibling.querySelector("article"))) return node;
    }
  }
  return null;
}

function buildGate() {
  const root = element("div", { id: "nofeed-gate", role: "dialog", "aria-modal": "true", "aria-labelledby": "nofeed-title" });
  const panel = element("div", { class: "nofeed-panel" });
  const form = element("form", { role: "search" });
  const input = element("input", {
    type: "search",
    name: "q",
    placeholder: "Search Instagram",
    "aria-label": "Search Instagram",
    enterkeyhint: "search",
    autocomplete: "off",
  });
  form.append(input, element("button", { type: "submit" }, "Search"));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (query) location.assign(`${INSTAGRAM}/explore/search/keyword/?q=${encodeURIComponent(query)}`);
  });
  const back = element("button", { type: "button", class: "nofeed-secondary" }, "Back");
  back.addEventListener("click", () => history.back());
  panel.append(
    element("h1", { id: "nofeed-title" }, "What are you here for?"),
    form,
    element("a", { href: `${INSTAGRAM}/direct/inbox/`, class: "nofeed-secondary" }, "Messages"),
    element("a", { href: `${INSTAGRAM}/`, class: "nofeed-secondary" }, "Home"),
    back,
  );
  root.append(panel);
  for (const type of ["keydown", "keypress", "keyup", "wheel", "touchstart", "touchmove", "touchend", "touchcancel"]) {
    root.addEventListener(type, (event) => event.stopPropagation());
  }
  return { root, back };
}

function silence(media) {
  media.muted = true;
  media.pause();
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

const GATE_CSS = `
#nofeed-gate {
  all: initial !important;
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483647 !important;
  display: flex !important;
  box-sizing: border-box !important;
  padding: 24px !important;
  overflow-y: auto !important;
  overscroll-behavior: contain !important;
  background: #121212 !important;
  color: #f1f1f1 !important;
  font: 18px/1.4 -apple-system, BlinkMacSystemFont, system-ui, sans-serif !important;
}
#nofeed-gate .nofeed-panel {
  display: flex !important;
  flex-direction: column !important;
  gap: 14px !important;
  width: 100% !important;
  max-width: 420px !important;
  margin: auto !important;
}
#nofeed-gate h1 {
  margin: 0 0 6px !important;
  color: #f1f1f1 !important;
  font: 700 28px/1.2 -apple-system, BlinkMacSystemFont, system-ui, sans-serif !important;
}
#nofeed-gate form {
  display: flex !important;
  gap: 8px !important;
  margin: 0 !important;
}
#nofeed-gate input {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  height: 52px !important;
  box-sizing: border-box !important;
  margin: 0 !important;
  padding: 0 14px !important;
  border: 1px solid #444 !important;
  border-radius: 12px !important;
  background: #1e1e1e !important;
  color: #f1f1f1 !important;
  font: 18px -apple-system, BlinkMacSystemFont, system-ui, sans-serif !important;
  -webkit-appearance: none !important;
  appearance: none !important;
}
#nofeed-gate button, #nofeed-gate a {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-sizing: border-box !important;
  min-height: 52px !important;
  margin: 0 !important;
  padding: 0 18px !important;
  border: 0 !important;
  border-radius: 12px !important;
  background: #e2b866 !important;
  color: #121212 !important;
  font: 600 18px -apple-system, BlinkMacSystemFont, system-ui, sans-serif !important;
  text-decoration: none !important;
  cursor: pointer !important;
}
#nofeed-gate .nofeed-secondary {
  border: 1px solid #444 !important;
  background: #1e1e1e !important;
  color: #f1f1f1 !important;
}
#nofeed-gate [hidden] {
  display: none !important;
}
html[data-nofeed-gate], html[data-nofeed-gate] body {
  overflow: hidden !important;
}
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

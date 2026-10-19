const test = require("node:test");
const assert = require("node:assert/strict");
const { classify, landingUrl, videoId, isSwipe } = require("../public/tiktok-no-feed.user.js");

const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const DESKTOP_MODE = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

const FEEDS = {
  "/": "for-you",
  "/?lang=en": "for-you",
  "https://www.tiktok.com/": "for-you",
  "/foryou": "for-you",
  "/foryou/": "for-you",
  "/foryou?lang=en": "for-you",
  "/following": "following",
  "/following?lang=en": "following",
  "/friends": "friends",
  "/explore": "explore",
  "/explore/": "explore",
  "/discover": "discover",
  "/discover/funny-cat-videos": "discover",
  "/live": "live",
  "/live/following": "live",
  "/live/gaming?lang=en": "live",
  "/@someone/live": "live-room",
  "/@someone/live/": "live-room",
};

const ALLOWED = [
  "/messages",
  "/messages?lang=en",
  "/inbox",
  "/search?q=cats",
  "/search?q=cats&t=1792391135969",
  "/search/user?q=cats",
  "/search/video?q=cats",
  "/search/photo?q=cats",
  "/@someone",
  "/@someone/",
  "/@someone/video/7676784488923401486",
  "/@someone/video/7676784488923401486?q=cats&t=1792391135969",
  "/@someone/photo/7676784488923401486",
  "/@livestreamer",
  "/livestream-tips",
  "/tag/cats",
  "/music/original-sound-7123456789",
  "/login?redirect_url=https%3A%2F%2Fwww.tiktok.com%2Fmessages",
  "/tiktokstudio/upload?from=webapp&tab=video",
];

test("sends the feed routes to search, ignoring trailing slashes and query strings", () => {
  for (const [url, name] of Object.entries(FEEDS)) {
    assert.deepEqual(classify(url), { rule: "redirect", name }, url);
  }
});

test("lands on Messages in desktop mode and on search in the phone layout", () => {
  assert.equal(landingUrl(DESKTOP_MODE), "https://www.tiktok.com/messages");
  assert.equal(landingUrl(PHONE), "https://www.tiktok.com/search");
});

test("never redirects a landing page, so the redirect cannot loop", () => {
  for (const userAgent of [PHONE, DESKTOP_MODE]) {
    assert.deepEqual(classify(landingUrl(userAgent), userAgent), { rule: "allow", name: "default" }, userAgent);
  }
});

test("desktop mode sends the empty search page to Messages, but keeps real searches", () => {
  assert.deepEqual(classify("/search", DESKTOP_MODE), { rule: "redirect", name: "empty-search" });
  assert.deepEqual(classify("/search?q=", DESKTOP_MODE), { rule: "redirect", name: "empty-search" });
  assert.deepEqual(classify("/search?q=cats&t=1792391135969", DESKTOP_MODE), { rule: "allow", name: "default" });
  assert.deepEqual(classify("/search/user?q=cats", DESKTOP_MODE), { rule: "allow", name: "default" });
  assert.deepEqual(classify("/search", PHONE), { rule: "allow", name: "default" });
});

test("feed routes redirect in both layouts", () => {
  for (const userAgent of [PHONE, DESKTOP_MODE]) {
    assert.equal(classify("/foryou", userAgent).rule, "redirect", userAgent);
  }
});

test("allows messages, search, profiles, posts and everything else", () => {
  for (const url of ALLOWED) {
    assert.deepEqual(classify(url), { rule: "allow", name: "default" }, url);
  }
});

test("reads the id from video and photo URLs only", () => {
  assert.equal(videoId("/@someone/video/123"), "123");
  assert.equal(videoId("/@someone/video/123/?q=cats&t=1"), "123");
  assert.equal(videoId("https://www.tiktok.com/@someone/photo/456"), "456");
  assert.equal(videoId("/@someone"), null);
  assert.equal(videoId("/search?q=cats"), null);
  assert.equal(videoId("/foryou"), null);
});

test("swipe rule: an in-place move from one video to another", () => {
  const first = "https://www.tiktok.com/@a/video/111?q=cats&t=1";
  const second = "https://www.tiktok.com/@b/video/222?q=cats&t=1";
  assert.equal(isSwipe(first, second, "push"), true);
  assert.equal(isSwipe(first, second, "replace"), true);
  assert.equal(isSwipe(first, "https://www.tiktok.com/@b/photo/333", "push"), true);
});

test("swipe rule: fresh loads, Back, and arrivals from other pages pass", () => {
  const video = "https://www.tiktok.com/@a/video/111";
  assert.equal(isSwipe(null, video, "load"), false);
  assert.equal(isSwipe("https://www.tiktok.com/@b/video/222", video, "traverse"), false);
  assert.equal(isSwipe("https://www.tiktok.com/search?q=cats&t=1", video, "push"), false);
  assert.equal(isSwipe("https://www.tiktok.com/messages", video, "push"), false);
  assert.equal(isSwipe("https://www.tiktok.com/@a", video, "push"), false);
  assert.equal(isSwipe(video, `${video}?q=cats`, "replace"), false);
  assert.equal(isSwipe(video, "https://www.tiktok.com/search?q=cats", "push"), false);
});

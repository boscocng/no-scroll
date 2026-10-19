const test = require("node:test");
const assert = require("node:assert/strict");
const { classify, videoId, isSwipe, SEARCH_URL } = require("../public/tiktok-no-feed.user.js");

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

test("never redirects the search page itself, so the redirect cannot loop", () => {
  assert.equal(SEARCH_URL, "https://www.tiktok.com/search");
  assert.deepEqual(classify(SEARCH_URL), { rule: "allow", name: "default" });
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

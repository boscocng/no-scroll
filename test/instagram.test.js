const test = require("node:test");
const assert = require("node:assert/strict");
const { classify, rewriteHref, videoId, isSwipe } = require("../public/instagram-no-reels.user.js");

const GATED = {
  "/reels/": "reels",
  "/reels": "reels",
  "/reels/DeewiSPpCrm/": "reels",
  "/reels/DeewiSPpCrm/?utm_source=ig_web_copy_link": "reels",
  "/reels/audio/1234567890/": "reels",
  "https://www.instagram.com/reels/": "reels",
  "/explore/": "explore",
  "/explore": "explore",
  "/explore/?hl=en": "explore",
};

const ALLOWED = [
  "/explore/search/",
  "/explore/search/keyword/?q=cats",
  "/explore/tags/cats/",
  "/explore/locations/213385402/london-united-kingdom/",
  "/popular/cats/?utm_source=explore_tag",
  "/direct/inbox/",
  "/direct/t/1234567890/",
  "/reel/DeewiSPpCrm/",
  "/reel/DeewiSPpCrm/?igsh=abc",
  "/instagram/reel/DeewiSPpCrm/",
  "/p/Ddwoj5kBk9X/",
  "/instagram/p/Ddwoj5kBk9X/",
  "/instagram/",
  "/instagram/reels/",
  "/instagram/tagged/",
  "/stories/instagram/3456789012345678901/",
  "/stories/highlights/17890000000000000/",
  "/accounts/edit/",
];

test("gates the Reels tab and the bare Explore page", () => {
  for (const [url, name] of Object.entries(GATED)) {
    assert.deepEqual(classify(url), { rule: "gate", name }, url);
  }
});

test("allows the home feed, with reels hidden", () => {
  for (const url of ["/", "/?variant=following", "https://www.instagram.com/"]) {
    assert.deepEqual(classify(url), { rule: "allow", name: "home feed, reels hidden" }, url);
  }
});

test("allows search, DMs, stories, posts, single reels and profiles", () => {
  for (const url of ALLOWED) {
    assert.deepEqual(classify(url), { rule: "allow", name: "default" }, url);
  }
});

test("rewrites links to Explore, and only those, to the search page", () => {
  const search = "https://www.instagram.com/explore/search/";
  assert.equal(rewriteHref("/explore/"), search);
  assert.equal(rewriteHref("/explore"), search);
  assert.equal(rewriteHref("/explore/?hl=en"), search);
  assert.equal(rewriteHref("https://www.instagram.com/explore/"), search);
  assert.equal(rewriteHref("/explore/search/"), null);
  assert.equal(rewriteHref("/explore/tags/cats/"), null);
  assert.equal(rewriteHref("/reels/"), null);
  assert.equal(rewriteHref("/"), null);
  assert.equal(rewriteHref("https://help.instagram.com/explore/"), null);
});

test("reads reel codes from every reel URL shape, and nothing else", () => {
  assert.equal(videoId("/reel/DeewiSPpCrm/"), "DeewiSPpCrm");
  assert.equal(videoId("/instagram/reel/DecLR_vvrW6/"), "DecLR_vvrW6");
  assert.equal(videoId("/some.user_name/reel/DeM-xDCA2W5/"), "DeM-xDCA2W5");
  assert.equal(videoId("/reels/DePb6WLuVae/"), "DePb6WLuVae");
  assert.equal(videoId("/reel/DeewiSPpCrm/?l=1"), "DeewiSPpCrm");
  assert.equal(videoId("/instagram/reels/"), null);
  assert.equal(videoId("/reels/"), null);
  assert.equal(videoId("/reels/audio/1234567890/"), null);
  assert.equal(videoId("/p/DeewiSPpCrm/"), null);
  assert.equal(videoId("/direct/inbox/"), null);
});

test("swipe rule: an in-place move from one reel to another", () => {
  const first = "https://www.instagram.com/reel/DeewiSPpCrm/";
  assert.equal(isSwipe(first, "https://www.instagram.com/instagram/reel/DecLR_vvrW6/", "push"), true);
  assert.equal(isSwipe(first, "https://www.instagram.com/reel/DecLR_vvrW6/", "replace"), true);
});

test("swipe rule: fresh loads, Back, and arrivals from DMs, search or profiles pass", () => {
  const reel = "https://www.instagram.com/reel/DeewiSPpCrm/";
  assert.equal(isSwipe(null, reel, "load"), false);
  assert.equal(isSwipe("https://www.instagram.com/reel/DecLR_vvrW6/", reel, "traverse"), false);
  assert.equal(isSwipe("https://www.instagram.com/direct/t/1234567890/", reel, "push"), false);
  assert.equal(isSwipe("https://www.instagram.com/explore/search/keyword/?q=cats", reel, "push"), false);
  assert.equal(isSwipe("https://www.instagram.com/instagram/reels/", reel, "push"), false);
  assert.equal(isSwipe(reel, `${reel}?l=1`, "push"), false);
  assert.equal(isSwipe(reel, "https://www.instagram.com/p/Ddwoj5kBk9X/", "push"), false);
});

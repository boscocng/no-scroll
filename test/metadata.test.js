const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DEPLOY_ORIGIN = "https://nofeed-bosco.vercel.app";
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const SCRIPTS = fs.readdirSync(PUBLIC_DIR).filter((name) => name.endsWith(".user.js")).sort();
const VERCEL = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));

function readMetadata(file) {
  const source = fs.readFileSync(path.join(PUBLIC_DIR, file), "utf8");
  const block = source.match(/^\/\/ ==UserScript==\n([\s\S]*?)\n\/\/ ==\/UserScript==\n/);
  assert.ok(block, `${file} starts with a metadata block`);
  const metadata = {};
  for (const line of block[1].split("\n")) {
    const [, key, value = ""] = line.match(/^\/\/ @([\w-]+)(?:\s+(.*))?$/) ?? [];
    if (key) (metadata[key] ??= []).push(value.trim());
  }
  return metadata;
}

test("public/ holds both userscripts", () => {
  assert.deepEqual(SCRIPTS, ["instagram-no-reels.user.js", "tiktok-no-feed.user.js"]);
});

for (const file of SCRIPTS) {
  const name = file.replace(/\.user\.js$/, "");
  const metadata = readMetadata(file);

  test(`${file} updates from the configured origin`, () => {
    assert.match(metadata.version?.[0] ?? "", /^\d+\.\d+\.\d+$/);
    assert.deepEqual(metadata.updateURL, [`${DEPLOY_ORIGIN}/${name}.meta.js`]);
    assert.deepEqual(metadata.downloadURL, [`${DEPLOY_ORIGIN}/${name}.user.js`]);
  });

  test(`${file} declares how it is injected`, () => {
    assert.equal(metadata.name?.length, 1);
    assert.ok(metadata.match?.length);
    assert.deepEqual(metadata["inject-into"], ["content"]);
    assert.deepEqual(metadata["run-at"], ["document-start"]);
    assert.deepEqual(metadata.noframes, [""]);
    assert.deepEqual(metadata.grant, ["GM.addStyle"]);
  });

  test(`${name}.meta.js serves the same file, so its header always matches`, () => {
    const rewrite = VERCEL.rewrites.find(({ source }) => source === `/${name}.meta.js`);
    assert.deepEqual(rewrite, { source: `/${name}.meta.js`, destination: `/${file}` });
    assert.equal(fs.existsSync(path.join(PUBLIC_DIR, `${name}.meta.js`)), false);
  });
}

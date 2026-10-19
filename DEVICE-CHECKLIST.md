# Device checklist

Run this on your iPhone once the site is live at https://nofeed-bosco.vercel.app. Each step says what you should see.

If a step doesn't match, turn on debug mode: add `#nofeed-debug` to the end of the address, tap Go, and a small badge appears in the bottom-left corner showing the page and the rule the script applied. It stays on in that tab until you close it. Send me the step number and a screenshot with the badge visible.

## 1. Setup

1. Install **Userscripts** from the App Store and open it once.
2. In Settings, go to Apps > Safari > Extensions > Userscripts. Turn it on and allow it on tiktok.com, instagram.com and nofeed-bosco.vercel.app.
3. In Safari, open https://nofeed-bosco.vercel.app.
4. Tap **Install the TikTok script**. You should see the script as plain text, not a download prompt.
5. Tap **AA** in the address bar, then **Userscripts**. You should see **Tap to install**. Tap it and confirm. The popup now lists **nofeed TikTok**.
6. Go back and do the same with **Install the Instagram script**. The popup now lists **nofeed Instagram** too.
7. Delete the TikTok and Instagram apps.

## 2. TikTok

1. On the install page, tap **TikTok launcher**, then Share > **Add to Home Screen**. Turn **Open as Web App** off, then tap Add. A slate icon with a "T" appears.
2. Tap the icon. Safari opens a dark page asking "What are you here for?"
3. Search for something. TikTok's search results open.
4. Go back to the launcher and tap **Messages**. Your inbox opens. If you get TikTok's feed or an "open the app" screen instead, open tiktok.com, tap **AA** > **Request Desktop Website**, and try again.
5. Open https://www.tiktok.com/ directly. You see the "What are you here for?" screen instead of the feed, and nothing plays. The same happens on /following, /friends, /explore and /live.
6. Look around TikTok's menus: For You, Explore, Following, Friends and LIVE are gone. Messages, Upload and your profile are still there.
7. Search for something, open a video, then move to the next one with the arrow or a swipe. The screen asks "What are you here for?" with a **Back** button. Back returns you to where you were.
8. Open a video someone sent you in Messages. It plays.

## 3. Instagram

1. On the install page, tap **Instagram launcher**. The page says "Add this to your Home Screen". Tap Share > **Add to Home Screen**, turn **Open as Web App** off, then tap Add. A green icon with "IG" appears.
2. Tap the icon. Instagram's home feed opens in Safari.
3. Scroll the feed for a minute:
   - Photo posts and carousels show as usual.
   - The stories tray at the top shows as usual.
   - No reels appear, and no "Suggested reels" strips.
4. The Reels icon is gone from the tab bar. Tapping the search icon opens the search page, not the Explore grid.
5. Open https://www.instagram.com/reels/. You see "What are you here for?" with Search, Messages and Home, and nothing plays. The same happens on https://www.instagram.com/explore/.
6. Tap a story. It plays as usual.
7. Open a reel someone sent you in DMs. It plays. If Instagram lets you swipe to another reel, the next one is replaced by "What are you here for?" with a **Back** button.
8. Open a profile and tap its Reels tab. The grid shows. Open a reel, then move to the next one. You get the **Back** screen.

## 4. If reels still show in the Instagram feed

This needs a Mac with Safari.

1. On the iPhone, go to Settings > Apps > Safari > Advanced and turn on **Web Inspector**.
2. On the Mac, open Safari > Settings > Advanced and turn on **Show features for web developers**.
3. Connect the iPhone with a cable, unlock it, and tap Trust if asked.
4. Open instagram.com on the iPhone and scroll until a reel is on screen.
5. On the Mac, choose Develop menu > your iPhone > the instagram.com tab. In the window that opens, click **Console**, paste this, and press Return:

   ```js
   copy(JSON.stringify([...document.querySelectorAll('article')].map((a, i) => ({
     i,
     links: [...new Set([...a.querySelectorAll('a[href]')].map(x => x.getAttribute('href')).filter(h => /\/(p|reel|reels)\//.test(h)))],
     timeLink: a.querySelector('a[href] time')?.closest('a').getAttribute('href'),
     videos: a.querySelectorAll('video').length,
     text: a.innerText.slice(0, 60).replace(/\s+/g, ' ')
   })), null, 1))
   ```

6. That copies the result. Paste it to me and say which items were reels on screen.

## 5. Updates

When I tell you a new version is live: open the Userscripts popup, tap the Updates icon, tap **Check Updates**, then **Update All**. Reload the page to run the new version.

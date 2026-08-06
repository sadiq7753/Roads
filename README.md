# The Long Way Round — Road Trip Log

A static, no-backend website for documenting road trips: an interactive map
that draws the actual driving route between each stop, with click-to-expand
details and photos. Built to run for free on GitHub Pages.

## What it does

- Plots every stop as a numbered pin, in date order.
- Draws the real road route from each stop to the next one (using the free
  OSRM routing service — falls back to a straight line if that's unreachable),
  rendered as a bold rust line with a pale casing so it stands out on the map.
- Click a pin (or a card in the sidebar log) to see notes and photos for that stop.
- A separate **admin page** lets you search for a place, auto-fill its
  coordinates, preview it on the map, and save it — with edit and delete
  for existing stops — directly to `stops-data.json`.

## File structure

```
index.html          public map + log — read only, this is what visitors see
admin.html           the editor — add / edit / delete stops (not linked from index.html)
admin.js              admin page logic (form, save/edit/delete, file saving)
map-app.js            shared map + sidebar + routing logic used by both pages
style.css             shared styling
stops-data.json         your trip data — this is the file the admin page writes to
images/
  sample-stop/        example folder — one subfolder per stop id (optional, see below)
```

## 1. Deploy to GitHub Pages

1. Create a new repository on GitHub (e.g. `road-trips`).
2. Upload all the files above (and the `images/` folder, if you're using it)
   to it (drag-and-drop on github.com works fine, or `git push` if you're
   comfortable with git).
3. In the repo: **Settings → Pages → Source**, select the `main` branch and
   `/ (root)` folder, then Save.
4. GitHub gives you a URL like `https://yourusername.github.io/road-trips/`
   within a minute or two. That's the page you share.

Your admin page will be at `https://yourusername.github.io/road-trips/admin.html`.
It isn't linked from anywhere on the public page — keep that URL to
yourself. **This is "security by obscurity", not real security** — anyone
who guesses or finds the URL can edit your trip. If that matters to you,
put the whole site behind GitHub's private-repo + Pages access controls,
or a tool like Cloudflare Access, rather than relying on the URL being secret.

No build step to install — it's plain HTML/JS loading Leaflet from a CDN.
One note: the data file is JSON, loaded with `fetch()`, which browsers
block on `file://` URLs. So the site needs to be served over http(s) to
work — GitHub Pages does this for you automatically. If you want to preview
locally before pushing, run a tiny local server in this folder first, e.g.
`python3 -m http.server` (then open `http://localhost:8000`), rather than
double-clicking `index.html`.

## 2. Adding, editing, and deleting stops

All of this happens on `admin.html`, working against your local clone of the
repo:

1. Open `admin.html` in Chrome or Edge (see note on browser support below).
2. Click **Connect stops-data.json** and pick the `stops-data.json` file inside
   your local repo folder. You only need to do this once per browser — it's
   remembered for next time (you may be asked to re-approve access).
3. Search for a place (or type coordinates directly), fill in date/notes/photos.
4. Click **Preview on map** to see the pin before committing to it.
5. Click **Save to stops-data.json** — this writes the change straight to the
   file on your disk. No download/replace step needed.
6. `git add stops-data.json && git commit -m "add stop" && git push` to publish.

**Editing:** click **Edit** on any card in the sidebar log — the form fills
in with that stop's data. Change what you like and click **Save changes**
(or **Cancel edit** to back out without saving).

**Deleting:** click **Delete** on a card. After confirming, it's removed
from the map and written to `stops-data.json` immediately.

### Browser support for direct saving

Direct-to-disk saving uses the File System Access API, which Chrome and
Edge support. In other browsers (Firefox, Safari), **Save** and **Delete**
will instead download a replacement `stops-data.json` for you to manually
drop into your repo — everything else on the admin page still works.

## 3. Adding photos

You have two options, and can mix both across stops:

**A. Paste an image link (recommended)** — upload your photo to any image
host or CDN (Imgur, Cloudinary, a personal S3/R2 bucket, etc.), then paste
the URL into the **Photo links** field on the admin page, comma-separated
for multiple photos. Nothing to add to the repo.

**B. Store the file in the repo** — make a folder `images/<stop-id>/` (the
`id` you gave the stop), drop your image files in there, then list just the
filenames (not full URLs) in the same **Photo links** field, e.g.
`sunrise.jpg, campsite.jpg`. Push to GitHub — they'll show as thumbnails.

Keep images reasonably sized (under ~1–2MB each) so the map stays fast.

## Notes / limits

- Routing uses the public OSRM demo server, which is free but rate-limited
  and not guaranteed for heavy use. For a very active site, you could swap
  in a paid routing API (OpenRouteService, Mapbox) by changing the
  `fetchRoute` function in `map-app.js`.
- Place search uses OpenStreetMap's Nominatim — also free, also
  rate-limited, fine for occasional use while adding stops.
- Everything (map tiles, routing, geocoding, saving) runs client-side in
  the visitor's/your browser, so there's nothing to host beyond static files.

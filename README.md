# Bird Atlas

A Jekyll website that displays bird sighting locations on an interactive map (Leaflet.js + OpenStreetMap), with the ability to filter markers by a date range.

## How it works

- Locations are stored in [`_data/locations.yml`](_data/locations.yml). Each entry has a `name`, `lat`, `lng`, `date` (YYYY-MM-DD), and `description`.
- Jekyll injects this data as JSON into the homepage, where [`assets/js/map.js`](assets/js/map.js) renders it on a Leaflet map.
- Use the **From** / **To** date pickers and click **Filter** to only show markers within that date range. Click **Reset** to show all locations again.

## Adding locations

Edit `_data/locations.yml` and add a new entry, for example:

```yaml
- name: "New Sighting"
  lat: 38.7223
  lng: -9.1393
  date: 2024-09-15
  description: "Spotted a stork near Lisbon."
```

Commit the change and the site will rebuild automatically (if using GitHub Pages) or you can rebuild locally.

## Running locally

```bash
bundle install
bundle exec jekyll serve
```

Then open http://localhost:4000 in your browser.

## Deploying with GitHub Pages

1. Go to the repository **Settings > Pages**.
2. Under **Build and deployment**, set **Source** to "Deploy from a branch".
3. Select the `main` branch and `/ (root)` folder, then save.
4. Your site will be published at `https://ricardo-jorge-lopes-lab-res.github.io/birdatlas/` (note: this repository is currently **private**, so you'll need GitHub Pages with a plan that supports private repo Pages, or make the repository public for Pages to work on the free tier).

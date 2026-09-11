# Bird Specimens in Portuguese Museum Collections

A three-tab site presenting 3,460 georeferenced bird specimen records from
MCUC, MHNCUP and MUHNAC, built with [Leaflet](https://leafletjs.com/).
Static HTML/CSS/JS with no build step — it runs as-is on GitHub Pages.

## Tabs

**Map** — every record drawn individually (no clustering), coloured by museum.
Filter by museum, order, family, genus and species; the taxonomic dropdowns
cascade, so choosing an order narrows the families below it and so on. A year
slider covers 1840–2017. The extent button in the top-left corner fits the view
to whatever records currently pass the filters.

The map opens on mainland Portugal. Records from Madeira, the Azores and the
Selvagens lie far to the west, so fitting everything on load would squeeze the
mainland into a corner; the extent button brings them in on demand.

**Records** — the same data as a sortable table. Click any column header to
sort, search across species, locality, county and museum, page through results,
and download the current selection as CSV (including coordinates).

**Team & acknowledgements** — project description, participating collections,
team, acknowledgements and citation. The placeholder blocks are marked in the
HTML with `class="placeholder-note"` and `class="fill-in"`; replace those and
delete the notes.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and all written content |
| `style.css` | Styling |
| `app.js` | Tabs, map, filters, table |
| `points.geojson` | The 3,460 specimen records |

## Running locally

The page loads `points.geojson` with `fetch()`, which browsers block for
`file://` URLs. Opening `index.html` by double-clicking it will show an error
banner. Serve it over HTTP instead:

```bash
cd path/to/this/folder
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Make sure you run the command from the folder
that contains `index.html`, not from its parent.

## Publishing on GitHub Pages

1. Create a repository and push these four files to its root.
2. Go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to "Deploy from a branch", then
   choose your branch (usually `main`) and the `/root` folder.
4. Save. The site appears at `https://<username>.github.io/<repo>/` after a
   minute or two.

## A note on the taxonomy

Ten records arrived with nonstandard capitalisation in `scientificName` — a
lowercase genus (`aegithalos caudatus`, `aythya`) or a capitalised specific
epithet (`Pyrrhula Pyrrhula`, `Limosa Limosa`). Left alone these split one taxon
across two dropdown entries, so the names were regularised to conventional
binomial form. The original spelling is preserved per record as
`scientificNameVerbatim`. This reduced the distinct species count from 341 to
338 and genera from 205 to 203.

`genus` is derived from the first word of `scientificName`.

## Regenerating the data

If the source spreadsheet changes, rebuild `points.geojson` with
[openpyxl](https://openpyxl.readthedocs.io/):

```python
import json, openpyxl

wb = openpyxl.load_workbook("data_museums.xlsx", data_only=True)
ws = wb["Sheet1"]

features = []
for row in ws.iter_rows(min_row=2, values_only=True):
    (museum, occ_id, n, sciname, order, family,
     locality, lat, lon, unc, county, year) = row

    props = {
        "museum": museum, "occurrenceID": occ_id, "family": family,
        "order": order, "locality": locality, "county": county,
        "coordUncertaintyM": unc,
    }

    # regularise the binomial: Genus capitalised, epithet lowercase
    parts = sciname.split()
    if len(parts) == 2:
        normalised = parts[0].capitalize() + " " + parts[1].lower()
        if normalised != sciname:
            props["scientificNameVerbatim"] = sciname
        sciname = normalised
    props["scientificName"] = sciname
    props["genus"] = sciname.split()[0]

    try:
        props["year"] = int(year)
    except (TypeError, ValueError):
        props["year"] = None

    features.append({
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
        "properties": props,
    })

with open("points.geojson", "w", encoding="utf-8") as fh:
    json.dump({"type": "FeatureCollection", "features": features}, fh,
              ensure_ascii=False, separators=(",", ":"))
```

Update the four figures in the header of `index.html` if the totals change.

## Dependencies

Loaded from CDN at runtime, so nothing to install: Leaflet 1.9.4,
noUiSlider 15.7.1, and Spectral + IBM Plex Sans from Google Fonts. Base map
tiles come from OpenStreetMap — keep the attribution in place.

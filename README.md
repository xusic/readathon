# Yu Ming Readathon dashboard

Run the local site with `run-local.bat`. It opens at http://localhost:4173/.

## Adding dated data files

1. Copy the original school export into `data/` using a filename such as `2026_11_15.csv`.
2. While the local server is running, it automatically creates or refreshes a sanitized version in `site-data/`. If the server is stopped, it sanitizes existing files the next time it starts. You can also run `node prepare-data.mjs` to generate the sanitized files on demand.
3. Keep `site-data/enrollment.csv` updated with the approved campus, grade, class, and student count rows. This editable file supplies the denominators for the Reading minutes participation chart.
4. Commit the generated `site-data/YYYY_MM_DD.csv` file(s), `site-data/snapshots.json`, and `site-data/enrollment.csv`, then push and redeploy the site. Vercel reads these static website-safe files.

Original `data/*.csv` exports and the local `data/.student-id-key` are ignored by Git and are never served by the website. Keep that key locally so regenerated files preserve student matching across dates. The generated student files contain an opaque stable student ID, first name, last initial, class name, minute count, and online/offline donation counts. They exclude email addresses, full last names, and donation dollar amounts. The sanitized records are still public to anyone who can access the site, so publish them only if that student-level information is approved for parent-facing display.

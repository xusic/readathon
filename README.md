# Yu Ming Readathon dashboard

Run the local site with `run-local.bat`. It opens at http://localhost:4173/.

## Adding dated data files

1. Copy the original school export into `data/` using a filename such as `2026_11_15.csv`.
2. While the local server is running, it automatically creates or refreshes a sanitized version in `site-data/`. If the server is stopped, it sanitizes existing files the next time it starts. You can also run `node prepare-data.mjs` to generate the sanitized files on demand.
3. Review and commit the generated `site-data/YYYY_MM_DD.csv` file(s), then push and redeploy the site.

Original `data/*.csv` exports are ignored by Git and are never served by the website. The generated public files contain only first name, last initial, class name, minute count, and online/offline donation counts. They exclude email addresses, full last names, and donation dollar amounts. The sanitized records are still public to anyone who can access the site, so publish them only if that student-level information is approved for parent-facing display.

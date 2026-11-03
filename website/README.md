# SpinTracker website

Landing site for [SpinTracker](../README.md), built with Next.js, `next-intl` (English and French) and Tailwind, exported as static files and hosted on GitHub Pages: https://florentvdry.github.io/spintracker/

## Develop

```bash
npm install
npm run dev     # http://localhost:3000/en
```

## Build

```bash
npm run build   # static export in out/
```

In production the site is served under `/spintracker`. Override with `NEXT_PUBLIC_BASE_PATH` (e.g. empty for a custom domain).

## Deploy

Pushing changes under `website/` to `main` runs `.github/workflows/pages.yml`, which builds and publishes the site.

## Translations

UI text lives in `messages/en.json` and `messages/fr.json`. English is the reference locale; every key must exist in both.

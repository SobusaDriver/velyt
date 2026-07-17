# velyt landing page

Public repo for the velyt app landing page, served from **GitHub Pages**
at `https://sobusadriver.github.io/velyt/`.

This is a public mirror of the `site/` directory from the private app repo
(`SobusaDriver/velyt-app`) so the landing page can be published — GitHub Pages
can't serve a private repo on the free plan.

## Deploy

Automatic via `.github/workflows/deploy-site.yml`:

- Triggers on every push to `main` and on manual `workflow_dispatch`.
- Uploads the repo root as the Pages artifact and deploys with
  `actions/deploy-pages@v4`.

GitHub Pages repo setting must use **Source: GitHub Actions**.

## Deep links

The page also acts as a Universal-Links / App-Links host:

- `.well-known/apple-app-site-association` — iOS Universal Links
- `.well-known/assetlinks.json` — Android App Links

The custom scheme `velyt://` is used for in-app deep links from the landing CTA.
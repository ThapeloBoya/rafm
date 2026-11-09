# RAFM CMS

A lightweight file-based CMS for the RAFM static site.

## Requirements
- Node.js 18+ (Node 24 available in this environment)

## Start
```bash
cd cms
node server.js
```

Open:
- Site: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin.html`

Default login:
- Username: `admin`
- Password: `rafm2026`

Override with environment variables before starting:
```powershell
$env:CMS_USER='admin'; $env:CMS_PASS='your-strong-password'; $env:PORT='3000'; node server.js
```

## What it edits
Content is stored in `cms/data/content.json` and applied to page elements marked with `data-admin-key` / `data-admin-list`.

Supported:
- Global text/links (home, about, ministries, contact, footer)
- Contact page info
- Events & Gallery: add/edit/remove/reorder/publish events and gallery items
- Image uploads to `cms/uploads/` (or paste an external image URL)

## Making more fields editable
1. Add `data-admin-key="your.key"` to an element in a page.
   - `data-admin-type="text|href|src|html"` (default `text`)
   - `data-admin-prefix="mailto:"` for email/phone links
2. Add a matching field in `admin.html` and include it in the CMS save/load logic.
3. Reload the page through the CMS server.

## Production note
This CMS is intended for trusted administrators on a controlled server. For public production use, add HTTPS, stronger authentication/rate limiting, CSRF protection, backups, and host behind a reverse proxy. For larger teams, consider migrating content to a headless CMS or database-backed admin.

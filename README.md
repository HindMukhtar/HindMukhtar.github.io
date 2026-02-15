# HindMukhtar.github.io

Personal website and portfolio built with [Eleventy (11ty)](https://www.11ty.dev/) and based on the Hylia starter structure.  
The site includes pages for:

- About
- Contact
- Community events
- Publications
- Blog posts
- Timeline

Generated output is built into `dist/`.

## Tech Stack

- Static site generator: `@11ty/eleventy`
- Templating: Nunjucks (`.njk`) + Markdown (`.md`)
- Styling: Sass (`src/scss`)
- CMS assets (optional): Netlify CMS config/scripts included in repo

## Project Structure

```text
.
├── .eleventy.js                  # Eleventy config, collections, filters, passthrough
├── package.json                  # Scripts and dependencies
├── src/
│   ├── _data/                    # Global data (site metadata, tokens)
│   ├── _includes/
│   │   ├── assets/               # Compiled CSS output location
│   │   ├── icons/
│   │   ├── layouts/              # Page layouts
│   │   ├── macros/
│   │   └── partials/             # Reusable UI components
│   ├── admin/                    # CMS config/previews
│   ├── blogs/                    # Blog content
│   ├── community/                # Community event entries
│   ├── filters/                  # Custom template filters
│   ├── fonts/                    # Static font assets
│   ├── images/                   # Static image assets
│   ├── js/                       # Frontend JS
│   ├── pages/                    # Standalone pages (about, contact, etc.)
│   ├── posts/                    # Post content
│   ├── publications/             # Publications list items
│   ├── scss/                     # Sass source
│   ├── timeline/                 # Timeline entries
│   ├── transforms/               # HTML transforms
│   └── utils/                    # Utility helpers
└── dist/                         # Built site output
```

## Local Development

Install dependencies:

```bash
npm install
```

Run the full local dev workflow (Eleventy + Sass watch + CMS bundle watch):

```bash
npm run start
```

Run only Eleventy dev server:

```bash
npm run serve
```

Default local URL:

- `http://localhost:8080`

## Build for Production

```bash
npm run production
```

This compiles Sass, bundles CMS assets, and builds Eleventy into `dist/`.

## Content Editing Guide

Each content area is file-based Markdown:

- Posts: `src/posts/*.md`
- Publications: `src/publications/*.md`
- Blogs: `src/blogs/*.md`
- Community events: `src/community/*.md`
- Timeline: `src/timeline/*.md`
- Static pages: `src/pages/*.md`

### Images

- Put files in `src/images/`
- Reference with site-relative paths, for example:
  - `![](/images/GDG2025.jpeg)`

Avoid hardcoding production URLs like `https://hindmukhtar.github.io/images/...` during local editing.

## Collections and Display Limits

Configured in `.eleventy.js` and `src/_data/site.json`:

- `maxPostsPerPage`
- `maxPublicationsPerPage`
- `maxBlogsPerPage`

Some pages use feed collections (limited). Others can use full collections (unlimited), depending on layout templates.

## Deployment

GitHub Actions workflow: `.github/workflows/main.yml`

Current workflow:

1. Installs dependencies
2. Builds Sass
3. Runs Eleventy
4. Deploys `dist/` to `gh-pages`

## Troubleshooting

- Build fails on date parsing:
  - Check front matter `date` values in markdown files.
  - Use valid dates, e.g. `2026-01-13` (not `2026-01-013`).
- New image does not appear:
  - Confirm file exists in `src/images/`
  - Use path `![](/images/<filename>)`
  - Rebuild/restart dev server if needed.

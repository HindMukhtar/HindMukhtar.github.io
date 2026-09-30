# Ask AI About Me — source documents

Put research papers and other public-facing documents in this folder. Supported formats: `.pdf`, `.md`, `.txt` (subfolders work too). This README is excluded from indexing.

The linked `src/images/HindMukhtar-Resume.pdf` is indexed automatically, as are the home/about pages, career journey, skills, publications, blogs, and community entries. Old resumes and template/sample posts are NOT indexed. The script reads the current Resume link rather than guessing a filename.

Use descriptive filenames, for example `Satellite QoS Prediction.pdf`. PDFs need selectable text; scanned pages require OCR or a companion text transcription. For Markdown/text, you may add YAML frontmatter with a `title` field.

Blog entries that contain only a title and URL cannot provide full-text answers. Add your article text here if you want detailed answers about those articles. Publication abstracts are indexed from the website; add the full papers here for deeper coverage.

All indexed passages and document copies are published with the site and can be downloaded by anyone. Include only material you intend to make public. The original files in this folder are never modified by the script.

After adding/removing documents or updating the resume/site content:

```sh
npm run rag:build
```

If your local preview does not pick up new files, restart `npm start`. The production build and GitHub Actions also rebuild the index. `npm start` prepares it at startup; it does not continuously re-embed while you edit.

The first build downloads the embedding model; subsequent builds reuse `.cache/rag`. New/changed passages are embedded, unchanged passages reuse cached vectors. `.cache/rag/report.json` lists extraction warnings. Check PDF extraction for multi-column papers; a successful extraction does not guarantee correct reading order.

See `docs/ask-ai.md` for architecture, testing, and model settings.

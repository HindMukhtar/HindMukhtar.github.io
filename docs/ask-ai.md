# Ask AI About Me

A static RAG assistant for this Eleventy/GitHub Pages site. No API keys, database, or inference server.

## Commands

- `npm run rag:build`: extract text, embed the index, bundle the browser code.
- `npm run rag:index -- --force`: force index regeneration (unchanged vectors remain cached).
- `npm run rag:assets`: rebuild browser code only.
- `npm run test:rag`: retrieval, prompt, and source-link checks.
- `npm start`: prepare the RAG assets/index then run the usual preview.
- `npm run production`: prepare RAG and build the website.

Use Node 20 or newer. First setup requires network access for npm and Hugging Face downloads. No Qwen model is downloaded during the site build.

## Runtime

The home-page button opens an accessible native dialog with a greeting and starts preparing the assistant. Only the small UI bundle loads with the page; the model setup begins after the visitor opens the panel. It fetches the static index, checks WebGPU, starts a module worker, downloads MiniLM, and loads Qwen2.5 0.5B Instruct (4-bit). The f32 variant is used if the adapter lacks shader-f16. This is a model precision fallback, not a CPU inference fallback.

The embedding model is `Xenova/all-MiniLM-L6-v2`, pinned to a revision, with q8 weights, mean pooling, and normalized 384-dimensional vectors. The build uses CPU inference; browser questions use single-threaded WASM so GitHub Pages needs no custom cross-origin isolation headers. Both use the same model revision and preprocessing. Model selection is in `src/js/rag/config.mjs`; changing embedding settings requires rebuilding the index.

Retrieval first classifies a question as employment, research summary, research detail, education, community, or general. Each category limits and prioritizes its source types before applying cosine similarity and keyword scoring:

- Employment questions prioritize the complete resume and relevant career entries; papers are excluded.
- Broad research questions prioritize publication abstracts and concise website summaries; full papers are excluded.
- Questions about a named paper, method, dataset, metric, or result use its abstract first, then matching full-paper passages.
- Education and community questions use their corresponding website entries and resume passages.
- General questions use the resume and website. Full papers remain excluded unless research is requested.

Employment prompts distinguish employer names from fields of work. Answers about years of professional experience and employer names are assembled deterministically from the dated career entries instead of relying on the language model. Publication counts and lists are likewise built from unique publication records, preventing multi-chunk abstracts from being counted as separate papers or crowding papers out of the result. The elapsed-time calculation uses the first dated post-graduation role; overlapping job durations, education, and internships are not added together. Up to three recent visitor questions help interpret follow-ups such as “where?” Previous generated answers are excluded from model context so a poor answer cannot reinforce itself. Retrieved passages remain the only factual evidence. Chat history is in memory only, never persisted or sent to an inference API. Model/CDN requests still occur during setup; model hosts receive ordinary download requests.

Answers stream into chat-style messages as text, never injected HTML. Citation numbers are linked only to known retrieved sources; invented source IDs are shown as unavailable. A compact source list sits below each answer. Citations indicate retrieved evidence, not a guarantee that every generated claim is correct. The prompt asks for abstention and acknowledgement of conflicting sources. Evaluate this small model before relying on it.

Stop, close during generation/setup, and timeout terminate the worker. Retrying AI setup may reuse downloaded model caches, but must initialize the model again. Clear removes the on-screen conversation and follow-up context, then restores the greeting. On unsupported devices or after download errors, questions use a clearly identified source fallback with matching excerpts. Browsers may evict model caches.

## Index and deployment

`RAG Documents` accepts PDF/Markdown/text. The exact linked resume and selected website content are included automatically. Metadata-only blogs do not imply their full article text has been read. PDF sources retain page citations. Uploaded document copies and all indexed passages are PUBLIC, including the original document files copied to `/rag/documents/`.

Generated files live under `src/rag/` and are copied into `dist/rag/`. They are ignored by Git and regenerated locally or by CI. Per-chunk embeddings and model files are cached under `.cache/rag/`. Inputs and configuration are hashed, and removed documents are removed from the generated source directory. Clean deployment output avoids old document copies remaining in `dist`.

The service worker only manages its own prefixed caches. It bypasses RAG assets and cross-origin model downloads; it does not clear WebLLM or Transformers caches on each site update.

## Manual acceptance checks

1. Open the home page: no model download occurs before opening Ask AI About Me; the button is beside Resume.
2. Open the panel; verify the greeting, automatic setup progress, and suggested questions.
3. On a WebGPU-capable browser, wait for setup and ask about Hind's experience. Check citations against the resume, website, and research papers.
4. Ask an unrelated question and a question unsupported by the documents; expect abstention.
5. Check contradictory dates/degree status: answers should flag conflicting sources, not invent a resolution.
6. Stop an answer, cancel a download, close using Escape/backdrop/Close, and clear the conversation. Focus should return correctly.
7. Disable WebGPU/block model requests: the source fallback and retry control must remain functional.
8. Add a paper, run `npm run rag:build`, and ask about a distinctive passage. Remove the paper and rebuild: it should no longer appear.
9. Test a phone-sized viewport, keyboard navigation, and a fresh browser cache. Measure cold download and answer latency on target devices.

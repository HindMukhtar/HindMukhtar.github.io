import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import jsdom from '@tbranyen/jsdom';
import {embeddingConfig} from '../src/js/rag/config.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const output = 'src/rag';
const cache = '.cache/rag';
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const md = new MarkdownIt({html: true});
function plain(value) {
  const dom = new jsdom.JSDOM(md.render(value));
  const body = dom.window.document.body;
  body.querySelectorAll('script,style,img,button,.find-me__list').forEach(el => el.remove());
  body.querySelectorAll('p,li,h1,h2,h3,h4,tr,br').forEach(el => el.appendChild(dom.window.document.createTextNode('\n')));
  const text = body.textContent.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
  dom.window.close();
  return text;
}
async function walk(dir) {
  const entries = await fs.readdir(dir, {withFileTypes: true});
  const groups = await Promise.all(entries.filter(e => !e.name.startsWith('.')).map(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  return groups.flat().sort();
}
const home = await fs.readFile('src/index.md', 'utf8');
const homeDOM = new jsdom.JSDOM(md.render(matter(home).content));
const resumeHref = [...homeDOM.window.document.querySelectorAll('a')].find(a => /resume/i.test(a.textContent))?.getAttribute('href');
homeDOM.window.close();
if (!resumeHref?.startsWith('/') || !resumeHref.endsWith('.pdf') || resumeHref.includes('..')) throw new Error('Expected a local PDF Resume link in src/index.md.');
const resume = path.join('src', resumeHref);
const contentDirs = ['src/timeline', 'src/community', 'src/Skills', 'src/publications', 'src/blogs'];
const websiteFiles = ['src/index.md', 'src/pages/aboutme.md', 'src/pages/community.md', ...(await Promise.all(contentDirs.map(walk))).flat().filter(f => f.endsWith('.md'))];
const documents = (await walk('RAG Documents')).filter(f => /\.(pdf|md|txt)$/i.test(f) && path.basename(f).toLowerCase() !== 'readme.md');
const allFiles = [...websiteFiles, resume, ...documents];
const inputs = await Promise.all(allFiles.map(async f => [f, await fs.readFile(f)]));
const fingerprint = hash('index-format-v2' + JSON.stringify(embeddingConfig) + new Date().toISOString().slice(0, 10) + inputs.map(([f,b]) => f + hash(b)).join(''));
await fs.mkdir(output, {recursive: true});
try {
  const old = JSON.parse(await fs.readFile(`${output}/index.json`, 'utf8'));
  if (old.fingerprint === fingerprint && !process.argv.includes('--force')) {
    console.log(`RAG index up to date (${old.chunks.length} chunks).`);
    process.exit(0);
  }
} catch {}
const {pipeline, env} = await import('@huggingface/transformers');
env.cacheDir = path.resolve(cache, 'models');
console.log('Loading the small embedding model (cached after the first build)…');
const extractor = await pipeline('feature-extraction', embeddingConfig.model, {revision: embeddingConfig.revision, dtype: embeddingConfig.dtype, device: 'cpu'});
await fs.mkdir(path.join(cache, 'vectors'), {recursive: true});
const chunks = [];
const warnings = [];
async function split(text) {
  // Tokenize before embedding: stay below MiniLM's 256-token input limit.
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const result = [];
  let start = 0;
  while (start < words.length) {
    let end = Math.min(start + 140, words.length);
    while (end > start + 1 && (await extractor.tokenizer.encode(words.slice(start, end).join(' '))).length > embeddingConfig.maxTokens) end--;
    const part = words.slice(start, end).join(' ');
    if ((await extractor.tokenizer.encode(part)).length > embeddingConfig.maxTokens) throw new Error('A document contains an oversized token. Clean the extracted text before indexing.');
    result.push(part);
    if (end === words.length) break;
    start = Math.max(start + 1, end - 20);
  }
  return result;
}
async function add(source, text) {
  if (!text.trim()) return;
  for (const part of await split(text)) {
    const key = hash(JSON.stringify(embeddingConfig) + part);
    const cacheFile = path.join(cache, 'vectors', key + '.json');
    let embedding;
    try { embedding = JSON.parse(await fs.readFile(cacheFile, 'utf8')); } catch {
      const tensor = await extractor(part, {pooling: embeddingConfig.pooling, normalize: embeddingConfig.normalize});
      embedding = Array.from(tensor.data, x => Number(x.toFixed(7)));
      await fs.writeFile(cacheFile, JSON.stringify(embedding));
    }
    if (embedding.length !== embeddingConfig.dimensions || !embedding.every(Number.isFinite)) throw new Error('Invalid embedding for ' + source.title);
    chunks.push({...source, id: hash(source.sourceId + (source.page || '') + part).slice(0, 16), text: part, embedding});
  }
}
for (const file of websiteFiles) {
  const {data, content} = matter(await fs.readFile(file, 'utf8'));
  if (data.draft || (data.date && new Date(data.date) > new Date())) continue;
  const group = file.split('/')[1];
  const section = {timeline: '/#career-heading', community: '/pages/community', Skills: '/#skills', publications: '/#publications', blogs: '/#blogs'};
  const url = ['publications', 'blogs'].includes(group) && /^https?:\/\//.test(data.url || '') ? data.url : section[group] || (file === 'src/index.md' ? '/' : '/pages/' + path.basename(file, '.md'));
  const title = file === 'src/index.md' ? 'Hind Mukhtar — Introduction' : data.title || path.basename(file, '.md');
  const text = plain(content);
  if (!text && !['blogs', 'publications'].includes(group)) continue;
  if (!text && group === 'blogs') warnings.push(`${title}: only the title/link is available. Add the article text to RAG Documents for full-text answers.`);
  const date = data.date ? new Date(data.date).toISOString().slice(0, 10) : undefined;
  await add({sourceId: file, title, url, type: group, date}, [title, date, data.conference, data.location, text || 'Only the title and source link are available; no full text was provided.'].filter(Boolean).join('\n'));
}
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
async function readPDF(file, url, title, type) {
  const pdf = await pdfjs.getDocument({data: new Uint8Array(await fs.readFile(file)), useSystemFonts: true, isEvalSupported: false}).promise;
  let found = 0;
  try {
    for (let page = 1; page <= pdf.numPages; page++) {
      const p = await pdf.getPage(page);
      const content = await p.getTextContent();
      const text = content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('').trim();
      if (text.length < 30) { warnings.push(`${file}, page ${page}: little or no extractable text (may need OCR).`); continue; }
      found++;
      await add({sourceId: file, title, url: url + '#page=' + page, page, type}, title + '\n' + text);
      p.cleanup();
    }
  } finally { await pdf.destroy(); }
  if (!found) throw new Error(`${file} contains no readable text. Add a text/Markdown transcription or an OCR version.`);
}
await readPDF(resume, resumeHref, 'Hind Mukhtar — Resume', 'resume');
const documentOutput = path.join(output, 'documents');
await fs.mkdir(documentOutput, {recursive: true});
const keep = new Set();
for (const file of documents) {
  const bytes = await fs.readFile(file);
  const name = path.basename(file).replace(/[^a-zA-Z0-9._-]/g, '-');
  const stored = hash(file + hash(bytes)).slice(0, 12) + '-' + name;
  keep.add(stored);
  await fs.writeFile(path.join(documentOutput, stored), bytes);
  const url = '/rag/documents/' + stored;
  const title = path.basename(file, path.extname(file)).replace(/\s+\(\d+\)$/, '').replace(/[_-]/g, ' ');
  if (/\.pdf$/i.test(file)) await readPDF(file, url, title, 'document');
  else {
    const {data, content} = matter(bytes.toString('utf8'));
    await add({sourceId: file, title: data.title || title, url, type: 'document'}, (data.title || title) + '\n' + plain(content));
  }
}
// Remove previously published document copies that are no longer in the input folder.
for (const name of await fs.readdir(documentOutput)) if (!keep.has(name)) await fs.unlink(path.join(documentOutput, name));
// Eleventy copies files without pruning deleted ones; remove stale generated downloads too.
try {
  for (const name of await fs.readdir('dist/rag/documents')) {
    if (/^[a-f0-9]{12}-/.test(name) && !keep.has(name)) await fs.unlink(path.join('dist/rag/documents', name));
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const index = {version: 1, fingerprint, generatedAt: new Date().toISOString(), embedding: embeddingConfig, chunks};
await fs.writeFile(`${output}/index.json.tmp`, JSON.stringify(index));
await fs.rename(`${output}/index.json.tmp`, `${output}/index.json`);
await fs.writeFile(`${cache}/report.json`, JSON.stringify({chunks: chunks.length, documents: documents.length, warnings}, null, 2));
console.log(`Indexed ${chunks.length} chunks, including the linked resume and ${documents.length} RAG documents.`);
warnings.forEach(w => console.warn('RAG note: ' + w));
await extractor.dispose();

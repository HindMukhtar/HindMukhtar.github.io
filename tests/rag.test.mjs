import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {retrieve, cosineSimilarity, safeSourceUrl, buildMessages, routeQuestion, addVerifiedGuidance, verifiedEmploymentAnswer, verifiedPublicationAnswer, cleanGeneratedAnswer} from '../src/js/rag/retrieve.mjs';

test('cosine handles normalization, zero vectors, and mismatched dimensions', () => {
  assert.equal(cosineSimilarity([2, 0], [9, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  assert.throws(() => cosineSimilarity([1], [1, 2]));
});
test('retrieval ranks relevant sources and limits duplicate source passages', () => {
  const index = {chunks: [
    ...[1, 2, 3].map(n => ({id: n, sourceId: 'paper', type: 'publications', title: 'Satellite networks', text: 'Transformer prediction satellite', embedding: [1, 0]})),
    {id: 4, sourceId: 'resume', type: 'resume', title: 'Resume', text: 'Satellite engineering', embedding: [.9, .1]},
    {id: 5, sourceId: 'community', type: 'community', title: 'Community', text: 'Public speaking', embedding: [0, 1]}
  ]};
  const found = retrieve(index, 'satellite', [1, 0]);
  assert.equal(found.filter(s => s.sourceId === 'paper').length, 2);
  assert(found.some(s => s.sourceId === 'resume'));
  assert(!found.some(s => s.sourceId === 'community'));
  assert.equal(retrieve(index, 'unicorn').length, 0);
});
test('question routing keeps employment and broad research away from full papers', () => {
  assert.equal(routeQuestion('How many years of experience does Hind have?').kind, 'employment');
  assert.equal(routeQuestion('Where has Hind previously worked?').kind, 'employment');
  assert.equal(routeQuestion('Which companies has she worked for?').kind, 'employment');
  assert.equal(routeQuestion('What is Hind’s research about?').kind, 'researchSummary');
  assert.equal(routeQuestion('What results did the VAEGAN paper achieve?').kind, 'researchDetail');
  assert(!routeQuestion('What is Hind’s research about?').types.has('document'));
  assert(routeQuestion('What results did the VAEGAN paper achieve?').types.has('document'));
  const fallback = retrieve({chunks: [
    {sourceId: 'resume', type: 'resume', title: 'Resume', text: 'Gogo and Satcom Direct'},
    {sourceId: 'paper', type: 'document', title: 'Research paper', text: 'companies and experience'}
  ]}, 'Where has Hind worked?');
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].type, 'resume');
});
test('experience guidance calculates elapsed post-graduation time without adding roles', () => {
  const index = {chunks: [
    {type: 'timeline', title: 'Internship at Honeywell', date: '2017-06-01'},
    {type: 'timeline', title: 'Graduated from university', date: '2019-05-01'},
    {type: 'timeline', title: 'Hardware Engineer at Satcom Direct', date: '2019-06-01'},
    {type: 'timeline', title: 'Data Scientist at Gogo', date: '2023-01-01'}
  ]};
  const route = addVerifiedGuidance(index, 'How many years of experience does Hind have?', undefined, '2026-09-29');
  assert.match(route.guidance, /first post-graduation full-time role began 2019-06-01/);
  assert.match(route.guidance, /7 years and 3 months/);
  assert.match(route.guidance, /approximately 7 years/);
  const duration = verifiedEmploymentAnswer(index, 'How many years of experience does Hind have?', [], '2026-09-29');
  assert.match(duration.text, /approximately 7 years/);
  assert.match(duration.text, /June 2019/);
  const employers = verifiedEmploymentAnswer(index, 'Where has Hind worked?', [], '2026-09-29');
  assert.match(employers.text, /Satcom Direct as Hardware Engineer \[1\]/);
  assert.match(employers.text, /Gogo as Data Scientist \[2\]/);
  const followUp = verifiedEmploymentAnswer(index, 'Where?', [{role: 'user', content: 'How many years of experience?'}], '2026-09-29');
  assert.match(followUp.text, /Satcom Direct/);
});
test('publication counts and lists use unique publication records', () => {
  const index = {chunks: [
    {sourceId: 'publication-a', type: 'publications', title: 'Paper A', date: '2026-01-01', url: '/a'},
    {sourceId: 'publication-a', type: 'publications', title: 'Paper A', date: '2026-01-01', url: '/a', text: 'second chunk'},
    {sourceId: 'publication-b', type: 'publications', title: 'Paper B', date: '2025-01-01', url: '/b'}
  ]};
  const answer = verifiedPublicationAnswer(index, 'How many publications does Hind have?');
  assert.match(answer.text, /Hind has 2 publications/);
  assert.match(answer.text, /1\. Paper A \[1\]/);
  assert.match(answer.text, /2\. Paper B \[2\]/);
  assert.equal(answer.sources.length, 2);
});
test('citation links reject executable or protocol-relative URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//evil.test', '/\\evil.test', 'file:///etc/passwd']) assert.equal(safeSourceUrl(url), null);
  assert.equal(safeSourceUrl('/images/resume.pdf#page=2'), '/images/resume.pdf#page=2');
  assert.equal(safeSourceUrl('https://example.org/paper'), 'https://example.org/paper');
});
test('generated answers do not echo the visitor question', () => {
  const question = 'What kind of machine learning-based approach?';
  assert.equal(cleanGeneratedAnswer(`${question} Hind and her team developed a transformer model.`, question), 'Hind and her team developed a transformer model.');
  assert.equal(cleanGeneratedAnswer(`Question: ${question}\nThey used a transformer model.`, question), 'They used a transformer model.');
});
test('prompt bounds context and separates untrusted sources from instructions', () => {
  const messages = buildMessages('Question', [{title: 'Paper', text: 'x'.repeat(10000), page: 2}], [
    {role: 'user', content: 'Previous'},
    {role: 'assistant', content: 'Earlier answer'}
  ]);
  assert(messages[0].content.includes('sources conflict'));
  assert(messages[0].content.includes('untrusted data'));
  assert(messages[0].content.includes('Hind is a woman'));
  assert(messages[0].content.includes('she/her pronouns only'));
  assert(messages[0].content.includes('Do not repeat, quote, restate, or paraphrase'));
  assert(messages[0].content.includes('Full research papers are excluded'));
  assert(messages[1].content.includes('[1] Source type: website; Paper, page 2'));
  assert(messages[1].content.includes('Visitor: Previous'));
  assert(!messages[1].content.includes('Earlier answer'));
  assert(messages[1].content.length < 3000);
});
test('generated index includes linked resume and website, with valid normalized vectors', {skip: !fs.existsSync('src/rag/index.json')}, () => {
  const index = JSON.parse(fs.readFileSync('src/rag/index.json'));
  const resume = index.chunks.filter(c => c.type === 'resume');
  assert(resume.length > 0);
  assert(resume.every(c => c.url.startsWith('/images/HindMukhtar-Resume.pdf#page=')));
  for (const type of ['timeline', 'community', 'Skills', 'publications', 'blogs']) assert(index.chunks.some(c => c.type === type));
  assert(!index.chunks.some(c => /Resumeold|Resume_old|Resume_typo|src\/posts/.test(c.sourceId)));
  for (const c of index.chunks) {
    assert.equal(c.embedding.length, 384);
    assert(Math.abs(cosineSimilarity(c.embedding, c.embedding) - 1) < .00001);
    assert(safeSourceUrl(c.url));
  }
  assert(retrieve(index, 'Toastmasters').some(c => c.type === 'community'));
  assert(retrieve(index, 'Text SQL').some(c => c.type === 'resume' || c.type === 'Skills'));
  const researchDocuments = new Set(index.chunks.filter(c => c.type === 'document').map(c => c.sourceId));
  assert.equal(researchDocuments.size, 6);
  const publicationRecords = new Set(index.chunks.filter(c => c.type === 'publications').map(c => c.sourceId));
  assert.equal(publicationRecords.size, 6);
  assert.match(verifiedPublicationAnswer(index, 'List Hind’s publications').text, /Hind has 6 publications/);
  assert(retrieve(index, 'VAEGAN avionic traffic').some(c => /VAEGAN/.test(c.title)));
  assert(retrieve(index, 'LEO decision transformer handover').some(c => /Handover Optimization/.test(c.title)));
});

test('site service worker preserves model caches and bypasses model/RAG fetches', async () => {
  const {runInNewContext} = await import('node:vm');
  const handlers = {}, deleted = [];
  runInNewContext(fs.readFileSync('src/_includes/partials/global/service-worker.js', 'utf8'), {
    VERSION: 'new', URL,
    self: {location: {origin: 'https://hindmukhtar.github.io'}, addEventListener: (type, handler) => {handlers[type] = handler;}, clients: {claim: async () => {}}},
    caches: {keys: async () => ['precache-old', 'runtime-old', 'webllm/model', 'transformers-cache', 'precache-new'], delete: async key => deleted.push(key)}
  });
  let completion;
  handlers.activate({waitUntil: promise => {completion = promise;}});
  await completion;
  assert.deepEqual(deleted, ['precache-old', 'runtime-old']);
  for (const url of ['https://huggingface.co/model', 'https://hindmukhtar.github.io/rag/index.json']) {
    handlers.fetch({request: {url, method: 'GET'}, respondWith: () => assert.fail('Must bypass this request')});
  }
});

test('chat opens conversationally and falls back gracefully without WebGPU', async () => {
  const jsdom = (await import('@tbranyen/jsdom')).default;
  const dom = new jsdom.JSDOM(`
    <button data-ai-open hidden>Ask AI About Me</button>
    <dialog id="ask-ai">
      <button data-ai-close></button><p data-ai-status></p>
      <button data-ai-load hidden></button><button data-ai-stop hidden></button>
      <button data-ai-question>What research has Hind done?</button>
      <div data-ai-messages></div>
      <form data-ai-form><textarea name="question"></textarea><button data-ai-submit type="submit"></button></form>
      <button data-ai-clear></button>
    </dialog>`);
  const dialog = dom.window.document.querySelector('dialog');
  dialog.showModal = () => { dialog.open = true; };
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.Element.prototype.replaceChildren = function (...children) {
    while (this.firstChild) this.removeChild(this.firstChild);
    this.append(...children);
  };
  const priorDocument = globalThis.document;
  const priorFetch = globalThis.fetch;
  const priorNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  globalThis.document = dom.window.document;
  globalThis.fetch = async () => ({ok: true, json: async () => ({version: 1, chunks: [
    {sourceId: 'paper', type: 'publications', title: 'Research paper', text: 'Hind research machine learning', url: '/paper.pdf'}
  ]})});
  Object.defineProperty(globalThis, 'navigator', {value: {}, configurable: true});
  try {
    await import(`../src/js/rag/chat.mjs?test=${Date.now()}`);
    const open = dom.window.document.querySelector('[data-ai-open]');
    assert.equal(open.hidden, false);
    open.click();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.match(dom.window.document.querySelector('[data-ai-messages]').textContent, /Hi! Ask me/);
    assert.match(dom.window.document.querySelector('[data-ai-status]').textContent, /cannot run the conversational AI/);
    assert.equal(dom.window.document.querySelector('[data-ai-submit]').disabled, false);
    dom.window.document.querySelector('[data-ai-question]').click();
    assert.equal(dom.window.document.querySelectorAll('.ask-ai__turn--user').length, 1);
    assert.match(dom.window.document.querySelector('[data-ai-messages]').textContent, /closest information/);
  } finally {
    globalThis.document = priorDocument;
    globalThis.fetch = priorFetch;
    if (priorNavigator) Object.defineProperty(globalThis, 'navigator', priorNavigator);
    else delete globalThis.navigator;
    dom.window.close();
  }
});

import {retrieve, safeSourceUrl, routeQuestion, cleanGeneratedAnswer} from './retrieve.mjs';

const openButton = document.querySelector('[data-ai-open]');
const dialog = document.querySelector('#ask-ai');

if (openButton && dialog) {
  const find = name => dialog.querySelector(`[data-ai-${name}]`);
  const status = find('status');
  const messages = find('messages');
  const form = find('form');
  const input = form.elements.question;
  const submit = find('submit');
  const load = find('load');
  const stop = find('stop');
  const suggestions = [...dialog.querySelectorAll('[data-ai-question]')];
  let index;
  let loadingIndex;
  let worker;
  let ready = false;
  let loading = false;
  let generating = false;
  let fallback = false;
  let autoStarted = false;
  let setupId = 0;
  let requestId = 0;
  let active;
  let history = [];
  let loadTimer;
  let answerTimer;

  const setStatus = text => { status.textContent = text; };

  function update() {
    const canAsk = Boolean(index) && (ready || fallback) && !generating;
    submit.disabled = !canAsk;
    submit.textContent = 'Send';
    load.hidden = !fallback;
    load.disabled = loading || generating;
    stop.hidden = !loading && !generating;
    stop.textContent = loading ? 'Cancel setup' : 'Stop answer';
    input.disabled = generating;
    suggestions.forEach(button => { button.disabled = !canAsk; });
  }

  function appendTurn(role, text = '') {
    const article = document.createElement('article');
    article.className = `ask-ai__turn ask-ai__turn--${role}`;
    const label = document.createElement('p');
    label.className = 'ask-ai__speaker';
    label.textContent = role === 'user' ? 'You' : 'Ask AI About Me';
    const body = document.createElement('p');
    body.className = 'ask-ai__answer';
    body.textContent = text;
    article.append(label, body);
    if (role === 'assistant') {
      const sourceBox = document.createElement('div');
      sourceBox.className = 'ask-ai__sources';
      article.append(sourceBox);
      return {article, answer: body, sourceBox};
    }
    messages.append(article);
    return {article, answer: body};
  }

  function addGreeting() {
    if (messages.children.length) return;
    const greeting = appendTurn('assistant', 'Hi! Ask me about Hind’s experience, research, publications, education, or community work. I’ll answer from her resume, website, and research papers.');
    messages.append(greeting.article);
  }

  async function getIndex() {
    if (index) return index;
    if (!loadingIndex) loadingIndex = (async () => {
      const response = await fetch('/rag/index.json', {cache: 'no-cache'});
      if (!response.ok) throw new Error('The knowledge library could not be loaded. Please close and reopen the panel to retry.');
      const result = await response.json();
      if (result.version !== 1 || !Array.isArray(result.chunks)) throw new Error('The knowledge library is not valid.');
      index = result;
      update();
      return index;
    })().catch(error => { loadingIndex = null; throw error; });
    return loadingIndex;
  }

  function renderSources(target, sources, excerpts = false) {
    target.replaceChildren();
    if (!sources.length) return;
    const details = document.createElement('details');
    details.open = excerpts;
    const summary = document.createElement('summary');
    summary.textContent = excerpts ? 'Relevant information' : `Sources (${sources.length})`;
    const list = document.createElement('ol');
    for (const source of sources) {
      const li = document.createElement('li');
      const link = document.createElement('a');
      const url = safeSourceUrl(source.url);
      link.textContent = source.title + (source.page ? ` — page ${source.page}` : '');
      if (url) {
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      li.append(link);
      if (excerpts) {
        const excerpt = document.createElement('p');
        excerpt.textContent = source.text;
        li.append(excerpt);
      }
      list.append(li);
    }
    details.append(summary, list);
    target.append(details);
  }

  function renderAnswer() {
    if (!active) return;
    active.answer.replaceChildren();
    for (const part of active.text.split(/(\[\d+\])/g)) {
      const match = /^\[(\d+)\]$/.exec(part);
      const source = match && active.sources[Number(match[1]) - 1];
      const url = source && safeSourceUrl(source.url);
      if (url) {
        const link = document.createElement('a');
        link.href = url;
        link.textContent = part;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = source.title;
        active.answer.append(link);
      } else if (match) active.answer.append(document.createTextNode('[source unavailable]'));
      else active.answer.append(document.createTextNode(part));
    }
  }

  function correctPronouns(text) {
    return text
      .replace(/\bHe\b/g, 'She')
      .replace(/\bhe\b/g, 'she')
      .replace(/\bHim\b/g, 'Her')
      .replace(/\bhim\b/g, 'her')
      .replace(/\bHis\b/g, 'Her')
      .replace(/\bhis\b/g, 'her')
      .replace(/\bHimself\b/g, 'Herself')
      .replace(/\bhimself\b/g, 'herself');
  }

  function terminate() {
    setupId++;
    worker?.terminate();
    worker = null;
    ready = false;
    loading = false;
    generating = false;
    clearTimeout(loadTimer);
    clearTimeout(answerTimer);
    update();
  }

  function failLoad(text) {
    const wasGenerating = generating;
    terminate();
    fallback = true;
    if (wasGenerating && active) {
      active.text = 'I couldn’t finish that answer on this device, but I found the closest information in Hind’s sources below.';
      renderAnswer();
      renderSources(active.sourceBox, active.sources, true);
    }
    setStatus(`${text} You can still ask questions and review the closest information from Hind’s sources.`);
    update();
  }

  function finish() {
    generating = false;
    clearTimeout(answerTimer);
    if (active && !active.text) {
      active.text = 'I couldn’t generate an answer to that question. Please try rephrasing it.';
      renderAnswer();
    }
    if (active) {
      active.text = correctPronouns(cleanGeneratedAnswer(active.text, active.question));
      renderAnswer();
    }
    if (active) {
      history.push(
        {role: 'user', content: active.question},
        {role: 'assistant', content: active.text}
      );
      history = history.slice(-6);
    }
    setStatus('Ready for your next question.');
    update();
    input.focus();
  }

  async function enable() {
    if (loading || ready) return;
    const setup = ++setupId;
    fallback = false;
    loading = true;
    setStatus('Preparing your private AI conversation…');
    update();
    try {
      await getIndex();
      if (setup !== setupId) return;
      const adapter = await navigator.gpu?.requestAdapter();
      if (setup !== setupId) return;
      if (!adapter) {
        failLoad('This browser or device cannot run the conversational AI.');
        return;
      }
      worker = new Worker('/rag/app/worker.js', {type: 'module'});
      worker.onerror = () => failLoad('The conversational AI could not run.');
      worker.onmessage = ({data}) => {
        if (data.type === 'progress') setStatus(data.text);
        if (data.type === 'load-error') failLoad('AI setup failed: ' + data.text);
        if (data.type === 'ready') {
          clearTimeout(loadTimer);
          ready = true;
          loading = false;
          fallback = false;
          setStatus('Ready — ask me anything about Hind’s work and research.');
          update();
          input.focus();
        }
        if (data.id !== requestId || !active) return;
        if (data.type === 'sources') {
          active.sources = data.sources;
          renderSources(active.sourceBox, data.sources);
        }
        if (data.type === 'token') {
          active.text += data.text;
          renderAnswer();
        }
        if (data.type === 'answer-error') {
          active.text += '\nI couldn’t finish this response. Please try again or review the sources below.';
          renderAnswer();
          renderSources(active.sourceBox, active.sources, true);
        }
        if (data.type === 'done') finish();
      };
      worker.postMessage({type: 'init', index});
      loadTimer = setTimeout(() => failLoad('AI setup timed out.'), 300000);
    } catch (error) {
      if (setup === setupId) failLoad(error.message);
    }
  }

  function stopWork() {
    if (loading) {
      terminate();
      fallback = true;
      setStatus('AI setup was cancelled. You can ask a question using the source fallback or retry setup.');
      update();
      return;
    }
    if (generating) {
      worker?.postMessage({type: 'stop'});
      requestId++;
      terminate();
      fallback = true;
      if (active) {
        active.text += '\n[Answer stopped]';
        renderAnswer();
      }
      setStatus('Answer stopped. You can retry AI setup or continue with the source fallback.');
      update();
    }
  }

  function ask(question) {
    if (!question || !index || generating || (!ready && !fallback)) return;
    appendTurn('user', question);
    const assistant = appendTurn('assistant', ready ? 'Thinking…' : 'Looking through Hind’s sources…');
    messages.append(assistant.article);
    const previousQuestion = [...history].reverse().find(message => message.role === 'user')?.content || '';
    const needsContext = /\b(it|that|those|this|they|them|her|she|ones?|the paper|the role)\b/i.test(question) || question.split(/\s+/).length <= 4;
    const query = question + (previousQuestion && needsContext ? '\n' + previousQuestion : '');
    const sources = retrieve(index, query, null, undefined, routeQuestion(query));
    active = {...assistant, question, sources, text: ''};
    input.value = '';
    requestId++;

    if (!ready) {
      active.text = sources.length
        ? 'I can’t generate a conversational answer on this device, but I found the closest information in Hind’s sources below.'
        : 'I couldn’t find information about that in Hind’s available documents. Try asking about her research, experience, education, or community work.';
      renderAnswer();
      renderSources(active.sourceBox, sources, true);
      history.push({role: 'user', content: question}, {role: 'assistant', content: active.text});
      history = history.slice(-6);
      setStatus('Ready for your next question.');
      update();
    } else {
      generating = true;
      setStatus('Reading the most relevant sources and composing an answer…');
      update();
      worker.postMessage({type: 'ask', id: requestId, question, history});
      answerTimer = setTimeout(() => {
        stopWork();
        setStatus('The answer took too long. You can retry AI setup or continue with the source fallback.');
      }, 120000);
    }
    assistant.article.scrollIntoView({block: 'nearest', behavior: 'smooth'});
  }

  openButton.hidden = false;
  openButton.addEventListener('click', async () => {
    dialog.showModal();
    document.documentElement.classList.add('ask-ai-open');
    addGreeting();
    try {
      await getIndex();
      if (!autoStarted) {
        autoStarted = true;
        await enable();
      }
    } catch (error) {
      fallback = false;
      setStatus(error.message);
      update();
    }
  });
  find('close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    stopWork();
    document.documentElement.classList.remove('ask-ai-open');
    openButton.focus({preventScroll: true});
  });
  load.addEventListener('click', enable);
  stop.addEventListener('click', stopWork);
  find('clear').addEventListener('click', () => {
    if (generating) stopWork();
    requestId++;
    active = null;
    history = [];
    messages.replaceChildren();
    addGreeting();
    input.value = '';
    input.focus();
  });
  suggestions.forEach(button => button.addEventListener('click', () => ask(button.textContent.trim())));
  form.addEventListener('submit', event => {
    event.preventDefault();
    ask(input.value.trim());
  });
  update();
}

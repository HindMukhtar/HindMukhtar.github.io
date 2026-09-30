import {embeddingConfig, modelId, fallbackModelId} from './config.mjs';
import {retrieve, buildMessages, routeQuestion, addVerifiedGuidance, verifiedEmploymentAnswer, verifiedPublicationAnswer} from './retrieve.mjs';
let extractor, engine, index, busy = false, stopped = false;
const post = (type, payload = {}) => self.postMessage({type, ...payload});
self.onmessage = async ({data}) => {
  if (data.type === 'stop') { stopped = true; if (engine) await engine.interruptGenerate(); return; }
  if (data.type === 'init') {
    if (busy) return;
    busy = true;
    try {
      index = data.index;
      if (JSON.stringify(index.embedding) !== JSON.stringify(embeddingConfig)) throw new Error('The document index is out of date. Please rebuild it.');
      post('progress', {text: 'Loading the document search model…'});
      const {pipeline, env} = await import('@huggingface/transformers');
      env.allowLocalModels = false;
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.wasmPaths = new URL('../vendor/', self.location.href).href;
      extractor = await pipeline('feature-extraction', embeddingConfig.model, {
        revision: embeddingConfig.revision, dtype: embeddingConfig.dtype, device: 'wasm',
        progress_callback: p => { if (p.status === 'progress') post('progress', {text: `Loading document search: ${Math.round(p.progress)}%`}); }
      });
      post('progress', {text: 'Preparing Qwen. The first download is about 300 MB…'});
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error('WebGPU is unavailable on this device. You can still search the sources.');
      const selectedModel = adapter.features.has('shader-f16') ? modelId : fallbackModelId;
      const {CreateMLCEngine} = await import('@mlc-ai/web-llm');
      engine = await CreateMLCEngine(selectedModel, {initProgressCallback: p => post('progress', {text: p.text})}, {context_window_size: 4096});
      post('ready');
    } catch (error) { post('load-error', {text: error.message}); }
    finally { busy = false; }
    return;
  }
  if (data.type === 'ask' && !busy && engine && extractor) {
    busy = true; stopped = false;
    const id = data.id;
    try {
      const history = Array.isArray(data.history) ? data.history : [];
      const previousQuestion = [...history].reverse().find(message => message?.role === 'user')?.content || '';
      const needsContext = /\b(it|that|those|this|they|them|her|she|ones?|the paper|the role)\b/i.test(data.question) || data.question.trim().split(/\s+/).length <= 4;
      const query = data.question + (previousQuestion && needsContext ? '\nPrevious question: ' + previousQuestion.slice(0, 500) : '');
      const asOfDate = new Date().toISOString().slice(0, 10);
      const route = addVerifiedGuidance(index, data.question, routeQuestion(query), asOfDate);
      const verified = route.kind === 'employment'
        ? verifiedEmploymentAnswer(index, data.question, history, asOfDate)
        : verifiedPublicationAnswer(index, data.question);
      if (verified) {
        post('sources', {id, sources: verified.sources.map(({embedding, ...source}) => source)});
        post('token', {id, text: verified.text});
        return;
      }
      const tensor = await extractor(query, {pooling: embeddingConfig.pooling, normalize: embeddingConfig.normalize});
      if (stopped) return;
      const sources = retrieve(index, query, Array.from(tensor.data), undefined, route);
      post('sources', {id, sources: sources.map(({embedding, ...source}) => source)});
      if (!sources.length) {
        post('token', {id, text: 'I don’t have enough information in the available documents to answer that. Try asking about Hind’s experience, research, education, or community involvement.'});
      } else {
        const stream = await engine.chat.completions.create({
          messages: buildMessages(data.question, sources, history, route, asOfDate),
          stream: true, temperature: .1, max_tokens: 350
        });
        for await (const chunk of stream) {
          if (stopped) break;
          const text = chunk.choices[0]?.delta?.content;
          if (text) post('token', {id, text});
        }
      }
    } catch (error) { post('answer-error', {id, text: error.message}); }
    finally { busy = false; post('done', {id}); }
  }
};

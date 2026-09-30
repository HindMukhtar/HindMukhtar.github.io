export const embeddingConfig = {
  model: 'Xenova/all-MiniLM-L6-v2',
  revision: '751bff37182d3f1213fa05d7196b954e230abad9',
  dtype: 'q8',
  dimensions: 384,
  pooling: 'mean',
  normalize: true,
  maxTokens: 220
};
export const modelId = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
export const fallbackModelId = 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC';

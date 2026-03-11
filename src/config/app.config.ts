export const appConfig = () => ({
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
    // Fallback model: використовується якщо primary model недоступний
    // або для lightweight classification tasks (planner, grader)
    fallbackModel: process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini',
  },
  opensearch: {
    url: process.env.OPENSEARCH_URL || 'http://localhost:9200',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  langsmith: {
    apiKey: process.env.LANGSMITH_API_KEY || '',
    project: process.env.LANGSMITH_PROJECT || 'notesqa-prod',
  },
});

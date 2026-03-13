export const appConfig = () => ({
  llm: {
    primaryProvider: process.env.LLM_PRIMARY_PROVIDER || 'openai',
    backupProvider: process.env.LLM_BACKUP_PROVIDER || 'openai',
    fastProvider: process.env.LLM_FAST_PROVIDER || 'openai',
    embeddingsProvider: process.env.LLM_EMBEDDINGS_PROVIDER || 'openai',
  },
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
  stm: {
    maxWindowTokens: parseInt(process.env.STM_MAX_WINDOW_TOKENS || '3000', 10),
    summarisationThreshold: parseFloat(
      process.env.STM_SUMMARISATION_THRESHOLD || '0.8',
    ),
  },
});

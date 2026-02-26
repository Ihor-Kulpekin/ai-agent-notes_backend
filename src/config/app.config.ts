export const appConfig = () => ({
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
  },
});
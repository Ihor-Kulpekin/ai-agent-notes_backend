import { Embeddings } from '@langchain/core/embeddings';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';

export interface EmbeddingsModelOptions {
    modelName?: string;
}

export const embeddingsModelProviders: Record<
    string,
    (config: ConfigService, opts: EmbeddingsModelOptions) => Embeddings
> = {
    openai: (config, opts) => {
        return new OpenAIEmbeddings({
            apiKey: config.get<string>('openai.apiKey'),
            model: opts.modelName || 'text-embedding-3-small',
        });
    },
};

export const createEmbeddingsModelFactory = (
    configPathProvider: string,
    defaultOptions: EmbeddingsModelOptions,
) => {
    return (config: ConfigService): Embeddings => {
        const providerKey = config.get<string>(configPathProvider, 'openai');

        const factoryFn = embeddingsModelProviders[providerKey];
        if (!factoryFn) {
            throw new Error(`Embeddings provider "${providerKey}" is not supported.`);
        }

        return factoryFn(config, defaultOptions);
    };
};

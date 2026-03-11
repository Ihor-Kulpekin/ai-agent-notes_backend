import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisSaver } from '@langchain/langgraph-checkpoint-redis';

/**
 * CheckpointerModule — надає NestJS DI-провайдер для LangGraph checkpointer.
 *
 * RedisSaver зберігає стан StateGraph між turns, що дозволяє:
 * - Thread persistence (той самий thread_id відновлює попередній стан)
 * - Crash recovery (граф перевідновлюється після рестарту)
 * - Human-in-the-loop (граф зупиняється і чекає на підтвердження)
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'CHECKPOINTER',
      inject: [ConfigService],
      useFactory: async (configService: ConfigService): Promise<RedisSaver> => {
        const redisUrl = configService.get<string>(
          'redis.url',
          'redis://localhost:6379',
        );
        // fromUrl: creates a RedisClient, connects it, and calls ensureIndexes()
        return RedisSaver.fromUrl(redisUrl);
      },
    },
  ],
  exports: ['CHECKPOINTER'],
})
export class CheckpointerModule {}

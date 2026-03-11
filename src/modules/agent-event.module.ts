import { Module, Global } from '@nestjs/common';
import { AgentEventEmitter } from 'src/gateways/agent-event.emitter';

/**
 * Global module for agent events to ensure AgentEventEmitter is available
 * across the entire application without circular dependency issues.
 */
@Global()
@Module({
  providers: [AgentEventEmitter],
  exports: [AgentEventEmitter],
})
export class AgentEventModule {}

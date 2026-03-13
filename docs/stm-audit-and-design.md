# Short-Term Memory (STM) Audit & Technical Design

## Current State

The current implementation of Short-Term Memory (STM) in the `ShortTermMemoryService` (`short-term.memory.ts`) is *already* utilizing a **production-ready** approach. It does not blindly count `messages.length` like a pet project.

Instead, the sliding window is managed by calculating the precise number of tokens in the conversation using the `TokenCounterService` (`token-counter.service.ts`).

Here is how the current flow operates:
1. **Token Counting**: When a new message arrives, `TokenCounterService.count` uses the `tiktoken` library (specifically targeting `gpt-4o` or falling back to `gpt-4`) to calculate exactly how many tokens the string consumes. Overhead tokens per message (e.g., role framing) are also accounted for via `countMessages()`.
2. **Threshold Checking**: The service compares the total current token count of the active window against a computed threshold (`MEMORY_CONFIG.maxWindowTokens * MEMORY_CONFIG.summarisationThreshold`).
3. **Summarization Algorithm**: If the threshold is exceeded (e.g., getting dangerously close to the token limit), the service triggers the `summarise()` method.
4. **Window Sliding**: The algorithm takes the oldest 50% of messages (`Math.ceil(window.length / 2)`), combines them with any previously existing summary, and asks an LLM to generate a new concise summary. The remaining newest 50% of messages become the new active window.

## The Problem

While the *approach* (token counting via `tiktoken`) is structurally correct and safe for production (it intrinsically protects against context overflow caused by massive single messages), there are a few potential architectural or tuning risks that a Lead Engineer should be mindful of:

1. **Hardcoded Summarization Split**: Currently, the code blindly cuts the message array in half (`Math.ceil(window.length / 2)`). If the first half contains 10 very short messages, and the second half contains 2 massive document-sized messages, the remaining active window might *still* exceed the token threshold immediately after summarization.
2. **Synchronous Summarization in the Critical Path**: Summarization is awaited during the `addMessage` flow. While LangGraph handles the agent's time-to-respond, doing LLM summarization synchronously on the main thread inline with chat processing can lead to occasional high-latency spikes for the end user when the threshold is hit.
3. **Token Limit Configuration Visibility**: The constants `maxWindowTokens` and `summarisationThreshold` live in `MEMORY_CONFIG` (imported from `src/constants/vector-store.ts`). Best practice dictates these should be environment variables (`ConfigService`) so DevOps can tune them dynamically without a code redeploy.

## Technical Design (Refinement Guidelines)

Since the `TokenCounterService` using `tiktoken` already exists, the task for the Senior Developer is to **refactor and harden** the existing implementation to make it more bulletproof under edge-case production loads.

### 1. Refine the Sliding Window Algorithm (Token-Aware Splitting)
Instead of slicing the array by message count (`length / 2`), the algorithm should slice by **token weight**.

**Task**: Update `summarise(userId: string)` in `ShortTermMemoryService`.
- Iterate through the `window` array from oldest to newest.
- Accumulate `message.tokenCount` until you reach approximately 50% (or a configurable flush percentage) of `MEMORY_CONFIG.maxWindowTokens`.
- Summarize *those* accumulated messages.
- Keep the rest. This guarantees the remaining window is strictly under the memory limit.

### 2. Move Configurations to Environment Variables
**Task**: Refactor `MEMORY_CONFIG` dependencies to use NestJS `@nestjs/config`.
- Introduce `STM_MAX_WINDOW_TOKENS` (default: 3000)
- Introduce `STM_SUMMARISATION_THRESHOLD` (default: 0.8)
- Inject `ConfigService` into `ShortTermMemoryService` to read these values dynamically.

### 3. Background Summarization (Optional but Recommended)
**Task**: Decouple the LLM summarization call from the User's critical path.
- When `addMessage` detects a threshold breach, it should emit an event or push a job to a queue (e.g., BullMQ) to handle the summarization asynchronously.
- The active window can temporarily exceed the limit (safely, since 3000 tokens is far below GPT-4o's 128k context window) while the background worker computes the summary and trims the cache.

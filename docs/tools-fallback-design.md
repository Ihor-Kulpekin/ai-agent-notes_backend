# Tools Fallback Architecture: Bind First, Fallback Second

У цьому документі ми аналізуємо проблему відмовостійкості (Resilience) при виклику Agent Tools у LangChain/LangGraph та проєктуємо архітектурне рішення для її усунення. 

## The Problem
В нашій актуальній архітектурі (`LlmService` + `agent.graph.ts`) механізм Provider Fallbacks реалізований наступним чином: ми створюємо `primary` модель (gpt-4o), обгортаємо її резервною моделлю через `primary.withFallbacks({ fallbacks: [backup] })` і отримуємо екземпляр `RunnableWithFallbacks`.

Цей екземпляр чудово працює у звичайній генерації тексту (`generator` node). Проте, у LangChain метод `.bindTools()` існує **виключно** на класі `BaseChatModel` (або `ChatOpenAI`), але **відсутній** у класі `RunnableWithFallbacks`.

Через це ми були змушені прокинути в `tools_caller` "сиру" модель (`llmRaw`), яка не має `withFallbacks`.
**Наслідок:** Якщо під час виклику інструменту `llmRaw.invoke` API OpenAI поверне помилку `500 Internal Server Error` (або `429 Too Many Requests`), нода `tools_caller` миттєво впаде з помилкою. Граф перерветься і не зробить жодної спроби викликати резервну модель. 

## The Architecture: "Bind first, Fallback second"
Щоб зберегти і типізацію, і відмовостійкість, ми не можемо спочатку об'єднати моделі у Fallback-ланцюг, а потім прив'язати до ланцюга інструменти.
Правильний архітектурний патерн — **Bind first, Fallback second**.

**Суть патерну:**
1. Ми беремо сиру `primary` модель і робимо їй `.bindTools(tools)`. (TypeScript розуміє це)
2. Ми беремо сиру `backup` модель і **також** робимо їй `.bindTools(tools)`. 
3. ТІЛЬКИ ПІСЛЯ ЦЬОГО ми викликаємо `.withFallbacks()` на прив'язаній (bound) primary моделі, передаючи їй масив прив'язаних (bound) backup моделей.

Результатом буде новий `RunnableWithFallbacks`, який вже містить у собі знання про інструменти і може безпечно використовуватися у ноді `tools_caller`.

## Technical Specification (ТЗ для розробника)

Розробнику необхідно виконати наступні три кроки для рефакторингу:

### 1. Передати обидві сирі моделі в `buildAgentGraph`
У `agent.service.ts` необхідно отримати з `LlmService` дві чисті, сирі моделі:
- `primaryRaw` (через існуючий метод `getModel()`)
- `backupRaw` (через метод `getFastModel()`, який налаштований на `gpt-4o-mini` зі збільшеним `maxRetries`).

Передати їх як аргументи функції `buildAgentGraph`.

### 2. Створити Bound Fallback Chain у файлі `agent.graph.ts`
У функції `buildAgentGraph`:

```typescript
// 1. Створюємо інструменти
const tools = createAgentTools(primaryRaw, vectorStore);

// 2. В'яжемо інструменти до ОБИДВОХ сирих моделей
const primaryWithTools = primaryRaw.bindTools(tools);
const backupWithTools = backupRaw.bindTools(tools);

// 3. Об'єднуємо їх у єдиний стійкий Runnable (Bind First, Fallback Second)
const resilientToolsCallerLlm = primaryWithTools.withFallbacks({
  fallbacks: [backupWithTools],
});
```

### 3. Оновити ноду `tools_caller`
Передати `resilientToolsCallerLlm` всередину `createToolsCallerNode`.
```typescript
.addNode('tools_caller', createToolsCallerNode(resilientToolsCallerLlm))
```

### Типізація (TypeScript)
Під час конструювання `resilientToolsCallerLlm` метод `.withFallbacks()` поверне `Runnable`. Перехвати це значення та передай його у `createToolsCallerNode`, яка вже очікує інтерфейс `Runnable`. Ніяких `as any` або `@ts-expect-error` для цього блоку не потрібно, оскільки ми оперуємо в рамках стандартних класів `Runnable` від LangChain Core.

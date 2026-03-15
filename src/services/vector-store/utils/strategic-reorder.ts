/**
 * Strategic Context Reordering ("hourglass" pattern).
 *
 * Перерозподіляє масив (відсортований від найрелевантнішого до найменш
 * релевантного) так, щоб найважливіші елементи опинилися на початку та
 * в кінці нового масиву, а найменш важливі — в середині.
 *
 * Це мінімізує ефект "Lost-in-the-Middle", коли LLM погано зчитує
 * інформацію з центру довгого контексту.
 *
 * Алгоритм (два вказівники):
 *   - непарні кроки (0, 2, 4...) → заповнення зліва (початок)
 *   - парні кроки  (1, 3, 5...) → заповнення справа (кінець)
 *
 * Приклад: [1,2,3,4,5] → [1,3,5,4,2]
 *   де 1 — найрелевантніший, 5 — найменш релевантний.
 */
export function strategicReorder<T>(items: T[]): T[] {
  const result = new Array<T>(items.length);
  let left = 0;
  let right = items.length - 1;

  for (let i = 0; i < items.length; i++) {
    if (i % 2 === 0) {
      result[left++] = items[i];
    } else {
      result[right--] = items[i];
    }
  }

  return result;
}
# Forbidden Practices (Тиморське ТАБУ)

Суворо **ЗАБОРОНЕНО** наступне:
1. **`console.log`**: Замінювати на `Logger` з `@nestjs/common`.
2. **`TODO: implement`**: Залишення таких заглушок у робочому коді блокується.
3. **Nested callbacks (Callback Hell)**: Це "брудний код". Використовувати `async/await` замість вкладених колбеків.
4. **Прямі імпорти циклічних залежностей**: Заборонено мати circular dependencies. Використовувати патерни типу Mediator або кастомні EventEmitters для їх уникнення.

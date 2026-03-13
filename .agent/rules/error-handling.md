# Error Handling
- **NestJS Exceptions**: Використовувати виключно кастомні NestJS Exceptions (наприклад, `RpcException` для мікросервісів або кастомні `HttpException`). 
- **Логування**: Жодних `console.log`. Логування має відбуватися виключно через вбудований NestJS `Logger`.

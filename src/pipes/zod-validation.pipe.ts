import { PipeTransform, BadRequestException } from '@nestjs/common';
import { ZodSchema } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    try {
      const parsedValue = this.schema.parse(value);
      return parsedValue;
    } catch (error) {
      if (error && typeof error === 'object' && 'errors' in error) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: (error as { errors: unknown }).errors,
        });
      }
      throw new BadRequestException('Validation failed');
    }
  }
}

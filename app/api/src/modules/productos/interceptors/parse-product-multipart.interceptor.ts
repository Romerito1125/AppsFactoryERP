import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

@Injectable()
export class ParseProductMultipartInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.body) {
      this.parseJsonField(request.body, 'tagIds');
      this.parseJsonField(request.body, 'providerIds');
      this.parseJsonField(request.body, 'prices');
      this.parseJsonField(request.body, 'warehouses');
      this.parseJsonField(request.body, 'barcodes');
      this.parseJsonField(request.body, 'packaging');
    }

    return next.handle();
  }

  private parseJsonField(body: Record<string, unknown>, field: string) {
    const value = body[field];

    if (value === undefined || value === null || Array.isArray(value)) return;
    if (typeof value !== 'string') return;

    const trimmedValue = value.trim();
    if (!trimmedValue) {
      delete body[field];
      return;
    }

    try {
      body[field] = JSON.parse(trimmedValue);
    } catch {
      throw new BadRequestException(
        `${field} debe enviarse como JSON válido en form-data`,
      );
    }
  }
}

import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { errorMessages, isApplicationErrorCode } from './error-codes.js';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request & { requestId?: string }>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const supplied = body && typeof body === 'object' ? body as Record<string, unknown> : undefined;
    const code = isApplicationErrorCode(supplied?.code) ? supplied.code : status >= 500 ? 'INTERNAL_ERROR' : status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'AUTH_ACCESS_DENIED' : status === 429 ? 'RATE_LIMITED' : `HTTP_${status}`;
    const message = isApplicationErrorCode(code) ? errorMessages[code] : status === 404 ? 'The requested resource was not found.' : 'The request could not be completed.';
    const details = status === 400 && Array.isArray(supplied?.message) ? { fields: supplied.message } : undefined;
    if (status >= 500) console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', requestId: request.requestId, code, errorType: exception instanceof Error ? exception.name : 'UnknownError' }));
    response.status(status).json({ code, message, ...(details ? { details } : {}), requestId: request.requestId });
  }
}

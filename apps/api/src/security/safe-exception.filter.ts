import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { isApplicationErrorCode } from './error-codes.js';
import { localizeError, resolveLanguage } from '../i18n/localize.js';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request & { requestId?: string }>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const supplied = body && typeof body === 'object' ? body as Record<string, unknown> : undefined;
    const code = isApplicationErrorCode(supplied?.code) ? supplied.code : status >= 500 ? 'INTERNAL_ERROR' : status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'AUTH_ACCESS_DENIED' : status === 429 ? 'RATE_LIMITED' : `HTTP_${status}`;
    const language = resolveLanguage(request.headers['accept-language']);
    const message = localizeError(code, language);
    const details = status === 400 && Array.isArray(supplied?.message)
      ? { fields: language === 'zh'
        ? supplied.message.map((item) => typeof item === 'string' ? `${item.match(/^[A-Za-z][A-Za-z0-9_.]*/)?.[0] ?? '请求'}字段无效。` : '请求字段无效。')
        : supplied.message }
      : undefined;
    if (status >= 500) console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', requestId: request.requestId, code, errorType: exception instanceof Error ? exception.name : 'UnknownError' }));
    response.status(status).json({ code, message, ...(details ? { details } : {}), requestId: request.requestId });
  }
}

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { errorMessages, type ApplicationErrorCode } from './error-codes.js';

type ErrorBody = { code: ApplicationErrorCode; message: string };

const body = (code: ApplicationErrorCode): ErrorBody => ({ code, message: errorMessages[code] });

export const badRequest = (code: ApplicationErrorCode) => new BadRequestException(body(code));
export const conflict = (code: ApplicationErrorCode) => new ConflictException(body(code));
export const forbidden = (code: ApplicationErrorCode) => new ForbiddenException(body(code));
export const notFound = (code: ApplicationErrorCode) => new NotFoundException(body(code));
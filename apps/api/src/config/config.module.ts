import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { envSchema } from './env.schema.js';
@Global()
@Module({ imports: [NestConfigModule.forRoot({ isGlobal: true, validate: (config) => envSchema.parse(config) })] })
export class ConfigModule {}

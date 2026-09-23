import { createApp } from './app.factory.js';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen(process.env.API_PORT ?? 3000);
}
void bootstrap();

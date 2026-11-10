import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { envs } from './config/envs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // Los soportes de pago viajan como Base64. Dejamos margen para la expansión
  // del archivo y el resto de la factura/recibo para evitar 413 prematuros.
  app.use(json({ limit: '24mb' }));
  app.use(urlencoded({ extended: true, limit: '24mb' }));
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  await app.listen(envs.port, '0.0.0.0');
}
bootstrap();

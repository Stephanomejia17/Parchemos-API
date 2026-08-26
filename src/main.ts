import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // El refresh token viaja en una cookie httpOnly; hay que poder leerla.
  app.use(cookieParser());

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta campos no declarados en el DTO
      forbidNonWhitelisted: true, // y avisa si llegan (posible manipulacion)
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // credentials: true es imprescindible para que el navegador envie la cookie
  // del refresh token desde el front.
  app.enableCors({
    origin: config.get<string[]>('CORS_ORIGINS', ['http://localhost:3000']),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  new Logger('Bootstrap').log(
    `Parchemos API escuchando en http://localhost:${port}/api`,
  );
}

void bootstrap();

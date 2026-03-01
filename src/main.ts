import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      stopAtFirstError: true,
    }),
  );

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('Betting API')
    .setDescription('Cyber-sports betting platform API')
    .setVersion('1.0')
    .addTag('auth', 'Authentication')
    .addTag('users', 'User management')
    .addTag('matches', 'Match management')
    .addTag('bets', 'Betting operations')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);

  console.log(
    `🚀 API running on: http://localhost:${process.env.PORT ?? 3000}`,
  );
  console.log(
    `📚 Swagger docs: http://localhost:${process.env.PORT ?? 3000}/api`,
  );
}
bootstrap();

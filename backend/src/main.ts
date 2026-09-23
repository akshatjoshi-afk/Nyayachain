import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

// Load environment variables from .env before anything else
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  // Enable CORS so the React frontend can call the backend
  app.enableCors({
    origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'] : ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Global API prefix — all routes become /api/...
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log(`\n🏛️  NyayaChain Backend running on port: ${port}`);
  console.log(`📡  API prefix: /api`);
  console.log(`\n  Endpoints:`);
  console.log(`    POST   /api/auth/login`);
  console.log(`    POST   /api/documents/upload   [JWT required]`);
  console.log(`    GET    /api/documents           [JWT required]`);
  console.log(`    POST   /api/documents/verify    [JWT required]`);
  console.log(`    GET    /api/audit               [JWT + ADMIN role required]`);
}

bootstrap();

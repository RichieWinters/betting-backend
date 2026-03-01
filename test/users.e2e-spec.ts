import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        stopAtFirstError: true,
      }),
    );

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Clean database before tests
    await prisma.bet.deleteMany();
    await prisma.match.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.bet.deleteMany();
    await prisma.match.deleteMany();
    await prisma.user.deleteMany();

    await app.close();
  });

  describe('/users (GET)', () => {
    it('should return empty array initially', () => {
      return request(app.getHttpServer()).get('/users').expect(200).expect([]);
    });
  });

  describe('/users (POST)', () => {
    it('should create a new user', () => {
      return request(app.getHttpServer())
        .post('/users')
        .send({
          name: 'Michael',
          balance: 1000,
          email: 'michael@meandmichael.com',
          password: 'password123',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.name).toBe('Michael');
          expect(res.body.balance).toBe(1000);
          expect(res.body.email).toBe('michael@meandmichael.com');
          expect(res.body.password).toBe('password123');
        });
    });

    it('should use default balance', () => {
      return request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Bob', email: 'bob@bob.com', password: 'password12345' })
        .expect(201)
        .expect((res) => {
          expect(res.body.balance).toBe(1000);
          expect(res.body.email).toBe('bob@bob.com');
          expect(res.body.password).toBe('password12345');
        });
    });

    it('should fail without name', () => {
      return request(app.getHttpServer())
        .post('/users')
        .send({
          balance: 500,
          email: 'alice@alice.com',
          password: 'password123',
        })
        .expect(400);
    });
  });

  describe('/users (GET) after creation', () => {
    it('should return all users', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].name).toBe('Michael');
      expect(response.body[1].name).toBe('Bob');
    });
  });
});

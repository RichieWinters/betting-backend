import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { type Server } from 'http';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

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

    await prisma.bet.deleteMany();
    await prisma.match.deleteMany();
    await prisma.user.deleteMany();

    // Seed admin user and obtain JWT for protected endpoints
    const hashedPassword = await bcrypt.hash('Admin1234!', 10);
    await prisma.user.create({
      data: {
        name: 'Admin',
        email: 'admin@test.com',
        password: hashedPassword,
        role: 'ADMIN',
      },
    });

    const loginRes = await request(app.getHttpServer() as Server)
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'Admin1234!' });

    adminToken = (loginRes.body as { token: string }).token;
  });

  afterAll(async () => {
    await prisma.bet.deleteMany();
    await prisma.match.deleteMany();
    await prisma.user.deleteMany();

    await app.close();
  });

  describe('GET /users', () => {
    it('returns 401 without a token', () => {
      return request(app.getHttpServer() as Server).get('/users').expect(401);
    });

    it('returns only the seeded admin before any user is created', async () => {
      const res = await request(app.getHttpServer() as Server)
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = res.body as { name: string }[];
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('Admin');
    });
  });

  describe('POST /users', () => {
    it('returns 401 without a token', () => {
      return request(app.getHttpServer() as Server)
        .post('/users')
        .send({ name: 'Ghost', email: 'ghost@test.com', password: 'pass123' })
        .expect(401);
    });

    it('creates a user with a provided balance', async () => {
      const res = await request(app.getHttpServer() as Server)
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Michael',
          balance: 1000,
          email: 'michael@meandmichael.com',
          password: 'password123',
        })
        .expect(201);

      const body = res.body as { id: number; name: string; balance: number; email: string };
      expect(body).toHaveProperty('id');
      expect(body.name).toBe('Michael');
      expect(body.balance).toBe(1000);
      expect(body.email).toBe('michael@meandmichael.com');
      expect(body).not.toHaveProperty('password');
    });

    it('creates a user using the default balance when none is supplied', async () => {
      const res = await request(app.getHttpServer() as Server)
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bob', email: 'bob@bob.com', password: 'password12345' })
        .expect(201);

      const body = res.body as { balance: number; email: string };
      expect(body.balance).toBe(1000);
      expect(body.email).toBe('bob@bob.com');
      expect(body).not.toHaveProperty('password');
    });

    it('returns 400 when name is missing', () => {
      return request(app.getHttpServer() as Server)
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ balance: 500, email: 'alice@alice.com', password: 'password123' })
        .expect(400);
    });
  });

  describe('GET /users after creation', () => {
    it('returns all users including the seeded admin', async () => {
      const res = await request(app.getHttpServer() as Server)
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = res.body as { name: string }[];
      // Admin + Michael + Bob
      expect(body).toHaveLength(3);
      const names = body.map((u) => u.name);
      expect(names).toContain('Admin');
      expect(names).toContain('Michael');
      expect(names).toContain('Bob');
    });
  });

  // ─── GET /users/me ─────────────────────────────────────────────────────────

  describe('GET /users/me', () => {
    let userToken: string;
    let registeredUserId: number;
    let registeredEmail: string;

    beforeAll(async () => {
      registeredEmail = 'me-user@test.com';
      const registerRes = await request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({
          name: 'MeUser',
          email: registeredEmail,
          password: 'password123',
        });
      const body = registerRes.body as { token: string; user: { id: number } };
      userToken = body.token;
      registeredUserId = body.user.id;
    });

    it('returns 200 with own id and email', async () => {
      const res = await request(app.getHttpServer() as Server)
        .get('/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const body = res.body as { id: number; email: string };
      expect(body.id).toBe(registeredUserId);
      expect(body.email).toBe(registeredEmail);
    });

    it('returns 401 without a token', () => {
      return request(app.getHttpServer() as Server)
        .get('/users/me')
        .expect(401);
    });
  });

  // ─── POST /users/replenish ─────────────────────────────────────────────────

  describe('POST /users/replenish', () => {
    let replenishToken: string;
    let replenishUserId: number;

    beforeAll(async () => {
      const registerRes = await request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({
          name: 'ReplenishUser',
          email: 'replenish@test.com',
          password: 'password123',
        });
      const body = registerRes.body as { token: string; user: { id: number } };
      replenishToken = body.token;
      replenishUserId = body.user.id;

      // Set a known starting balance
      await prisma.user.update({
        where: { id: replenishUserId },
        data: { balance: 500 },
      });
    });

    it('returns 200 and the new balance equals previous balance + amount', async () => {
      const amount = 250;

      const res = await request(app.getHttpServer() as Server)
        .post('/users/replenish')
        .set('Authorization', `Bearer ${replenishToken}`)
        .send({ amount })
        .expect(200);

      expect((res.body as { balance: number }).balance).toBe(500 + amount);
    });

    it('returns 401 without a token', () => {
      return request(app.getHttpServer() as Server)
        .post('/users/replenish')
        .send({ amount: 100 })
        .expect(401);
    });
  });

  // ─── PATCH /users/:id/ban and PATCH /users/:id/unban ──────────────────────

  describe('PATCH /users/:id/ban and PATCH /users/:id/unban', () => {
    let targetToken: string;
    let targetUserId: number;
    let regularUserToken: string;

    beforeAll(async () => {
      // User to be banned/unbanned
      const targetRes = await request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({
          name: 'BanTarget',
          email: 'bantarget@test.com',
          password: 'password123',
        });
      const targetBody = targetRes.body as {
        token: string;
        user: { id: number };
      };
      targetToken = targetBody.token;
      targetUserId = targetBody.user.id;

      // A plain user for the 403 guard test
      const regularRes = await request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({
          name: 'RegularUser',
          email: 'regular@test.com',
          password: 'password123',
        });
      regularUserToken = (regularRes.body as { token: string }).token;
    });

    it('admin bans user; banned user login returns 401 "Account is banned"', async () => {
      await request(app.getHttpServer() as Server)
        .patch(`/users/${targetUserId}/ban`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      return request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({ email: 'bantarget@test.com', password: 'password123' })
        .expect(401)
        .expect((res) => {
          expect((res.body as { message: string }).message).toContain(
            'Account is banned',
          );
        });
    });

    it('admin unbans user; user can login again', async () => {
      await request(app.getHttpServer() as Server)
        .patch(`/users/${targetUserId}/unban`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      return request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({ email: 'bantarget@test.com', password: 'password123' })
        .expect(200);
    });

    it('returns 403 when a regular user tries to ban another user', () => {
      return request(app.getHttpServer() as Server)
        .patch(`/users/${targetUserId}/ban`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);
    });
  });
});

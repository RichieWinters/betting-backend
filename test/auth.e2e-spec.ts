import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { type Server } from 'http';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
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

    await prisma.bet.deleteMany();
    await prisma.match.deleteMany();
    await prisma.user.deleteMany();

    // Seed an admin so that ban tests can reference a real admin login
    const hashedPassword = await bcrypt.hash('Admin1234!', 10);
    await prisma.user.create({
      data: {
        name: 'Admin',
        email: 'admin@authtest.com',
        password: hashedPassword,
        role: 'ADMIN',
      },
    });
  });

  afterAll(async () => {
    await prisma.bet.deleteMany();
    await prisma.match.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  // ─── POST /auth/register — validation ──────────────────────────────────────

  describe('POST /auth/register — validation', () => {
    it('returns 400 for a duplicate email', async () => {
      await request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({
          name: 'FirstUser',
          email: 'dup@test.com',
          password: 'password123',
        })
        .expect(201);

      return request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({
          name: 'SecondUser',
          email: 'dup@test.com',
          password: 'password123',
        })
        .expect(400)
        .expect((res) => {
          expect((res.body as { message: string }).message).toContain(
            'Email already in use',
          );
        });
    });

    it('returns 400 when name is missing', () => {
      return request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({ email: 'noname@test.com', password: 'password123' })
        .expect(400);
    });

    it('returns 400 when password is shorter than 6 characters', () => {
      return request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({ name: 'ShortPw', email: 'short@test.com', password: '12345' })
        .expect(400);
    });

    it('returns 400 for an invalid email format', () => {
      return request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({
          name: 'BadEmail',
          email: 'not-an-email',
          password: 'password123',
        })
        .expect(400);
    });
  });

  // ─── POST /auth/login — failure paths ──────────────────────────────────────

  describe('POST /auth/login — failure paths', () => {
    it('returns 401 with "Invalid credentials" for a wrong password', () => {
      return request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({ email: 'admin@authtest.com', password: 'WrongPassword!' })
        .expect(401)
        .expect((res) => {
          expect((res.body as { message: string }).message).toContain(
            'Invalid credentials',
          );
        });
    });

    it('returns 401 with "Invalid credentials" for an unknown email', () => {
      return request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({ email: 'nobody@nowhere.com', password: 'password123' })
        .expect(401)
        .expect((res) => {
          expect((res.body as { message: string }).message).toContain(
            'Invalid credentials',
          );
        });
    });

    it('returns 401 with "Account is banned" for a banned user', async () => {
      await request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({
          name: 'ToBeBanned',
          email: 'banned@authtest.com',
          password: 'password123',
        })
        .expect(201);

      await prisma.user.update({
        where: { email: 'banned@authtest.com' },
        data: { isBanned: true },
      });

      return request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({ email: 'banned@authtest.com', password: 'password123' })
        .expect(401)
        .expect((res) => {
          expect((res.body as { message: string }).message).toContain(
            'Account is banned',
          );
        });
    });
  });

  // ─── Forgot-password + reset-password flow ─────────────────────────────────

  describe('POST /auth/forgot-password + POST /auth/reset-password', () => {
    it('unknown email returns the same message as a known email (non-enumerable)', async () => {
      const [knownRes, unknownRes] = await Promise.all([
        request(app.getHttpServer() as Server)
          .post('/auth/forgot-password')
          .send({ email: 'admin@authtest.com' }),
        request(app.getHttpServer() as Server)
          .post('/auth/forgot-password')
          .send({ email: 'doesnotexist@authtest.com' }),
      ]);

      expect(knownRes.status).toBe(200);
      expect(unknownRes.status).toBe(200);
      expect((knownRes.body as { message: string }).message).toBe(
        (unknownRes.body as { message: string }).message,
      );
    });

    it('full reset flow: register → forgot-password → reset-password → login with new password', async () => {
      await request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({
          name: 'ResetUser',
          email: 'reset@authtest.com',
          password: 'originalPassword123',
        })
        .expect(201);

      await request(app.getHttpServer() as Server)
        .post('/auth/forgot-password')
        .send({ email: 'reset@authtest.com' })
        .expect(200);

      const dbUser = await prisma.user.findUnique({
        where: { email: 'reset@authtest.com' },
      });
      expect(dbUser!.resetToken).toBeTruthy();

      await request(app.getHttpServer() as Server)
        .post('/auth/reset-password')
        .send({
          token: dbUser!.resetToken,
          newPassword: 'newStrongPassword123',
        })
        .expect(200);

      const loginRes = await request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({
          email: 'reset@authtest.com',
          password: 'newStrongPassword123',
        })
        .expect(200);

      expect((loginRes.body as { token: string }).token).toBeTruthy();
    });

    it('returns 400 for an expired reset token', async () => {
      await request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({
          name: 'ExpiredUser',
          email: 'expired@authtest.com',
          password: 'password123',
        })
        .expect(201);

      await prisma.user.update({
        where: { email: 'expired@authtest.com' },
        data: {
          resetToken: 'expired-token-abc123',
          resetTokenExpiry: new Date(Date.now() - 3_600_000), // 1 hour ago
        },
      });

      return request(app.getHttpServer() as Server)
        .post('/auth/reset-password')
        .send({
          token: 'expired-token-abc123',
          newPassword: 'newPassword123',
        })
        .expect(400)
        .expect((res) => {
          expect((res.body as { message: string }).message).toContain(
            'Invalid or expired reset token',
          );
        });
    });
  });

  // ─── JWT guard edge cases ──────────────────────────────────────────────────

  describe('JWT guard edge cases', () => {
    it('returns 401 for a malformed bearer token', () => {
      return request(app.getHttpServer() as Server)
        .get('/users/me')
        .set('Authorization', 'Bearer garbage')
        .expect(401);
    });

    it('returns 401 when a user is banned mid-session (old token rejected)', async () => {
      const registerRes = await request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({
          name: 'MidSession',
          email: 'midsession@authtest.com',
          password: 'password123',
        })
        .expect(201);

      const { token } = registerRes.body as { token: string };

      // Ban the user directly via Prisma (simulates admin action)
      await prisma.user.update({
        where: { email: 'midsession@authtest.com' },
        data: { isBanned: true },
      });

      return request(app.getHttpServer() as Server)
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });
});

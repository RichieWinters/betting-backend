import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Betting Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: number;
  let matchId: number;

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

    // Clean database
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

  it('should create a user', async () => {
    const response = await request(app.getHttpServer())
      .post('/users')
      .send({
        name: 'Gambler',
        balance: 1000,
        email: 'gambler@test.com',
        password: 'password123',
      })
      .expect(201);

    userId = response.body.id;
    expect(response.body.balance).toBe(1000);
  });

  it('should create a match', async () => {
    const response = await request(app.getHttpServer())
      .post('/matches')
      .send({
        date: '2026-03-15T20:00:00Z',
        sportType: 'DOTA2',
        teamA: 'NaVi',
        teamB: 'Virtus.pro',
      })
      .expect(201);

    matchId = response.body.id;
    expect(response.body.status).toBe('PENDING');
  });

  it('should place a bet successfully', async () => {
    const response = await request(app.getHttpServer())
      .post('/bets')
      .send({
        userId,
        matchId,
        amount: 200,
        team: 'NaVi',
      })
      .expect(201);

    expect(response.body.amount).toBe(200);
    expect(response.body.team).toBe('NaVi');
    expect(response.body.user.balance).toBe(800); // 1000 - 200
  });

  it('should fail to bet with insufficient balance', async () => {
    return request(app.getHttpServer())
      .post('/bets')
      .send({
        userId,
        matchId,
        amount: 1000, // User only has 800 left
        team: 'NaVi',
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toContain('Insufficient balance');
      });
  });

  it('should fail to bet on wrong team', async () => {
    return request(app.getHttpServer())
      .post('/bets')
      .send({
        userId,
        matchId,
        amount: 50,
        team: 'WrongTeam',
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toContain('must be either');
      });
  });

  it('should update match status', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/matches/${matchId}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);

    expect(response.body.status).toBe('IN_PROGRESS');
  });

  it('should fail to bet on non-pending match', async () => {
    return request(app.getHttpServer())
      .post('/bets')
      .send({
        userId,
        matchId,
        amount: 50,
        team: 'NaVi',
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toContain('pending');
      });
  });

  it('should complete match with winner', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/matches/${matchId}`)
      .send({
        status: 'COMPLETED',
        winner: 'NaVi',
      })
      .expect(200);

    expect(response.body.status).toBe('COMPLETED');
    expect(response.body.winner).toBe('NaVi');
  });

  it('should get all bets', async () => {
    const response = await request(app.getHttpServer())
      .get('/bets')
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].amount).toBe(200);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UserService', () => {
  let service: UserService;
  let prisma: PrismaService;

  const mockUsers = [
    {
      id: 1,
      name: 'Michael',
      balance: 1000,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      name: 'Bob',
      balance: 500,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const mockPrisma = {
    user: {
      findMany: jest.fn().mockResolvedValue(mockUsers),
      create: jest.fn().mockResolvedValue(mockUsers[0]),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should use provided balance', async () => {
      const createUserDto = { name: 'Alice', balance: 500 };
      await service.create(createUserDto);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { name: 'Alice', balance: 500 },
      });
    });

    it('should use default balance (1000) when not provided', async () => {
      const createUserDto = { name: 'Bob' };
      await service.create(createUserDto);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { name: 'Bob', balance: 1000 },
      });
    });

    it('should use default balance (1000) when balance is undefined', async () => {
      const createUserDto = { name: 'Charlie', balance: undefined };
      await service.create(createUserDto);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { name: 'Charlie', balance: 1000 },
      });
    });
  });
});

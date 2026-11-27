import { Request, Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import prisma from '../config/prisma';
import { hashPassword } from '../utils/password';

const createStaffSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

const staffPublicSelect = {
  id: true,
  organizationId: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/**
 * Create a new STAFF member under the authenticated owner's organization.
 */
export async function createStaff(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.issues,
    });
    return;
  }

  const { name, email, password } = parsed.data;

  try {
    const passwordHash = await hashPassword(password);

    const staffMember = await prisma.user.create({
      data: {
        organizationId: req.user.organizationId,
        name,
        email,
        passwordHash,
        role: Role.STAFF,
      },
      select: staffPublicSelect,
    });

    res.status(201).json({ staff: staffMember });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      res.status(409).json({
        error: 'A user with this email already exists in this organization',
      });
      return;
    }

    console.error('createStaff error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * List all OWNER and STAFF users belonging to the authenticated user's organization.
 */
export async function listStaff(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const staff = await prisma.user.findMany({
      where: {
        organizationId: req.user.organizationId,
        role: { in: [Role.OWNER, Role.STAFF] },
      },
      select: staffPublicSelect,
      orderBy: { createdAt: 'asc' },
    });

    res.status(200).json({ staff });
  } catch (error) {
    console.error('listStaff error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

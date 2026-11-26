import { Request, Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import prisma from '../config/prisma';
import { comparePassword, hashPassword } from '../utils/password';
import { signToken } from '../utils/jwt';

const registerOwnerSchema = z.object({
  organizationName: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'Slug must be at least 2 characters')
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  slug: z.string().trim().toLowerCase().min(1, 'Organization slug is required'),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const userPublicSelect = {
  id: true,
  organizationId: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const organizationSelect = {
  id: true,
  name: true,
  slug: true,
  timezone: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrganizationSelect;

/**
 * Register a new organization and its initial OWNER account inside a single transaction.
 */
export async function registerOwner(req: Request, res: Response): Promise<void> {
  const parsed = registerOwnerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.issues,
    });
    return;
  }

  const { organizationName, slug, name, email, password } = parsed.data;

  try {
    const passwordHash = await hashPassword(password);

    const { organization, user } = await prisma.$transaction(async (tx) => {
      const createdOrg = await tx.organization.create({
        data: {
          name: organizationName,
          slug,
        },
        select: organizationSelect,
      });

      const createdUser = await tx.user.create({
        data: {
          organizationId: createdOrg.id,
          name,
          email,
          passwordHash,
          role: Role.OWNER,
        },
        select: userPublicSelect,
      });

      return { organization: createdOrg, user: createdUser };
    });

    const token = signToken({
      userId: user.id,
      organizationId: organization.id,
      role: user.role,
    });

    res.status(201).json({
      user,
      organization,
      token,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(', ')
        : String(error.meta?.target ?? '');

      const message = target.includes('slug')
        ? 'An organization with this slug already exists'
        : 'A user with this email already exists in this organization';

      res.status(409).json({ error: message });
      return;
    }

    console.error('registerOwner error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Authenticate a user against their organization slug, email, and password.
 */
export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.issues,
    });
    return;
  }

  const { slug, email, password } = parsed.data;

  try {
    const organization = await prisma.organization.findUnique({
      where: { slug },
      select: organizationSelect,
    });

    if (!organization) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: {
        organizationId_email: {
          organizationId: organization.id,
          email,
        },
      },
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const isPasswordValid = await comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signToken({
      userId: user.id,
      organizationId: organization.id,
      role: user.role,
    });

    const { passwordHash: _passwordHash, ...safeUser } = user;

    res.status(200).json({
      user: safeUser,
      organization,
      token,
    });
  } catch (error) {
    console.error('login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Return the authenticated user's profile and organization without passwordHash.
 */
export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const record = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        ...userPublicSelect,
        organization: {
          select: organizationSelect,
        },
      },
    });

    if (!record || record.organizationId !== req.user.organizationId) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { organization, ...user } = record;

    res.status(200).json({
      user,
      organization,
    });
  } catch (error) {
    console.error('getMe error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

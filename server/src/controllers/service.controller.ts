import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../config/prisma';

const createServiceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Service name must be at least 2 characters')
    .max(100, 'Service name must be at most 100 characters'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be at most 500 characters')
    .optional(),
  durationMinutes: z
    .number()
    .int('Duration must be a whole number of minutes')
    .positive('Duration must be greater than 0')
    .max(480, 'Duration must be at most 480 minutes'),
  bufferMinutes: z
    .number()
    .int('Buffer must be a whole number of minutes')
    .min(0, 'Buffer minutes cannot be negative')
    .max(120, 'Buffer must be at most 120 minutes')
    .default(0),
  priceInPaise: z
    .number()
    .int('Price must be a whole number in paise')
    .nonnegative('Price cannot be negative'),
});

const serviceSelect = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  durationMinutes: true,
  bufferMinutes: true,
  priceInPaise: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ServiceSelect;

/**
 * Create a new bookable service scoped to the authenticated owner's organization.
 */
export async function createService(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const parsed = createServiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.issues,
    });
    return;
  }

  const { name, description, durationMinutes, bufferMinutes, priceInPaise } = parsed.data;

  try {
    const service = await prisma.service.create({
      data: {
        organizationId: req.user.organizationId,
        name,
        description: description ?? null,
        durationMinutes,
        bufferMinutes,
        priceInPaise,
      },
      select: serviceSelect,
    });

    res.status(201).json({ service });
  } catch (error) {
    console.error('createService error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * List all active services belonging to the authenticated user's organization.
 */
export async function listServices(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const services = await prisma.service.findMany({
      where: {
        organizationId: req.user.organizationId,
        isActive: true,
      },
      select: serviceSelect,
      orderBy: { createdAt: 'asc' },
    });

    res.status(200).json({ services });
  } catch (error) {
    console.error('listServices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

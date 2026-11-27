import { Request, Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import prisma from '../config/prisma';

const timeFormatRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const upsertAvailabilitySchema = z
  .object({
    staffId: z.string().uuid('Invalid staffId'),
    dayOfWeek: z
      .number()
      .int('dayOfWeek must be an integer')
      .min(0, 'dayOfWeek must be between 0 (Sunday) and 6 (Saturday)')
      .max(6, 'dayOfWeek must be between 0 (Sunday) and 6 (Saturday)'),
    startTime: z.string().regex(timeFormatRegex, 'startTime must be in HH:mm format'),
    endTime: z.string().regex(timeFormatRegex, 'endTime must be in HH:mm format'),
    isAvailable: z.boolean().default(true),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: 'startTime must be earlier than endTime',
    path: ['endTime'],
  });

const availabilitySelect = {
  id: true,
  organizationId: true,
  staffId: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  isAvailable: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AvailabilitySelect;

/**
 * Create or update a staff member's weekly availability for a single day of the week.
 */
export async function upsertAvailability(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const parsed = upsertAvailabilitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.issues,
    });
    return;
  }

  const { staffId, dayOfWeek, startTime, endTime, isAvailable } = parsed.data;

  if (req.user.role === Role.STAFF && staffId !== req.user.userId) {
    res.status(403).json({ error: 'Staff members can only manage their own availability' });
    return;
  }

  try {
    const staffUser = await prisma.user.findUnique({
      where: { id: staffId },
      select: { id: true, organizationId: true, role: true },
    });

    if (
      !staffUser ||
      staffUser.organizationId !== req.user.organizationId ||
      (staffUser.role !== Role.OWNER && staffUser.role !== Role.STAFF)
    ) {
      res.status(404).json({ error: 'Staff member not found in this organization' });
      return;
    }

    const availability = await prisma.availability.upsert({
      where: {
        staffId_dayOfWeek: {
          staffId,
          dayOfWeek,
        },
      },
      update: {
        startTime,
        endTime,
        isAvailable,
      },
      create: {
        organizationId: req.user.organizationId,
        staffId,
        dayOfWeek,
        startTime,
        endTime,
        isAvailable,
      },
      select: availabilitySelect,
    });

    res.status(200).json({ availability });
  } catch (error) {
    console.error('upsertAvailability error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

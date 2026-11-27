import { Request, Response } from 'express';
import { BookingStatus, Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import prisma from '../config/prisma';
import { generateTimeSlots } from '../utils/slotGenerator';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const slugParamSchema = z.object({
  slug: z.string().trim().toLowerCase().min(1, 'Organization slug is required'),
});

const getSlotsQuerySchema = z.object({
  staffId: z.string().uuid('Invalid staffId'),
  serviceId: z.string().uuid('Invalid serviceId'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format')
    .refine((value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    }, 'date must be a valid calendar date'),
});

const organizationSelect = {
  id: true,
  name: true,
  slug: true,
  timezone: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrganizationSelect;

const publicServiceSelect = {
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

const publicStaffSelect = {
  id: true,
  organizationId: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/**
 * Return public storefront metadata, active services, and staff for an organization slug.
 */
export async function getPublicCatalog(req: Request, res: Response): Promise<void> {
  const parsedSlug = slugParamSchema.safeParse(req.params);
  if (!parsedSlug.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parsedSlug.error.issues,
    });
    return;
  }

  try {
    const organization = await prisma.organization.findUnique({
      where: { slug: parsedSlug.data.slug },
      select: organizationSelect,
    });

    if (!organization) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    const [services, staff] = await Promise.all([
      prisma.service.findMany({
        where: {
          organizationId: organization.id,
          isActive: true,
        },
        select: publicServiceSelect,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.user.findMany({
        where: {
          organizationId: organization.id,
          role: { in: [Role.OWNER, Role.STAFF] },
        },
        select: publicStaffSelect,
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    res.status(200).json({
      organization,
      services,
      staff,
    });
  } catch (error) {
    console.error('getPublicCatalog error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Compute available UTC booking slots for a given staff member, service, and date.
 */
export async function getPublicSlots(req: Request, res: Response): Promise<void> {
  const parsedSlug = slugParamSchema.safeParse(req.params);
  if (!parsedSlug.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parsedSlug.error.issues,
    });
    return;
  }

  const parsedQuery = getSlotsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parsedQuery.error.issues,
    });
    return;
  }

  const { staffId, serviceId, date } = parsedQuery.data;

  try {
    const organization = await prisma.organization.findUnique({
      where: { slug: parsedSlug.data.slug },
      select: { id: true, slug: true },
    });

    if (!organization) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    const [staffMember, service] = await Promise.all([
      prisma.user.findUnique({
        where: { id: staffId },
        select: { id: true, organizationId: true, role: true },
      }),
      prisma.service.findUnique({
        where: { id: serviceId },
        select: {
          id: true,
          organizationId: true,
          durationMinutes: true,
          bufferMinutes: true,
          isActive: true,
        },
      }),
    ]);

    if (
      !staffMember ||
      staffMember.organizationId !== organization.id ||
      (staffMember.role !== Role.OWNER && staffMember.role !== Role.STAFF)
    ) {
      res.status(404).json({ error: 'Staff member not found in this organization' });
      return;
    }

    if (!service || service.organizationId !== organization.id || !service.isActive) {
      res.status(404).json({ error: 'Active service not found in this organization' });
      return;
    }

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + MS_PER_DAY);
    const dayOfWeek = dayStart.getUTCDay();

    const availability = await prisma.availability.findUnique({
      where: {
        staffId_dayOfWeek: {
          staffId,
          dayOfWeek,
        },
      },
      select: {
        organizationId: true,
        startTime: true,
        endTime: true,
        isAvailable: true,
      },
    });

    if (
      !availability ||
      !availability.isAvailable ||
      availability.organizationId !== organization.id
    ) {
      res.status(200).json({
        date,
        dayOfWeek,
        serviceId,
        staffId,
        slots: [],
      });
      return;
    }

    const now = new Date();
    const bookedRanges = await prisma.booking.findMany({
      where: {
        organizationId: organization.id,
        staffId,
        startTime: { lt: dayEnd },
        endTime: { gt: dayStart },
        OR: [
          { status: BookingStatus.CONFIRMED },
          {
            status: BookingStatus.HELD,
            holdExpiresAt: { gt: now },
          },
        ],
      },
      select: {
        startTime: true,
        endTime: true,
      },
    });

    const slots = generateTimeSlots({
      workStart: availability.startTime,
      workEnd: availability.endTime,
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
      bookedRanges,
      dateStr: date,
    });

    res.status(200).json({
      date,
      dayOfWeek,
      serviceId,
      staffId,
      slots,
    });
  } catch (error) {
    console.error('getPublicSlots error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

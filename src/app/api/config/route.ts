import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  let config = await prisma.forecastConfig.findFirst();

  if (!config) {
    config = await prisma.forecastConfig.create({
      data: {
        currentYear: 2026,
        lastClosedMonth: 1,
        remainingMonths: 11,
        previousYear: 2025,
      },
    });
  }

  return NextResponse.json(config);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { currentYear, lastClosedMonth } = body;

  let config = await prisma.forecastConfig.findFirst();

  if (config) {
    config = await prisma.forecastConfig.update({
      where: { id: config.id },
      data: {
        currentYear: currentYear || config.currentYear,
        lastClosedMonth: lastClosedMonth ?? config.lastClosedMonth,
        remainingMonths: 12 - (lastClosedMonth ?? config.lastClosedMonth),
        previousYear: (currentYear || config.currentYear) - 1,
      },
    });
  } else {
    config = await prisma.forecastConfig.create({
      data: {
        currentYear: currentYear || 2026,
        lastClosedMonth: lastClosedMonth || 1,
        remainingMonths: 12 - (lastClosedMonth || 1),
        previousYear: (currentYear || 2026) - 1,
      },
    });
  }

  return NextResponse.json(config);
}

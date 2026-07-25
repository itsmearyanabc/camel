import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { image } = await request.json();
    if (!image || !image.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Invalid image data' }, { status: 400 });
    }

    // Save the base64 string directly to the database
    // This avoids filesystem write issues and Next.js static serving bugs in production
    await prisma.user.update({
      where: { id: session.userId },
      data: { avatarUrl: image }
    });

    return NextResponse.json({ success: true, avatarUrl: image });

  } catch (error) {
    console.error('Update avatar error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

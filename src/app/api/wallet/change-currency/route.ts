import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { currency } = await request.json();

    if (!['USD', 'EUR', 'RUB', 'UAH', 'KZT', 'TRY'].includes(currency)) {
      return NextResponse.json({ error: 'Invalid currency' }, { status: 400 });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId: session.userId }
    });

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    }

    // Removed balance restriction because wallet balance is intrinsically treated as USD,
    // and currency is now purely a display preference powered by real-time exchange rates.

    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { currency }
    });

    return NextResponse.json({ success: true, currency });
  } catch (error) {
    console.error('Change currency error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

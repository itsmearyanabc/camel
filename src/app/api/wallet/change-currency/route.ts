import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isDisplayCurrency } from '@/lib/botCurrency';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { currency } = await request.json();

    // Validated against the one shared list rather than a copy of it. This
    // used to be a hardcoded array, which is exactly how a currency offered in
    // the UI ends up rejected here - the bot and the website already agree via
    // DISPLAY_CURRENCIES, and now so does this endpoint.
    if (!isDisplayCurrency(currency)) {
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

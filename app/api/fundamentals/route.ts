import { NextResponse } from 'next/server';

/**
 * Fundamental analysis is intentionally paused until its operating costs are approved.
 * Keep the endpoint explicit so stale clients cannot trigger paid provider requests.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'L’assistant d’analyse fondamentale sera bientôt disponible.' },
    { status: 503, headers: { 'Cache-Control': 'private, no-store' } }
  );
}

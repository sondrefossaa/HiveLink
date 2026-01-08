import { getDaily } from "@/lib/get_Daily";

import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json(getDaily())
}

import { NextResponse } from 'next/server';
import { getDiff1Set, getPartsSet, getCompoundDict } from '@/utils/data';
import startWords from "@public/start_words.json"
import endWords from "@public/end_words.json"




export async function GET() {


  return NextResponse.json(Array.from(getCompoundDict()));
}

import { NextResponse } from 'next/server';
import { getDiff1Set, getPartsSet } from '@/utils/data';
import startWords from "@public/start_words.json"
import endWords from "@public/end_words.json"


let queue: Array<Map> = [];



export async function GET() {
  const partsSet = getPartsSet();
  const diff1Set = getDiff1Set();
  let pathLen = 0;
  let endWord = endWords[Math.floor(Math.random() * endWords.length)];
  for (let i = 0; i < 10; i++) {
    queue.push({
      path: [startWords[i]],
    }
    )
  }
  while (queue.length != 0) {
    let curr_word = queue.shift();

    // find a word that is assisiated

  }

  return NextResponse.json(Array.from(diff1Set));
}

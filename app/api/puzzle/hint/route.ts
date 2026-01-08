import { NextRequest } from "next/server";




export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  // Convert URLSearchParams to a plain object
  const params = Object.fromEntries(searchParams);
  const { path, currword } = params;

}

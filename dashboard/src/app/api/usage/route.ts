import { NextResponse } from "next/server"
import { readLatest } from "@/lib/storage"

export const dynamic = "force-dynamic" // don't cache — DB changes between requests

export async function GET() {
  const records = readLatest(1)
  if (records.length === 0) {
    return NextResponse.json({ source: null, latestRecord: null })
  }
  const latest = records[0]
  if (!latest) {
    return NextResponse.json({ source: null, latestRecord: null })
  }
  return NextResponse.json({
    source: latest.source,
    latestRecord: latest,
  })
}

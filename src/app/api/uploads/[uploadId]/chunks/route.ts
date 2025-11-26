"use server";

import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "node:buffer";

import { createClient } from "@/lib/supabase/server";

const SERVICE_URL = process.env.UPLOAD_SERVICE_URL;
const SERVICE_API_KEY = process.env.UPLOAD_SERVICE_API_KEY;

export async function POST(
  req: NextRequest,
  { params }: { params: { uploadId: string } }
) {
  if (!SERVICE_URL || !SERVICE_API_KEY) {
    return NextResponse.json(
      { error: "Upload service is not configured" },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chunkIndex = req.headers.get("x-chunk-index");
  if (!chunkIndex) {
    return NextResponse.json(
      { error: "Missing x-chunk-index header" },
      { status: 400 }
    );
  }

  const chunkBuffer = Buffer.from(await req.arrayBuffer());

  try {
    const response = await fetch(
      `${SERVICE_URL}/uploads/${params.uploadId}/chunks`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-API-Key": SERVICE_API_KEY,
          "X-User-Id": user.id,
          "X-Chunk-Index": chunkIndex,
          "X-Chunk-Checksum": req.headers.get("x-chunk-checksum") ?? "",
        },
        body: chunkBuffer,
        cache: "no-store",
      }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Upload service unavailable" },
      { status: 502 }
    );
  }
}

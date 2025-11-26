"use server";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const SERVICE_URL = process.env.UPLOAD_SERVICE_URL;
const SERVICE_API_KEY = process.env.UPLOAD_SERVICE_API_KEY;

export async function POST(
  _req: Request,
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

  try {
    const response = await fetch(
      `${SERVICE_URL}/uploads/${params.uploadId}/finalize`,
      {
        method: "POST",
        headers: {
          "X-API-Key": SERVICE_API_KEY,
          "X-User-Id": user.id,
        },
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

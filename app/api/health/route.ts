import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return NextResponse.json(
      {
        app: "ok",
        environment: "missing",
        supabase: "not_checked",
      },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: {
        apikey: publishableKey,
      },
      cache: "no-store",
    });

    return NextResponse.json(
      {
        app: "ok",
        environment: "configured",
        supabase: response.ok ? "reachable" : "unreachable",
      },
      { status: response.ok ? 200 : 503 },
    );
  } catch {
    return NextResponse.json(
      {
        app: "ok",
        environment: "configured",
        supabase: "unreachable",
      },
      { status: 503 },
    );
  }
}

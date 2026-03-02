import { NextRequest } from "next/server";
import { validatePineScript } from "@/lib/validator";

export async function POST(req: NextRequest) {
  let body: { code: string; version?: "v5" | "v6" };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.code) {
    return Response.json({ error: "Missing code" }, { status: 400 });
  }

  const results = validatePineScript(body.code, body.version || "v6");
  return Response.json({ results });
}

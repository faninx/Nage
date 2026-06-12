import { SignJWT, jwtVerify, type JWTPayload } from "jose"
import { randomBytes } from "node:crypto"

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

export type SessionPayload = {
  sub: string // userId
  role: "admin" | "member"
  username: string
}

function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET
  if (!raw || raw.length < 32) {
    throw new Error(
      "JWT_SECRET is missing or too short (need >= 32 chars). Set it in .env.local"
    )
  }
  return new TextEncoder().encode(raw)
}

export async function signSession(
  payload: Omit<SessionPayload, "iat" | "exp">
): Promise<string> {
  return new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret())
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    })
    if (
      typeof payload.sub !== "string" ||
      (payload.role !== "admin" && payload.role !== "member") ||
      typeof payload.username !== "string"
    ) {
      return null
    }
    return {
      sub: payload.sub,
      role: payload.role,
      username: payload.username,
    }
  } catch {
    return null
  }
}

export function generateSecret(): string {
  return randomBytes(32).toString("base64")
}

export const SESSION_COOKIE = "nage_session"
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS

import { createPrivateKey, sign } from "node:crypto";

// The bearer token every Enable Banking call carries: a JWT signed RS256 with the
// application's private key, `kid` = the application id. Built with Node's crypto so
// the bank connection needs no JWT library. Pure (time is passed in) so it is testable.

const ISSUER = "enablebanking.com";
const AUDIENCE = "api.enablebanking.com";
/** Enable Banking accepts up to 24 hours; one hour is what its quick start uses. */
export const JWT_LIFETIME_SECONDS = 3600;

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

/** True when `pem` is a private key Node can sign with (PKCS#8 or PKCS#1, as the
 *  Control Panel's browser-generated `.pem` or an OpenSSL key is). */
export function isUsablePrivateKey(pem: string): boolean {
  try {
    const key = createPrivateKey(pem.trim());
    return key.asymmetricKeyType === "rsa";
  } catch {
    return false;
  }
}

/** `nowSeconds`: Unix time in seconds; defaults to the clock. */
export function buildEnableBankingJwt(applicationId: string, privateKeyPem: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = { typ: "JWT", alg: "RS256", kid: applicationId.trim() };
  const payload = { iss: ISSUER, aud: AUDIENCE, iat: nowSeconds, exp: nowSeconds + JWT_LIFETIME_SECONDS };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), createPrivateKey(privateKeyPem.trim()));
  return `${signingInput}.${base64url(signature)}`;
}

// Prints a new VAPID key pair for Web Push. Usage: node scripts/generate-vapid-keys.ts
// Load the private key with `wrangler secret put VAPID_PRIVATE_KEY` (production)
// or into api/.dev.vars (dev). Never commit it.
const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
])) as CryptoKeyPair;
const publicKey = Buffer.from(
  (await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer,
).toString('base64url');
const { d } = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${d}`);

export {};

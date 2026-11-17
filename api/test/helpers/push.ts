const base64Url = (bytes: ArrayBuffer | Uint8Array) =>
  Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString('base64url');

/** VAPID keys in the format the Worker expects (public: raw P-256 point, private: JWK d). */
export async function generateVapidKeys() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const raw = (await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  return { VAPID_PUBLIC_KEY: base64Url(raw), VAPID_PRIVATE_KEY: jwk.d! };
}

/** A browser-like subscription with real ECDH keys, so payload encryption runs for real. */
export async function fakeSubscription(endpoint = `https://push.test/${crypto.randomUUID()}`) {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const p256dh = base64Url((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const auth = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  return { endpoint, keys: { p256dh, auth } };
}

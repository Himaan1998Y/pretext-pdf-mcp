export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

export function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

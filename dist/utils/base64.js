export function toBase64(bytes) {
    return Buffer.from(bytes).toString('base64');
}
export function fromBase64(b64) {
    return new Uint8Array(Buffer.from(b64, 'base64'));
}

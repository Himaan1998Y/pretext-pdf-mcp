export const MAX_PDF_OUTPUT_BYTES = 50 * 1024 * 1024 // 50MB
export const MAX_CONTENT_ELEMENTS = 500
export const MAX_REPORT_SECTIONS = 100
export const JSON_MAX_DEPTH = 50

export function checkJsonDepth(raw: string, max = JSON_MAX_DEPTH): void {
  let depth = 0
  let maxDepth = 0
  for (const ch of raw) {
    if (ch === '{' || ch === '[') { depth++; if (depth > maxDepth) maxDepth = depth }
    else if (ch === '}' || ch === ']') depth--
  }
  if (maxDepth > max) {
    throw new Error(`JSON depth ${maxDepth} exceeds limit ${max}`)
  }
}

export function assertOutputSize(bytes: Uint8Array, toolName: string): void {
  if (bytes.byteLength > MAX_PDF_OUTPUT_BYTES) {
    throw new Error(`${toolName}: output PDF exceeds ${MAX_PDF_OUTPUT_BYTES / 1024 / 1024}MB limit (${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB)`)
  }
}

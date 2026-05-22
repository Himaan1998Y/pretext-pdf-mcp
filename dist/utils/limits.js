export const MAX_PDF_OUTPUT_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_CONTENT_ELEMENTS = 500;
export const MAX_REPORT_SECTIONS = 100;
export const JSON_MAX_DEPTH = 50;
export const MAX_MARKDOWN_CHARS = 200_000;
export function checkJsonDepth(raw, max = JSON_MAX_DEPTH) {
    let depth = 0;
    let maxDepth = 0;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (inString) {
            if (ch === '\\')
                escaped = true;
            else if (ch === '"')
                inString = false;
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === '{' || ch === '[') {
            depth++;
            if (depth > maxDepth)
                maxDepth = depth;
        }
        else if (ch === '}' || ch === ']') {
            depth--;
        }
    }
    if (maxDepth > max) {
        throw new Error(`JSON depth ${maxDepth} exceeds limit ${max}`);
    }
}
export function assertOutputSize(bytes, toolName) {
    if (bytes.byteLength > MAX_PDF_OUTPUT_BYTES) {
        throw new Error(`${toolName}: output PDF exceeds ${MAX_PDF_OUTPUT_BYTES / 1024 / 1024}MB limit (${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB)`);
    }
}

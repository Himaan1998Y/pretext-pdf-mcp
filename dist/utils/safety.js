import { validateDocument } from 'pretext-pdf';
/**
 * Structural check for prototype-pollution attack keys.
 * Walks the object tree and rejects documents containing __proto__, constructor,
 * or prototype keys. Depth limit prevents runaway recursion on cyclic structures.
 *
 * Shared by every MCP tool that accepts user-supplied object input.
 */
export function hasUnsafeKeys(node, depth = 0) {
    if (depth > 64)
        return true; // Reject deeply nested structures to prevent DoS
    if (node === null || typeof node !== 'object')
        return false;
    for (const key of Object.keys(node)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype')
            return true;
        if (hasUnsafeKeys(node[key], depth + 1))
            return true;
    }
    return false;
}
function safetyError(message) {
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message }),
            },
        ],
        isError: true,
    };
}
/**
 * Defence-in-depth check applied to any document about to be rendered.
 *
 * Performs two checks in order:
 *   1. `hasUnsafeKeys()` — reject prototype-pollution payloads before any further work.
 *   2. `validateDocument()` — structural schema validation against the pretext-pdf contract.
 *
 * Returns `null` when the document is safe to render, or an MCP error response
 * when it should be rejected. Callers should `return` the response unchanged.
 */
export function runDocumentSafetyChecks(doc) {
    if (hasUnsafeKeys(doc)) {
        return safetyError('Document contains unsafe keys (__proto__, constructor, prototype)');
    }
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
        return safetyError('Document must be a non-null object');
    }
    const validation = validateDocument(doc);
    if (!validation.valid) {
        const messages = validation.errors
            .map((e) => `${e.path}: ${e.message}`)
            .join('; ');
        return safetyError(messages);
    }
    return null;
}

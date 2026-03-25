import { createCircuitBreaker } from '../utils/circuitBreaker';
import { childLogger } from '../utils/logger';

interface DocuSignEnvelopeResult {
  envelopeId: string;
  status:     'sent' | 'delivered' | 'completed' | 'voided';
}

// _recipientEmail préfixé _ pour signaler que c'est volontairement inutilisé (simulé)
async function _sendToDocuSign(
  documentId: string,
  _recipientEmail: string
): Promise<DocuSignEnvelopeResult> {
  await new Promise<void>((r) => setTimeout(r, 200 + Math.random() * 600));

  if (Math.random() < 0.1) {
    throw new Error('DocuSign API 503 Service Unavailable');
  }

  return { envelopeId: `env-${documentId}-${Date.now()}`, status: 'sent' };
}

const docusignBreaker = createCircuitBreaker(
  'docusign',
  _sendToDocuSign as (...args: unknown[]) => Promise<unknown>,
  { timeout: 5000, errorThresholdPercentage: 50, resetTimeout: 30000 }
);

export async function sendDocumentToDocuSign(
  documentId: string,
  recipientEmail: string
): Promise<DocuSignEnvelopeResult | null> {
  const log = childLogger({ documentId });
  try {
    const result = await docusignBreaker.fire(documentId, recipientEmail) as DocuSignEnvelopeResult;
    log.info({ msg: 'DocuSign envelope sent', envelopeId: result?.envelopeId });
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ msg: 'DocuSign unavailable', error: msg });
    return null;
  }
}
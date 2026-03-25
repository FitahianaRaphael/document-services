import { workerData, parentPort } from 'worker_threads';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';

interface PdfWorkerInput {
  userId: string;
  documentId: string;
  templateData: Record<string, string>;
}

async function generatePdf(input: PdfWorkerInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    const pass = new PassThrough();

    pass.on('data', (chunk: Buffer) => chunks.push(chunk));
    pass.on('end', () => resolve(Buffer.concat(chunks)));
    pass.on('error', reject);

    doc.pipe(pass);

    doc.fontSize(20).text('FORMULAIRE CERFA N° 12345', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Identifiant utilisateur : ${input.userId}`);
    doc.text(`Identifiant document    : ${input.documentId}`);
    doc.text(`Date de génération      : ${new Date().toISOString()}`);
    doc.moveDown();

    for (const [key, value] of Object.entries(input.templateData)) {
      doc.text(`${key} : ${value}`);
    }

    doc.end();
  });
}

// Exécution dans le thread

void (async (): Promise<void> => {
  try {
    const input = workerData as { userId: string; documentId: string; templateData?: Partial<CerfaData> };
    const data: CerfaData = {
      employeur_siret:      '83210123400012',
      employeur_raison:     'ACME Formation SAS',
      employeur_adresse:    '12 rue de la République',
      employeur_cp:         '75001',
      employeur_ville:      'Paris',
      employeur_telephone:  '01 23 45 67 89',
      employeur_email:      'rh@acme-formation.fr',
      apprenti_nom:         `NOM_${input.userId}`,
      apprenti_prenom:      `Prénom_${input.userId}`,
      apprenti_naissance:   '01/01/2000',
      apprenti_nationalite: 'Française',
      apprenti_adresse:     '5 avenue des Apprentis',
      apprenti_cp:          '69001',
      apprenti_ville:       'Lyon',
      apprenti_nir:         '2000175069123 45',
      contrat_type:         'Nouveau',
      contrat_date_debut:   '01/09/2024',
      contrat_date_fin:     '31/08/2026',
      contrat_salaire:      '65 %',
      contrat_duree_hebdo:  '35',
      formation_intitule:   'BTS Développement Logiciel',
      formation_diplome:    'RNCP 38368',
      formation_cfa:        'CFA Numérique Paris',
      formation_cfa_uai:    '0750001A',
      userId:               input.userId,
      documentId:           input.documentId,
      ...input.templateData,
    };
    const buffer = await generateCerfa(data);
    parentPort?.postMessage({ success: true, buffer: buffer.toString('base64') });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parentPort?.postMessage({ success: false, error: msg });
  }
})();
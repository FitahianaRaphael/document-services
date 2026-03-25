export interface TemplateSlot {
  label: string;
  x: number;
  y: number;
  maxWidth: number;
  fontSize: number;
  bold: boolean;
}

export interface CompiledTemplate {
  name: string;
  pageSize: 'A4' | 'LETTER';
  margins: { top: number; bottom: number; left: number; right: number };
  slots: TemplateSlot[];
  staticBlocks: Array<{
    type: 'text' | 'rect' | 'line';
    props: Record<string, unknown>;
  }>;
}


const templateCache = new Map<string, CompiledTemplate>();

export function registerTemplate(name: string, tpl: CompiledTemplate): void {
  if (!templateCache.has(name)) {
    templateCache.set(name, Object.freeze(tpl));
  }
}

export function getTemplate(name: string): CompiledTemplate {
  const tpl = templateCache.get(name);
  if (!tpl) throw new Error(`Template "${name}" non trouvé dans le cache`);
  return tpl;
}

export const CERFA_13750: CompiledTemplate = {
  name: 'cerfa-13750',
  pageSize: 'A4',
  margins: { top: 35, bottom: 35, left: 40, right: 40 },
  slots: [

    { label: 'SIRET',             x: 45,  y: 120, maxWidth: 240, fontSize: 8, bold: false },
    { label: 'Raison sociale',    x: 310, y: 120, maxWidth: 240, fontSize: 8, bold: false },
    { label: 'Adresse',           x: 45,  y: 150, maxWidth: 240, fontSize: 8, bold: false },
    { label: 'Téléphone',         x: 45,  y: 180, maxWidth: 240, fontSize: 8, bold: false },
    { label: 'Courriel',          x: 310, y: 180, maxWidth: 240, fontSize: 8, bold: false },

    { label: 'Nom',               x: 45,  y: 270, maxWidth: 240, fontSize: 8, bold: false },
    { label: 'Prénom',            x: 310, y: 270, maxWidth: 240, fontSize: 8, bold: false },
    { label: 'Date de naissance', x: 45,  y: 300, maxWidth: 240, fontSize: 8, bold: false },
    { label: 'NIR',               x: 310, y: 300, maxWidth: 240, fontSize: 8, bold: false },

    { label: 'Date début',        x: 45,  y: 390, maxWidth: 240, fontSize: 8, bold: false },
    { label: 'Date fin',          x: 310, y: 390, maxWidth: 240, fontSize: 8, bold: false },
    { label: 'Salaire % SMIC',    x: 45,  y: 420, maxWidth: 240, fontSize: 8, bold: false },
  ],
  staticBlocks: [], 
};

registerTemplate(CERFA_13750.name, CERFA_13750);
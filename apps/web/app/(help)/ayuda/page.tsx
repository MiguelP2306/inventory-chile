import type { Metadata } from 'next';
import { HelpGuide } from '@/components/help/help-guide';

export const metadata: Metadata = {
  title: 'Centro de Ayuda',
  description:
    'Guía no técnica de todos los módulos del sistema + preguntas frecuentes.',
};

export default function AyudaPage() {
  return <HelpGuide />;
}

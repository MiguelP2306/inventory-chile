// `force-light` mantiene la vista pública en tema claro siempre, sin importar
// la preferencia del operador interno. Es la cara visible al cliente final
// y debe verse igual en cualquier dispositivo.
export default function PublicQuotationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="force-light min-h-screen bg-muted/40 px-4 py-8 text-foreground">
      <div className="mx-auto w-full max-w-3xl">{children}</div>
    </div>
  );
}

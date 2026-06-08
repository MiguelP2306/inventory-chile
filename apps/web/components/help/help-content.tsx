/* ============================================================================
 *  help-content — datos de la guía de ayuda (módulos, flujo y FAQ).
 *
 *  Se extrae a un archivo aparte para que tanto la guía (HelpGuide) como el
 *  menú de navegación mobile (HelpMobileNav) consuman EXACTAMENTE la misma
 *  estructura, sin duplicar texto.
 * ========================================================================== */

import {
  ArrowDownToLine,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  Building2,
  Car,
  ClipboardList,
  Factory,
  FileSpreadsheet,
  LayoutDashboard,
  LineChart,
  MessageCircle,
  Package,
  PackageX,
  Receipt,
  RotateCcw,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Tag,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

export interface HelpModule {
  id: string;
  title: string;
  icon: LucideIcon;
  tagline: string;
  what: string;
  bullets: string[];
  tip?: string;
  route?: string;
}

export interface HelpGroup {
  key: string;
  label: string;
  description: string;
  modules: HelpModule[];
}

export const GROUPS: HelpGroup[] = [
  {
    key: 'panel',
    label: 'Panel',
    description: 'Tu punto de partida cada día.',
    modules: [
      {
        id: 'dashboard',
        title: 'Dashboard',
        icon: LayoutDashboard,
        route: '/',
        tagline: 'El resumen del día de tu negocio.',
        what: 'Es la pantalla de inicio. De un vistazo te muestra cómo va el negocio hoy: cuánto vendiste, cuánta plata hay en caja, qué productos están por agotarse y qué clientes esperan respuesta.',
        bullets: [
          'Ver las ventas y los ingresos del día sin entrar a cada módulo.',
          'Tocar cualquier número (KPI) para ir directo a su detalle.',
          'Detectar alertas: stock crítico, cotizaciones por vencer y seguimientos pendientes.',
        ],
        tip: 'Es el mejor lugar para empezar la mañana: te dice qué necesita tu atención primero.',
      },
    ],
  },
  {
    key: 'catalogo',
    label: 'Catálogo',
    description: 'Todo lo que vendes y cómo está organizado.',
    modules: [
      {
        id: 'productos',
        title: 'Productos',
        icon: Package,
        route: '/productos',
        tagline: 'El corazón de tu catálogo de repuestos.',
        what: 'Acá vive cada repuesto que vendes, con su nombre, código (SKU), precio, costo, fotos y los autos en los que calza.',
        bullets: [
          'Crear y editar productos con foto, precio y stock mínimo.',
          'Registrar varios códigos por repuesto (universal, de fábrica, compatibles).',
          'Marcar si es Original o Alternativo.',
          'Indicar en qué vehículos calza (marca, modelo y años).',
        ],
        tip: 'Mientras mejor cargues la compatibilidad vehicular, más rápido encontrarás el repuesto correcto para cada cliente.',
      },
      {
        id: 'categorias',
        title: 'Categorías',
        icon: Tag,
        route: '/categorias',
        tagline: 'Ordena tu catálogo en grupos.',
        what: 'Agrupaciones para clasificar tus productos: frenos, filtros, suspensión, etc.',
        bullets: [
          'Crear y renombrar categorías.',
          'Ver todos los productos de una categoría.',
          'Mover o desvincular varios productos a la vez.',
        ],
        tip: 'Categorías claras hacen que las búsquedas y los reportes sean mucho más útiles.',
      },
      {
        id: 'marcas',
        title: 'Marcas',
        icon: Boxes,
        route: '/marcas',
        tagline: 'Las marcas de tus repuestos.',
        what: 'La marca del repuesto (Bosch, NGK, etc.), no la del auto.',
        bullets: [
          'Administrar las marcas de tus productos.',
          'Ver qué productos pertenecen a cada marca.',
        ],
        tip: 'No la confundas con las marcas de auto: esas se administran en Vehículos.',
      },
      {
        id: 'vehiculos',
        title: 'Vehículos',
        icon: Car,
        route: '/vehiculos',
        tagline: 'Marcas y modelos de autos.',
        what: 'El catálogo de autos (Toyota, Hilux, Corolla...) que usás para decir en qué vehículo calza cada repuesto.',
        bullets: [
          'Administrar marcas y modelos de auto.',
          'Ver qué repuestos sirven para un modelo determinado.',
        ],
        tip: 'Es la base de la búsqueda "¿qué tengo para un Corolla 2015?".',
      },
    ],
  },
  {
    key: 'operacion',
    label: 'Operación',
    description: 'El día a día: stock, compras, cotizaciones y ventas.',
    modules: [
      {
        id: 'stock',
        title: 'Stock',
        icon: Warehouse,
        route: '/inventario',
        tagline: 'Cuánto tienes y dónde.',
        what: 'La existencia real de cada producto, con un semáforo de color: verde si hay stock, amarillo si está por agotarse y rojo si no queda.',
        bullets: [
          'Ver el stock por bodega.',
          'Ajustar el stock tras un conteo físico.',
          'Asignar la ubicación (pasillo / estante / posición).',
          'Buscar por código de producto o de ubicación.',
        ],
        tip: 'El amarillo y el rojo te avisan qué reponer antes de quedarte sin venta.',
      },
      {
        id: 'movimientos',
        title: 'Movimientos',
        icon: ArrowDownToLine,
        route: '/inventario/movimientos',
        tagline: 'El historial de tu inventario.',
        what: 'Cada entrada y salida de mercadería queda registrada: compras, ventas, ajustes, devoluciones y transferencias.',
        bullets: [
          'Auditar por qué cambió el stock de un producto.',
          'Filtrar por producto, tipo de movimiento y fecha.',
        ],
        tip: 'Si un número no cuadra, acá ves exactamente qué pasó y cuándo.',
      },
      {
        id: 'almacenes',
        title: 'Almacenes',
        icon: Building2,
        route: '/almacenes',
        tagline: 'Tus bodegas.',
        what: 'Los lugares donde guardas stock (Bodega, Tienda, Mercado libre, etc.).',
        bullets: [
          'Crear y editar bodegas.',
          'Manejar el stock de forma separada en cada bodega.',
        ],
        tip: 'Mercado libre se maneja como una bodega aparte.',
      },
      {
        id: 'transferencias',
        title: 'Transferencias',
        icon: ArrowLeftRight,
        route: '/transferencias',
        tagline: 'Mover stock entre bodegas.',
        what: 'Pasar productos de una bodega a otra (por ejemplo, enviar mercadería a Mercado Libre Full). No es una venta.',
        bullets: [
          'Registrar traslados entre bodegas.',
          'Usar el botón "Max" para mover todo el stock disponible.',
          'Ver el historial de transferencias.',
        ],
        tip: 'Transferir no afecta la caja: solo mueve mercadería de un lugar a otro.',
      },
      {
        id: 'compras',
        title: 'Compras',
        icon: ArrowDownToLine,
        route: '/compras',
        tagline: 'La entrada de mercadería.',
        what: 'Cuando le compras a un proveedor, registras la compra acá. El sistema suma el stock y registra el egreso en la caja automáticamente.',
        bullets: [
          'Cargar productos, cantidades y costos.',
          'Adjuntar la factura del proveedor.',
          'Ver el desglose de IVA calculado automáticamente.',
        ],
        tip: 'Cada compra alimenta el costo promedio del producto y descuenta de la caja.',
      },
      {
        id: 'proveedores',
        title: 'Proveedores',
        icon: Factory,
        route: '/proveedores',
        tagline: 'A quién le compras.',
        what: 'Los datos de tus proveedores y el historial de compras a cada uno.',
        bullets: [
          'Administrar proveedores (RUT, contacto, dirección).',
          'Ver las compras y facturas asociadas a cada proveedor.',
        ],
        tip: 'Tener proveedores ordenados facilita reponer y comparar precios.',
      },
      {
        id: 'clientes',
        title: 'Clientes',
        icon: Users,
        route: '/clientes',
        tagline: 'Tu cartera de clientes.',
        what: 'Quiénes te compran, con su RUT, contacto y todo su historial de cotizaciones, ventas y seguimiento.',
        bullets: [
          'Crear clientes con RUT chileno validado.',
          'Ver su historial completo en pestañas.',
          'Guardar notas internas que solo ves tú.',
        ],
        tip: 'Un buen registro de clientes potencia el seguimiento comercial.',
      },
      {
        id: 'cotizaciones',
        title: 'Cotizaciones',
        icon: ClipboardList,
        route: '/cotizaciones',
        tagline: 'Propuestas de precio para tus clientes.',
        what: 'Le armas a un cliente un presupuesto con productos y precios, y se lo envías por WhatsApp o email.',
        bullets: [
          'Cotizar a un cliente del catálogo o a uno "libre" (sin guardarlo).',
          'Enviar por WhatsApp o email con el PDF adjunto.',
          'Imprimir en formato Carta u 80 mm.',
          'Convertir la cotización en venta con un clic.',
        ],
        tip: 'Cotizar no descuenta stock; recién al convertirla en venta se descuenta.',
      },
      {
        id: 'seguimiento',
        title: 'Seguimiento',
        icon: MessageCircle,
        route: '/seguimiento',
        tagline: 'No pierdas ninguna venta.',
        what: 'Una bandeja con los clientes a los que les cotizaste y aún no compran, ordenados por urgencia.',
        bullets: [
          'Ver pendientes, sin respuesta y vencidos.',
          'Abrir WhatsApp para retomar la conversación al instante.',
          'Marcar como ganado o perdido.',
        ],
        tip: 'El sistema mueve a los clientes solo según lo que pasa (cotización enviada, venta confirmada).',
      },
      {
        id: 'ventas',
        title: 'Ventas',
        icon: ShoppingCart,
        route: '/ventas',
        tagline: 'Cerrar el negocio.',
        what: 'Registras la venta, eliges el método de pago, y el sistema descuenta el stock e ingresa la plata a la caja, todo de una sola vez.',
        bullets: [
          'Vender desde cero o a partir de una cotización.',
          'Cobrar en efectivo, transferencia o tarjeta (con comisión automática).',
          'Imprimir la nota de venta.',
          'Anular una venta si hace falta (revierte stock y caja).',
        ],
        tip: 'Si cobras con tarjeta, la comisión se registra sola como un gasto en la caja.',
      },
      {
        id: 'devoluciones',
        title: 'Devoluciones',
        icon: RotateCcw,
        route: '/devoluciones',
        tagline: 'Cuando vuelve la mercadería.',
        what: 'Registras la devolución de un producto desde una venta (vuelve a tu stock) o hacia un proveedor.',
        bullets: [
          'Devolver ítems de una venta existente.',
          'Marcar si el producto vuelve vendible o dañado.',
          'Ver el reembolso reflejado automáticamente en la caja.',
        ],
        tip: 'Si vuelve dañado, queda registrado para auditoría pero no se suma al stock vendible.',
      },
      {
        id: 'garantias',
        title: 'Garantías',
        icon: ShieldAlert,
        route: '/garantias',
        tagline: 'Reclamos de garantía.',
        what: 'El seguimiento de un reclamo de garantía de un cliente, con sus estados (abierto, en revisión, aprobado, rechazado, resuelto).',
        bullets: [
          'Abrir un reclamo a partir de una venta.',
          'Seguir el estado del reclamo paso a paso.',
          'Registrar la resolución final.',
        ],
        tip: 'La garantía no mueve stock por sí sola; si hay cambio de producto, se hace como devolución + nueva salida.',
      },
      {
        id: 'guias',
        title: 'Guías de despacho',
        icon: Truck,
        route: '/guias',
        tagline: 'El documento para enviar la mercadería.',
        what: 'El documento de despacho de una venta, con la dirección de entrega, el transportista y un número correlativo.',
        bullets: [
          'Generar la guía a partir de una venta.',
          'Editar la dirección de entrega y el transportista.',
          'Imprimir en formato Carta u 80 mm.',
        ],
        tip: 'Es un documento aparte de la nota de venta, pensado para el envío físico.',
      },
    ],
  },
  {
    key: 'caja',
    label: 'Caja',
    description: 'Toda la plata del negocio en un solo lugar.',
    modules: [
      {
        id: 'caja',
        title: 'Libro de caja',
        icon: Wallet,
        route: '/caja',
        tagline: 'Toda la plata en un solo lugar.',
        what: 'El registro consolidado de ingresos y egresos: ventas, compras y gastos. Es la fuente de verdad del dinero de tu negocio.',
        bullets: [
          'Ver el saldo total y por método (efectivo / transferencia / tarjeta).',
          'Filtrar por fecha, tipo (ingreso / egreso) y origen.',
        ],
        tip: 'La caja se llena sola con tus ventas, compras y gastos: no necesitas anotar a mano.',
      },
      {
        id: 'gastos',
        title: 'Gastos',
        icon: Receipt,
        route: '/gastos',
        tagline: 'Lo que se va en el día a día.',
        what: 'Arriendo, transporte, publicidad y otros gastos manuales del negocio.',
        bullets: [
          'Cargar gastos con su comprobante adjunto.',
          'Clasificar cada gasto por categoría.',
          'Anular un gasto cuando corresponda.',
        ],
        tip: 'Editás libremente los gastos del mes actual; los de meses anteriores se anulan en vez de borrarse.',
      },
    ],
  },
  {
    key: 'reportes',
    label: 'Reportes',
    description: 'Para tomar decisiones y para tu contador.',
    modules: [
      {
        id: 'proyeccion',
        title: 'Proyección',
        icon: TrendingUp,
        route: '/proyeccion',
        tagline: 'Anticípate a quedarte sin stock.',
        what: 'Estima cuándo se te va a acabar cada producto según cómo viene vendiendo, considerando los tiempos de importación.',
        bullets: [
          'Ver la lista de productos críticos.',
          'Planificar la reposición con tiempo.',
          'Exportar la lista para tu proveedor.',
        ],
        tip: 'Ideal para importaciones que demoran 2 o 3 meses en llegar.',
      },
      {
        id: 'reportes-ventas',
        title: 'Reporte de ventas',
        icon: BarChart3,
        route: '/reportes/ventas',
        tagline: 'Cómo va el negocio.',
        what: 'Un resumen de tus ventas por período, con totales y utilidad.',
        bullets: [
          'Filtrar por rango de fechas.',
          'Ver la rentabilidad de lo vendido.',
          'Exportar a Excel.',
        ],
      },
      {
        id: 'reportes-iva',
        title: 'Reporte de IVA',
        icon: FileSpreadsheet,
        route: '/reportes/iva',
        tagline: 'Para tu contador.',
        what: 'El IVA de tus ventas (débito) y el de tus compras (crédito) en un período.',
        bullets: [
          'Ver el IVA por período.',
          'Exportar a Excel para la declaración.',
        ],
        tip: 'El sistema calcula el IVA solo: tú solo eliges el período.',
      },
      {
        id: 'reportes-flujo-caja',
        title: 'Flujo de caja',
        icon: LineChart,
        route: '/reportes/flujo-caja',
        tagline: 'Entradas y salidas en el tiempo.',
        what: 'La evolución de tus ingresos y egresos para ver cómo se mueve la plata mes a mes.',
        bullets: [
          'Filtrar por período.',
          'Exportar el detalle.',
        ],
      },
      {
        id: 'reportes-sin-movimiento',
        title: 'Sin movimiento',
        icon: PackageX,
        route: '/reportes/sin-movimiento',
        tagline: 'Productos dormidos.',
        what: 'Productos que no se han vendido en un período: capital detenido en la bodega.',
        bullets: [
          'Detectar el stock que no rota.',
          'Decidir promociones o liquidaciones.',
        ],
        tip: 'Liberar productos dormidos recupera plata para reponer lo que sí se vende.',
      },
    ],
  },
  {
    key: 'administracion',
    label: 'Administración',
    description: 'Ajustes del sistema (solo administrador).',
    modules: [
      {
        id: 'configuracion',
        title: 'Configuración',
        icon: Settings,
        route: '/configuracion',
        tagline: 'Los ajustes del sistema.',
        what: 'Los datos de tu empresa, la tasa de IVA, la comisión de tarjeta, las categorías de gasto y el seguimiento comercial.',
        bullets: [
          'Cambiar la tasa de IVA y la comisión por tarjeta.',
          'Editar los datos y el logo de la empresa.',
          'Gestionar las categorías de gasto.',
        ],
        tip: 'Solo el administrador puede entrar a esta sección.',
      },
      {
        id: 'usuarios',
        title: 'Usuarios',
        icon: UserCog,
        route: '/usuarios',
        tagline: 'Quién usa el sistema.',
        what: 'Las cuentas que pueden ingresar al sistema y el rol de cada una.',
        bullets: [
          'Crear o desactivar usuarios.',
          'Asignar el rol de cada cuenta.',
        ],
        tip: 'Solo el administrador puede administrar usuarios.',
      },
    ],
  },
];

export const FLOW: { label: string; icon: LucideIcon; text: string }[] = [
  { label: 'Compras', icon: ArrowDownToLine, text: 'Le compras al proveedor y entra el stock.' },
  { label: 'Stock', icon: Warehouse, text: 'El inventario queda actualizado por bodega.' },
  { label: 'Cotización', icon: ClipboardList, text: 'Le pasas un presupuesto al cliente.' },
  { label: 'Venta', icon: ShoppingCart, text: 'Se cierra el negocio y baja el stock.' },
  { label: 'Caja', icon: Wallet, text: 'La plata entra y queda registrada sola.' },
  { label: 'Reportes', icon: BarChart3, text: 'Mides resultados y planificas.' },
];

export const FAQS: { q: string; a: string }[] = [
  {
    q: '¿Necesito conocimientos técnicos para usar el sistema?',
    a: 'No. Está pensado para que cualquier persona del negocio lo use. Si te guías por esta página y sigues el flujo natural (cargar productos, registrar compras, cotizar y vender), no necesitas nada técnico.',
  },
  {
    q: '¿Por dónde empiezo si es la primera vez?',
    a: 'Carga tus productos y tus proveedores, registra una compra para tener stock real, y con eso ya puedes cotizar y vender. El Dashboard te irá mostrando lo importante cada día.',
  },
  {
    q: '¿El stock se actualiza solo?',
    a: 'Sí. Cada compra suma stock y cada venta lo descuenta automáticamente. Las transferencias lo mueven entre bodegas y las devoluciones lo reingresan. No necesitas ajustar a mano, salvo cuando hagas un conteo físico.',
  },
  {
    q: '¿La caja se llena sola?',
    a: 'Sí. Las ventas entran como ingreso, y las compras y gastos como egreso, de forma automática. El Libro de caja siempre refleja la realidad del dinero.',
  },
  {
    q: '¿Cuál es la diferencia entre una cotización y una venta?',
    a: 'La cotización es un presupuesto: le muestras precios al cliente pero no descuenta stock ni mueve plata. La venta sí descuenta el stock e ingresa el dinero a la caja. Puedes convertir una cotización en venta con un clic.',
  },
  {
    q: '¿Puedo enviar cotizaciones por WhatsApp o email?',
    a: 'Sí. Desde la cotización tienes un botón para enviarla por WhatsApp o por email, con el PDF incluido. También puedes imprimirla en formato Carta u 80 mm.',
  },
  {
    q: '¿Qué significan los colores del stock?',
    a: 'Verde: hay stock suficiente. Amarillo: está llegando al mínimo y conviene reponer. Rojo: no queda stock. Es un semáforo para que sepas qué reponer de un vistazo.',
  },
  {
    q: '¿Qué es una transferencia y en qué se diferencia de una venta?',
    a: 'Una transferencia mueve mercadería de una bodega a otra (por ejemplo, hacia Mercado libre). No es una venta y no afecta la caja: solo cambia el stock de lugar.',
  },
  {
    q: '¿Cómo manejo Mercado libre?',
    a: 'Se maneja como una bodega aparte. Transfieres el stock hacia esa bodega y, cuando se vende allá, lo descuentas de esa bodega. Así tu inventario sigue cuadrado.',
  },
  {
    q: '¿Puedo trabajar desde el celular?',
    a: 'Sí. El sistema es responsive: puedes consultar stock, ver el seguimiento de clientes y registrar operaciones desde el teléfono.',
  },
  {
    q: '¿Qué hago si me equivoco en una venta o en un gasto?',
    a: 'Las ventas se pueden anular: el sistema revierte el stock y la caja automáticamente. Los gastos del mes actual se pueden editar; los de meses anteriores se anulan en lugar de borrarse, para mantener el historial.',
  },
  {
    q: '¿Quién puede cambiar la configuración del sistema?',
    a: 'Solo el usuario administrador. Las secciones de Configuración y Usuarios no aparecen para el resto de las cuentas.',
  },
  {
    q: '¿El sistema calcula el IVA automáticamente?',
    a: 'Sí. A partir de los totales de compras y ventas descompone el IVA solo. En Reportes encuentras el IVA del período listo para tu contador.',
  },
  {
    q: '¿Cómo evito perder ventas por falta de seguimiento?',
    a: 'Usa la bandeja de Seguimiento. Ahí aparecen los clientes a los que cotizaste y aún no compran, ordenados por urgencia, con un botón para retomar la conversación por WhatsApp.',
  },
];

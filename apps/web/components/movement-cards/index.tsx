'use client';

import type { MovementCardDto } from '@inventory/shared';
import { AdjustmentMovementCard } from './adjustment-card';
import { DispatchMovementCard } from './dispatch-card';
import { OrphanMovementCard } from './orphan-card';
import { PurchaseMovementCard } from './purchase-card';
import { ReturnMovementCard } from './return-card';
import { SaleMovementCard } from './sale-card';
import { TransferMovementCard } from './transfer-card';

// Ronda 13 — dispatcher por discriminator. Cada tipo tiene su componente
// dedicado con un layout específico. El switch acá garantiza que si en el
// futuro se agrega un nuevo `kind` al union, TypeScript marque el error.
export function MovementCard({ card }: { card: MovementCardDto }) {
  switch (card.kind) {
    case 'SALE':
      return <SaleMovementCard card={card} />;
    case 'PURCHASE':
      return <PurchaseMovementCard card={card} />;
    case 'RETURN':
      return <ReturnMovementCard card={card} />;
    case 'TRANSFER':
      return <TransferMovementCard card={card} />;
    case 'DISPATCH':
      return <DispatchMovementCard card={card} />;
    case 'ADJUSTMENT':
      return <AdjustmentMovementCard card={card} />;
    case 'ORPHAN':
      return <OrphanMovementCard card={card} />;
    default: {
      // Exhaustividad: si TS marca acá, alguien agregó un nuevo kind sin actualizar el switch.
      const _exhaustive: never = card;
      void _exhaustive;
      return null;
    }
  }
}

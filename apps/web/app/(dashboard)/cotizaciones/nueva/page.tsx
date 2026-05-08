import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/cotizaciones?new=1');
}

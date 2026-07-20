import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // `slate-850` no existe en la paleta default de Tailwind. El diseño lo
        // usa en ~75 lugares (dark:border/divide/bg-slate-850); al no estar
        // definido, esas clases eran no-op y en modo oscuro quedaba el valor
        // claro (border-slate-100) → borde feo en las tablas. Lo definimos como
        // un slate intermedio 800↔900 para que rinda un borde sutil igual al de
        // la tabla de Stock (referencia, que usa slate-800).
        slate: {
          850: '#1a2336',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Semáforo de stock
        stock: {
          ok: 'hsl(var(--stock-ok))',
          low: 'hsl(var(--stock-low))',
          out: 'hsl(var(--stock-out))',
        },
        // Panel izquierdo. Con `<alpha-value>` las utilidades de opacidad
        // (bg-sidebar-foreground/10, etc.) funcionan sobre estos tokens, que es
        // como el sidebar deriva sus estados hover/activo sin hardcodear nada.
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar) / <alpha-value>)',
          foreground: 'hsl(var(--sidebar-foreground) / <alpha-value>)',
          muted: 'hsl(var(--sidebar-muted) / <alpha-value>)',
          accent: 'hsl(var(--sidebar-accent) / <alpha-value>)',
          cta: 'hsl(var(--sidebar-cta) / <alpha-value>)',
          'cta-foreground': 'hsl(var(--sidebar-cta-foreground) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;

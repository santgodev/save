# Save — Design Tokens & Componentes Compartidos

_Cuándo usar qué. Cómo no romper la consistencia visual._
_Última revisión: 2026-04-29._

---

## Reglas absolutas

1. **Nunca `alert()`**. Nunca `Alert.alert` directo. Siempre `notify.*`.
2. **Nunca `toLocaleString` para dinero**. Siempre `formatMoney()`.
3. **Nunca `fontSize: 24`**. Usa `theme.typography.h2` o equivalente.
4. **Nunca `Date.getMonth()` con MONTHS array local**. Usa `<MonthNav>` y `MONTHS` de `components/MonthNav.tsx`.
5. **Nunca emojis en UI**. La marca es seria/clara, sin "¡Listo! 🎉".
6. **Nunca `session: any`**. Importa `Session` de `@supabase/supabase-js`.

Si rompes una de estas, la inconsistencia se acumula y termino
auditando otra vez.

---

## `lib/format.ts` — formato de dinero y fechas

```ts
import { formatMoney, formatMoneyDigits, formatPercent, formatShortDate } from '../lib/format';
```

| Función | Cuándo | Ejemplo |
|---|---|---|
| `formatMoney(n)` | Mostrar plata en cualquier `<Text>`. Maneja null/undefined/NaN. Siempre devuelve `$1.250.000` (sin espacio, sin decimales). | `<Text>{formatMoney(state.income_month)}</Text>` |
| `formatMoneyDigits(value)` | El **valor** de un `<TextInput>` numérico. Solo el número formateado, sin símbolo. | `<TextInput value={formatMoneyDigits(amount)} ... />` |
| `formatPercent(ratio, decimals?)` | Porcentajes (input: 0.35 → "35%"). | `<Text>{formatPercent(0.83)}</Text>` |
| `formatShortDate(input)` | Fecha legible para listas. | `<Text>{formatShortDate(tx.date_string)}</Text>` |

### Convenciones del símbolo

- **Pegado al número**, sin espacio: `$1.250.000`. NO `$ 1.250.000`.
- **Sin decimales**, redondeado al peso entero.
- **Negativos** prefijados con `-` antes del `$`: `-$12.345`.
- **null/undefined/NaN** → `$0`.

### Anti-patrones

```tsx
// ❌ NO hagas esto
<Text>$ {n.toLocaleString('es-CO')}</Text>
<Text>${budget.toLocaleString('es-CO')}</Text>
const formatCurrency = (n) => `$ ${Math.round(n).toLocaleString('es-CO')}`;

// ✅ Hazlo así
import { formatMoney } from '../lib/format';
<Text>{formatMoney(n)}</Text>
```

---

## `lib/notify.ts` — notificaciones unificadas

```ts
import { notify } from '../lib/notify';
```

| Helper | Cuándo | Ejemplo |
|---|---|---|
| `notify.error(message, title?)` | Algo falló. Default title = "Ups". | `notify.error('No pudimos guardar el ingreso.');` |
| `notify.success(title, message?)` | Operación exitosa. | `notify.success('Listo', 'Memoria actualizada.');` |
| `notify.info(title, message?)` | Información neutral. | `notify.info('Aviso', 'Hay una versión nueva.');` |
| `notify.confirm(title, message, opts)` | Acción destructiva o reversible. | `notify.confirm('Eliminar X', '¿Seguro?', { onConfirm: doDelete, destructive: true });` |

### Opciones de `confirm`

```ts
notify.confirm(
  "Eliminar bolsillo",
  "Esta acción no se puede deshacer.",
  {
    onConfirm: async () => { await doDelete(); },     // requerido
    onCancel: () => { /* opcional */ },
    confirmLabel: "Eliminar",                          // default: "Confirmar"
    cancelLabel: "Cancelar",                           // default: "Cancelar"
    destructive: true,                                 // bota rojo en iOS
  }
);
```

### Anti-patrones

```tsx
// ❌ NO uses `alert()` pelado de RN — se ve barato
alert('Selecciona un bolsillo.');

// ❌ NO uses Alert.alert directo — duplica el patrón
Alert.alert('Error', 'Faltan campos.');

// ✅ Hazlo así
notify.error('Selecciona un bolsillo.');
notify.error('Faltan campos.');
```

---

## `lib/useMonthlyState.ts` — el hook del estado mensual

```ts
import { useMonthlyState } from '../lib/useMonthlyState';

const { state, loading, error, refresh } = useMonthlyState();
// O para un mes específico:
const { state } = useMonthlyState({ year: 2026, month: 3 });
```

`state` es el JSON que devuelve `get_monthly_state`. Estructura:

```ts
{
  year: number;
  month: number;          // 1..12
  month_start: string;    // ISO
  month_end: string;      // ISO
  currency: string;       // "COP"
  income_month: number;
  spent_month: number;
  net_month: number;
  allocated_total: number;   // SUM allocated_budget
  available_total: number;   // SUM budget (lo que tienes hoy)
  pockets: Array<{
    id: string; name: string; category: string; icon: string | null;
    allocated: number;       // plan
    available: number;       // disponible hoy
    spent_month: number;     // gastado este mes
    pct_used: number | null; // 0..100+
  }>;
  top_merchants: Array<{ merchant: string; display: string; total: number; count: number }>;
  previous_month: { year, month, income, spent, net };
}
```

### Anti-patrones

```tsx
// ❌ NO recalcules el mes desde transactions
const totalIncomeMonth = transactions.filter(tx => tx.category === 'Ingreso')
  .reduce((acc, tx) => acc + tx.amount, 0);

// ❌ NO restes gastos a pocket.budget — ya viene decrementado por register_expense
const remaining = pocket.budget - getPocketSpending(pocket.category); // DOBLE RESTA

// ✅ Hazlo así
const { state } = useMonthlyState();
const totalIncomeMonth = state?.income_month ?? 0;
const myPocket = state?.pockets.find(p => p.id === pocketId);
const remaining = myPocket?.available ?? 0;
```

---

## `components/BottomSheet.tsx` — modal centrado compartido

```tsx
import { BottomSheet } from '../components/BottomSheet';

<BottomSheet
  visible={!!editing}
  onClose={() => setEditing(null)}
  title="Editar bolsillo"
  scrollable
>
  ...contenido...
</BottomSheet>
```

| Prop | Tipo | Default | Descripción |
|---|---|---|---|
| `visible` | boolean | — | Si false no renderiza nada. |
| `onClose` | `() => void` | — | Tap afuera o tap en X. |
| `title` | string \| undefined | undefined | Si no lo pasas, no hay header. |
| `scrollable` | boolean | false | Envuelve el contenido en `<ScrollView>`. |
| `children` | ReactNode | — | Lo que sea. |

### Comportamiento

- Backdrop oscuro con `BlurView` intensidad 40 (iOS) o 80 (Android).
- Tap en backdrop = `onClose()`.
- Header: título a la izquierda, botón X a la derecha (con hitSlop generoso).
- Soporta teclado con `KeyboardAvoidingView` automático.
- Z-index 1000.

### Cuándo usarlo

✅ Cualquier diálogo de confirmación o edición pequeña que antes hubieras
hecho con `Modal` + `View modalOverlay` manual.

❌ Para flujos full-screen (como AddIncome o Scanner), no lo uses — esos
deben ser pantallas propias.

---

## `components/MonthNav.tsx` — selector de mes

```tsx
import { MonthNav, MONTHS } from '../components/MonthNav';

const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

<MonthNav value={selectedMonth} onChange={setSelectedMonth} />
// O con año:
<MonthNav value={selectedMonth} onChange={setSelectedMonth} showYear year={2026} />
```

| Prop | Tipo | Default |
|---|---|---|
| `value` | number (0..11, igual que Date.getMonth()) | — |
| `onChange` | `(next: number) => void` | — |
| `showYear` | boolean | false |
| `year` | number | undefined (solo se muestra si `showYear=true`) |

### Comportamiento

- Flecha izquierda/derecha + título centrado.
- Wrap-around: enero → diciembre y viceversa.
- Haptic light al tocar.

### Cuándo usarlo

✅ En cualquier pantalla que muestre datos por mes (Pockets, Expenses).
Si Dashboard o Stats agregan navegación por mes en el futuro, **usar
este componente** — NO redefinir el array `MONTHS` ni los botones.

---

## `theme.typography` — la escala tipográfica

```tsx
const { theme } = useTheme();

<Text style={theme.typography.display}>$1.250.000</Text>
<Text style={theme.typography.h1}>Bolsillos</Text>
<Text style={theme.typography.body}>Texto normal</Text>
```

| Token | Tamaño | Peso | Uso |
|---|---|---|---|
| `display` | 44 | 900 | El número grande (saldo Dashboard, total Pockets). |
| `displaySmall` | 32 | 900 | Cifras destacadas secundarias. |
| `h1` | 32 | 800 | Headers de pantalla. |
| `h2` | 24 | 700 | Sección importante. |
| `h3` | 20 | 700 | Sección normal. |
| `title` | 18 | 600 | Subtítulos. |
| `bodyLarge` | 16 | 400 | Lead text. |
| `body` | 14 | 400 | Default. |
| `bodyMedium` | 14 | 500 | Body con énfasis. |
| `bodySmall` | 12 | 400 | Texto chico. |
| `caption` | 11 | 600 | Etiquetas con uppercase. |
| `label` | 10 | 800 | Labels de uppercase letterspaced. |

### Anti-patrones

```tsx
// ❌ NO uses fontSize literal
<Text style={{ fontSize: 24, fontWeight: '700' }}>Saldo</Text>

// ✅ Hazlo así
<Text style={theme.typography.h2}>Saldo</Text>

// ❌ NO mezcles
<Text style={{ ...theme.typography.h2, fontSize: 28 }}>...</Text>
// Si necesitas otro tamaño, agrega un token al theme — no hardcodees.
```

---

## Tipo `Session` en props

```tsx
import type { Session } from '@supabase/supabase-js';

export const MyScreen = ({ session }: { session: Session }) => { ... };
```

`session.user.id` es el UUID del usuario, `session.access_token` es el
JWT que pasamos en el header `Authorization`.

### Anti-patrones

```ts
// ❌ NO uses any
{ session: any }

// ❌ NO uses unknown si vas a hacer session.user.id
{ session: unknown }

// ✅ Sé específico
import type { Session } from '@supabase/supabase-js';
{ session: Session }
```

---

## Personalidad / voz

La app es un asesor sobrio, no un coach motivacional ni un chatbot
juvenil. Aplica a textos de UI, microcopy, mensajes del chat-advisor,
emails (cuando los haya).

**Sí:**
- "Listo" en lugar de "¡Logrado!".
- "Eliminar movimiento" en lugar de "Confirmar y Reversar".
- "Mover entre bolsillos" en lugar de "Traspaso Estratégico".
- "No pudimos sincronizar" en lugar de "Ups, hubo un error fatal".
- "Buenos días" en lugar de "¡Buenos días! ☀️".

**No:**
- Jerga colombiana (parce, chévere, oiga, ve).
- Exclamaciones en cada frase.
- Emojis decorativos.
- Verbos pomposos ("realiza", "efectúa", "estratégico").

El chat-advisor lo enforce en su system prompt. La UI lo enforce con
revisión.

---

## Anti-patrones globales detectados en auditorías pasadas

Si encuentras alguno de estos, **arréglalo**:

| Patrón | Por qué está mal | Reemplazo |
|---|---|---|
| `formatCop`, `formatCurrency` local | 5 funciones distintas con outputs diferentes. | `formatMoney` de `lib/format`. |
| `$ {n.toLocaleString('es-CO')}` inline | Duplica la decisión de formato. | `{formatMoney(n)}` |
| `alert('mensaje')` | En RN se ve barato y no soporta título. | `notify.error('mensaje')` |
| `Alert.alert(title, body, [actions])` | Duplica el wrapper. | `notify.confirm(...)` o `notify.error(...)` |
| `pocket.budget - getPocketSpending(category)` | Doble resta — `budget` ya viene decrementado. | `pocket.budget` directo (o `state.pockets[i].available`). |
| `{ session: any }` | Pierde type safety. | `{ session: Session }` |
| `monthNav` / `monthTitle` styles locales | Duplican el componente compartido. | `<MonthNav value={m} onChange={setM} />`. |
| Emojis en saludos/CTAs | Inconsistente con la marca. | Texto plano. |
| `fontSize: 24` literal | No usa el design system. | `theme.typography.h2` |

---

## Lecturas cruzadas

- `docs/ARCHITECTURE_REVIEW.md` — mapa general del sistema.
- `docs/AI_SYSTEM_DESIGN.md` — cómo el chat respeta estas reglas en su prompt.
- `docs/THEME_DESIGN_SYSTEM.md` — colors, shadows, radius (no cubierto acá).
- `tests/RESULTS.md` corridas 9 y 10 — historial de cómo llegamos a esto.

# Bitácora de tests

Cada sesión de pruebas se anota acá con fecha y hallazgos. Sirve como
historia de regresiones.

## 2026-04-22 — primera corrida (simulando "Juan Pérez")

**Corredor:** Claude (vía Supabase MCP) contra el proyecto `vxdnudkaelhqntrrwdwa` (SAVE prod).
**Modo:** cada caso envuelto en `BEGIN; … ROLLBACK;` — no se persistieron cambios.

📄 Reporte completo → `tests/TEST_REPORT.md`.

### Resumen ejecutivo

- 3 bugs críticos encontrados. El #1 (transferencia con monto negativo) es
  financialmente explotable y debe arreglarse **antes** de mover usuarios reales.
- 3 bugs altos (self-transfer, monto 0, ambigüedad por categoría).
- 7 fricciones de producto (default USD, income=0, OCR débil, etc.).
- Lo que SÍ funciona: RLS, saldo insuficiente en caminos positivos,
  inmunidad a SQL injection por merchant, y el nuevo prompt advisor.v2
  sí razona con contexto.

### Regresión creada
- `tests/regressions/regression_001_negative_amount.sql` — cubre
  montos negativos, self-transfer y monto 0. Debe pasar en verde
  DESPUÉS de aplicar la migración `20260422000001_safety_guards.sql`.

---

## 2026-04-22 (segunda corrida) — POST-FIX safety_guards

**Corredor:** Claude vía Supabase MCP.
**Modo:** `BEGIN/ROLLBACK` contra tu usuario santgodev@gmail.com.
**Migración aplicada:** `supabase/migrations/20260422000001_safety_guards.sql` (OK).

### Verificación post-fix

| Bug # | Caso | Antes | Ahora |
|---|---|---|---|
| #1 Crítico | transfer monto negativo | Invertía flujo | ❌ Rechaza: "El monto debe ser positivo" |
| #4 Alto    | self-transfer (from=to) | Creaba 2 tx falsas | ❌ Rechaza: "No puedes transferir al mismo bolsillo" |
| #5 Alto    | transfer monto 0 | Creaba 2 tx basura | ❌ Rechaza: "El monto debe ser positivo" |
| Nuevo      | transfer a pocket ajeno | (no probado antes) | ❌ Rechaza: "Bolsillo destino no existe o no te pertenece" |
| #3 Crítico | expense sin bolsillo | Tx huérfana | ✅ Cae en "Otros", metadata.requested_category='Mascotas' |
| #5 Alto    | expense monto 0 | Pasaba | ❌ Rechaza |
| Nuevo      | expense monto negativo | (no probado antes) | ❌ Rechaza |
| #10 Medio  | expense merchant='' | Pasaba | ❌ Rechaza: "El nombre del comercio no puede estar vacío" |

### Happy path
Transferencia $5.000 Comida → Fondo Futuro:
- Comida: -$5.000 ✅
- Fondo Futuro: +$5.000 ✅
- 2 transacciones creadas con `internal_transfer_out` / `internal_transfer_in` ✅

### Pendiente
Todavía no arreglados (para próximas sesiones):
- Bug #2 Crítico — `pockets.budget` doble rol (presupuesto + saldo). Requiere migración estructural.
- Bug #6 Alto — categoría duplicada: ya desambigüé con `ORDER BY created_at ASC`,
  pero lo ideal es pasar `pocket_id` explícito desde el cliente.
- Bugs 7-13 (default USD, monthly_income=0, fechas raras, etc.).

### Hallazgos sobre RPCs

| # | Severidad | Caso | Qué pasó |
|---|---|---|---|
| 1 | ⚠  Alta | self-transfer (from=to) | NO está bloqueado. Crea 2 transacciones falsas y budget queda igual. |
| 2 | ⚠  Alta | monto 0 | Crea 2 transacciones con valor 0 — basura en el historial. |
| 3 | 🟠 Media | monto negativo | Dependía del caso (ver 02_rpc_transfer.sql #5). |
| 4 | 🔴 Crítica | `register_expense` sin bolsillo | Crea transacción huérfana. |
| 5 | ⚠  Alta | categoría duplicada | `LIMIT 1` sin `ORDER BY` → descuento no-determinista. |
| 6 | 🔴 Crítica | modelo `pockets.budget` | Se usa como saldo corriente — se pierde el presupuesto original. |

### Hallazgos sobre perfil / datos

- `profiles.preferred_currency` default es `'USD'` — app colombiana.
- `profiles.monthly_income = 0` en tu cuenta — bloquea razonamiento del asesor.
- `canonical_merchant` está null en todas las transacciones recientes.
- `scan_success` events: muchos con merchant "Desconocido" o "Factura Escaneada".
- `chat.message.sent` events con `session_id=null` — imposible agrupar conversación.

### Recomendaciones derivadas (priorizadas)

1. **[hoy]** Agregar validaciones al inicio de `transfer_between_pockets`:
   `if p_from_id = p_to_id then raise 'Mismo bolsillo'`,
   `if p_amount <= 0 then raise 'Monto debe ser positivo'`.
2. **[esta semana]** Separar `pockets.budget` en dos columnas:
   `allocated_budget` (lo que te asignaste) + `available_balance` (lo que queda).
3. **[esta semana]** Default `preferred_currency = 'COP'`.
4. **[esta semana]** `register_expense`: si no hay bolsillo, o bien crearlo
   automáticamente (categoría = "Otros" por defecto) o fallar explícitamente.
5. **[sprint]** Trigger que popule `canonical_merchant` al insertar.
6. **[sprint]** `chat_messages.session_id` no-null default (UUID por apertura).

---

## Plantilla para futuras corridas

```
## YYYY-MM-DD — <motivo>

Corredor: <quién / qué>
Modo: <branch / local / prod rollback>

### Hallazgos
<tabla de severidad + caso + qué pasó>

### Recomendaciones
<…>
```

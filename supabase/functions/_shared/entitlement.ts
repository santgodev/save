// =====================================================================
// entitlement.ts — chequeo de suscripción activa contra RevenueCat.
// =====================================================================
// Hoy (`chat-advisor`, `ocr-receipt`) solo validan que el JWT sea válido,
// no que el usuario esté pagando. Cualquiera con una cuenta gratis puede
// llamar estas funciones directo (sin pasar por el Paywall) y generar
// costo indefinido en OpenAI/Google Vision.
//
// DISEÑO DELIBERADAMENTE CONSERVADOR — falla abierto siempre:
//   - Si no hay `REVENUECAT_SECRET_KEY` configurado → active: true (no
//     bloquea a nadie hasta que el secret exista).
//   - Si la llamada a RevenueCat falla por cualquier razón (red, timeout,
//     respuesta inesperada) → active: true (nunca tumbamos a un usuario
//     real por un problema de nuestro lado).
//   - Si RevenueCat responde limpio y NO hay entitlement activo →
//     active: false, pero el llamador decide qué hacer con eso.
//
// Por qué no bloquea directo desde acá: hay una ventana legítima justo
// después del onboarding (tour guiado de bienvenida) donde el usuario
// nuevo puede tocar el chat o el escáner real ANTES de llegar al Paywall
// -- eso es a propósito (ver comentario en app/index.tsx). Bloquear duro
// sin haber podido probar esto contra RevenueCat en vivo podría tumbar
// esa ventana legítima. Por ahora los callers deben usar `active` solo
// para loguear, no para rechazar la request -- hasta que se revise el
// dato real y se decida activar el bloqueo a propósito.
// =====================================================================

const REVENUECAT_SECRET_KEY = Deno.env.get("REVENUECAT_SECRET_KEY");
const ENTITLEMENT_ID = "premium"; // debe coincidir con src/lib/purchases.ts

export type EntitlementCheck = {
  // `active: true` significa "dejar pasar" -- ya sea porque de verdad hay
  // suscripción, o porque no tenemos suficiente confianza en el chequeo
  // como para no dejar pasar (secret no configurado, error de red/parseo).
  // `active: false` significa "RevenueCat respondió limpio y este usuario
  // no tiene el entitlement" -- señal real para loguear, el llamador
  // decide si además bloquea.
  active: boolean;
  reason:
    | "no_secret_configured" // el chequeo está apagado, nadie lo ve nunca
    | "active_entitlement"
    | "no_entitlement"
    | "subscriber_not_found"
    | "check_failed"; // error de red/parseo -- tratado como "active" igual
};

export async function checkEntitlement(userId: string): Promise<EntitlementCheck> {
  if (!REVENUECAT_SECRET_KEY) {
    return { active: true, reason: "no_secret_configured" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        headers: { Authorization: `Bearer ${REVENUECAT_SECRET_KEY}` },
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);

    if (res.status === 404) {
      // RevenueCat nunca vio a este app_user_id -- nunca abrió el Paywall
      // ni el SDK sincronizó. Señal real, se loguea igual que "sin plan".
      return { active: false, reason: "subscriber_not_found" };
    }
    if (!res.ok) {
      console.error(`[entitlement] RevenueCat respondió ${res.status} para ${userId}`);
      return { active: true, reason: "check_failed" };
    }

    const body = await res.json();
    const entitlement = body?.subscriber?.entitlements?.[ENTITLEMENT_ID];
    if (!entitlement) {
      return { active: false, reason: "no_entitlement" };
    }

    const expiresAt = entitlement.expires_date ? new Date(entitlement.expires_date) : null;
    const graceUntil = entitlement.grace_period_expires_date
      ? new Date(entitlement.grace_period_expires_date)
      : null;
    const now = new Date();

    const isActive =
      expiresAt === null ||
      expiresAt > now ||
      (graceUntil !== null && graceUntil > now);

    return isActive
      ? { active: true, reason: "active_entitlement" }
      : { active: false, reason: "no_entitlement" };
  } catch (e) {
    console.error("[entitlement] Error consultando RevenueCat:", e instanceof Error ? e.message : e);
    return { active: true, reason: "check_failed" };
  }
}

# Implementation Plan: Optimizar la pestaña de concientización (Awareness) para el público colombiano

## Goal Description
Rediseñar el copy y los elementos visuales de la pantalla de concientización del Paywall para generar mayor impacto emocional y FOMO en usuarios colombianos. Se buscarán palabras y conceptos que resonarán con la realidad financiera cotidiana de Colombia, resaltando los "gastos hormiga" y el miedo a perder dinero sin control.

## User Review Required
> [!IMPORTANT]
> Necesitamos tu aprobación antes de iniciar la investigación y aplicar cambios.
> - ¿Quieres que incluya ejemplos de copy final y pruebas A/B dentro del plan?
> - ¿Prefieres enfocarnos en un tono más formal o más coloquial?

## Open Questions
> [!WARNING]
> - ¿Cuál es el rango de edad principal de los usuarios actuales? (Ej.: 18‑35, 25‑45) 
> - ¿Hay restricciones de longitud de texto en la pantalla de concientización (p.ej., máximo 3 líneas)?
> - ¿Quieres que integremos alguna referencia a la inflación o al salario mínimo colombiano?

## Proposed Changes
---
### Investigación y Análisis (1‑2 días)
- **Revisión de estudios de comportamiento financiero en Colombia** (Banco de la República, DANE, estudios de fintech locales). 
- **Análisis de palabras clave**: identificar términos de alta relevancia como "gasto hormiga", "dinero se escapa", "presupuesto", "ahorro", "sobrante", "miedo al balance", "corte de crédito", "inflación", "salario mínimo".
- **Entrevistas rápidas** (5‑10 min) con usuarios reales (quizá vía encuesta interna) para validar frases que les generan mayor preocupación.
- **Benchmark de competidores locales** (RappiPay, Nequi, Davivienda) que usan copy de concientización.

---
### Redacción de Copy (1 día)
- Generar **3‑5 versiones** de títulos, subtítulos y texto de matemática del dolor, adaptadas a distintos tonos (colloquial, empático, directo).
- Incluir **emojis** moderados según estilo de la app (ej.: ⚠️, 💸) si el tono lo permite.
- Prototipar **variantes visuales** (colores de alerta, iconografía, uso de ilustraciones de café, buses, etc.)

---
### Implementación en Código (1 día)
- Añadir nuevos textos a `src/screens/Paywall.tsx` bajo constantes o i18n.
- Crear **propiedad de estilo** opcional para alternar entre variantes mediante una bandera (`variant: 'colloquial' | 'formal'`).
- Mantener tipografía y colores del tema (usar `theme.colors.error`, `theme.colors.warning`).

---
### Pruebas y Validación (2‑3 días)
- **Pruebas A/B** en entorno de staging usando Remote Config para servir variantes a subconjuntos de usuarios.
- Medir métricas: % de clics en "Ver cómo solucionarlo", tiempo en pantalla, tasa de conversión a planes.
- Recopilar feedback cualitativo mediante pantalla de encuesta post‑cierre.

---
### Deploy y Monitoreo (1 día)
- Fusión a `main` y despliegue a producción.
- Configurar alertas de monitoreo de conversión y de crashes.

## Verification Plan
### Automated Tests
- Unit test para la función que selecciona la variante del copy según flag.
- Snapshot test de la pantalla de concientización para cada variante.

### Manual Verification
- Ejecutar la app en simulador Android/iOS y revisar visualmente los textos.
- Simular los flujos de A/B cambiando la flag.
- Verificar que el cálculo de la pérdida anual se actualiza dinámicamente según `TRIAL_DAYS` y precios.

---
**Metadata**
- RequestFeedback: true
- Summary: "Plan para investigar y aplicar copy optimizado al Paywall para usuarios colombianos"
- UserFacing: true

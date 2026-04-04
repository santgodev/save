/**
 * Normaliza nombres de comercios para asegurar la consistencia en el backend
 * y facilitar la detección de patrones de gasto mediante IA.
 * 
 * Ejemplo: "Ara S.A.S.", "Ara.", "  Ara " -> "ara"
 */
export const normalizeMerchant = (name: string): string => {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ") // Eliminar espacios múltiples
    .replace(/[^\w\s]/gi, "") // Solo letras, números y espacios
    .replace(/\s+$/g, ""); // Asegurar que no quede un espacio al final
};

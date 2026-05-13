# 🧠 Memoria de Trabajo: Proyecto La Cuota (Saldamos)

Este documento sirve como guía oficial y memoria para Antigravity en este proyecto.

## 🔄 Flujo de Trabajo Estándar

1.  **Validación de Construcción:** 
    *   SIEMPRE ejecutar `npx tsc -b` antes de subir cambios. Vercel tiene una verificación estricta y fallará si hay errores de tipos.
2.  **Despliegue:**
    *   Subir cambios directamente a `main` para despliegue automático en Vercel, a menos que se solicite una rama de preview.
3.  **Estabilidad:**
    *   Mantener el workflow de GitHub Actions `supabase-keep-alive.yml` activo para evitar que el proyecto gratuito de Supabase se pause.

## 🎨 Guía de Estilo y Diseño (Saldamos Blue)

*   **Paleta de Colores:** Usar azul profesional (`blue-600`, `blue-700`).
*   **Erradicación de Violeta:** Eliminar cualquier rastro de `violet`, `indigo` o colores similares heredados de la plantilla original (incluyendo efectos de confeti, bordes y estados hover).
*   **Aesthetics:** Diseño premium, moderno, con sombras suaves (`card-shadow`) y bordes redondeados (`rounded-2xl`, `rounded-3xl`).

## ⚙️ Funcionalidades Clave
*   **Seguimiento de Pagos:** Opción `track_payments` en gastos para conciliación individual.
*   **Multimoneda:** Soporte para CLP, ARS, USD, etc., con convertidor de divisas.
*   **Parser de La Cuota:** Capacidad de importar mensajes pegados directamente desde la app original de La Cuota.

---
*Nota: Antigravity debe consultar este documento al inicio de cada sesión para mantener la consistencia.*

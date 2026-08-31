# Gestión de Gastos — Documentación Técnica

**Versión:** 2.5.1  
**Repositorio:** `psettimini/PWA4` (branch `main`)  
**Hosting:** GitHub Pages  
**Última actualización:** Agosto 2026

---

## Descripción

**Gestión de Gastos** es una Progressive Web App (PWA) para gestión de gastos personales y de pequeños negocios. Permite registrar gastos, consultar historial con filtros avanzados, visualizar dashboards con gráficos interactivos, comparar meses y administrar catálogos de centros de gasto y métodos de pago.

Funciona como una SPA (Single Page Application) con 5 secciones navegables por tabs, soporte offline con cola de sincronización, modo oscuro, pull-to-refresh y diseño responsive con experiencia nativa en mobile.

---

## Índice de Documentación

| Documento | Contenido |
|-----------|----------|
| [Arquitectura](arquitectura.md) | Stack tecnológico, estructura de archivos, flujo de datos |
| [Base de Datos](base-de-datos.md) | Esquema de tablas, RLS, función RPC `bulk_rename` |
| [Funcionalidades](funcionalidades.md) | Detalle de cada módulo: Carga, Historial, Dashboard, Comparar, ABM, Auth, Config |
| [UI y Estilos](ui-y-estilos.md) | Sistema de notificaciones, dark mode, responsive, variables CSS |
| [PWA y Offline](pwa-y-offline.md) | Service Worker, cache de datos, cola de sincronización offline |
| [Seguridad](seguridad.md) | Protecciones XSS, RLS, manejo de sesión |
| [Referencia Técnica](referencia-tecnica.md) | Estado global, utilidades, catálogo completo de funciones |

---

## Stack Rápido

| Capa | Tecnología |
|------|------------|
| Frontend | HTML5 + Tailwind CSS (CDN) + JavaScript vanilla modularizado |
| Gráficos | Chart.js |
| Backend / DB | Supabase (PostgreSQL + Auth + RLS) |
| Hosting | GitHub Pages |
| PWA | Service Worker + Web App Manifest |

---

## Roadmap

- [x] **Fase 1:** Setup de base de datos (tablas, RLS, triggers, función `bulk_rename`)
- [x] **Fase 2:** Frontend migrado de Google Apps Script a Supabase
- [x] **Modularización:** `index.html` split en 13 archivos
- [ ] **Fase 3:** Integración de billing con MercadoPago + landing page
- [ ] **Fase 4:** Beta launch y release público

# Inventario Colegio Providencia

Sistema web para la gestión del inventario tecnológico del Colegio Providencia.

## Objetivo

Recrear y modernizar la aplicación Microsoft Access `Colegio Providencia(1).accdb` como una aplicación web segura, trazable y mantenible.

## Arquitectura

- Next.js (App Router) + TypeScript
- Supabase Auth + PostgreSQL + Row Level Security
- Vercel para despliegue
- GitHub para control de versiones

## Principios de migración

- El archivo Access original se conserva sin modificaciones.
- Ningún dato histórico se elimina durante la importación.
- Los registros importados conservan `legacy_source`, `legacy_id` y `legacy_data`.
- No existe registro público de usuarios.
- El acceso a datos depende de autenticación y autorización en la base de datos, no solo de la interfaz.
- Los equipos dados de baja se conservan con historial.

## Módulos previstos

- Login
- Dashboard
- Inventario general
- Computadores
- Audio
- Muebles
- Impresoras
- Proyectores
- Accesorios
- Televisores
- Varios
- Bajas de equipos
- Informes
- Historial y auditoría
- Configuración

## Estado

Proyecto en construcción. La primera fase corresponde al núcleo de autenticación, modelo de datos y seguridad antes de importar la base Access.

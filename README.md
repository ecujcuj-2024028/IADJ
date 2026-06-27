# Gemini Radio - YouTube Music DJ

Este proyecto es un orquestador e interfaz interactiva para un DJ de radio impulsado por Inteligencia Artificial (Gemini a través de OpenRouter) y síntesis de voz (ElevenLabs). Te permite reproducir música de YouTube Music, interactuar con un DJ por texto o voz, gestionar listas de reproducción, cola de reproducción, historial y me gustas/no me gustas en tiempo real.

---

## Arquitectura del Proyecto

El sistema está dividido en cuatro componentes principales orquestados con **Docker**:

1. **`frontend`** (React + Vite): Interfaz web de usuario.
   - Puerto: `5173`
2. **`node-backend`** (Node.js + Express): Servidor orquestador que gestiona la lógica del DJ, llamadas a OpenRouter y ElevenLabs para generación de voz.
   - Puerto: `3001`
3. **`python-service`** (Python + FastAPI): Servicio que interactúa con la API de YouTube Music (`ytmusicapi`) para buscar canciones, gestionar colas, reproducir e integrar me gustas.
   - Puerto: `8000`
4. **`db`** (PostgreSQL): Base de datos para persistir tokens de sesión y configuraciones.
   - Puerto: `5432`

---

## Requisitos Previos

Asegúrate de tener instalado:
* **Docker** y **Docker Compose**
* **Git** (para subirlo a GitHub)
* Llaves de API de:
  * **OpenRouter** (para el modelo de IA Gemini)
  * **ElevenLabs** (para la generación de voz del DJ)

---

## Configuración Inicial

Antes de levantar los contenedores, realiza los siguientes pasos de configuración:

1. **Crear archivo de entorno (`.env`)**:
   Duplica el archivo de ejemplo y nómbralo `.env`:
   ```bash
   cp backend/.env.example backend/.env
   ```
   Abre `backend/.env` y completa con tus llaves y configuraciones correspondientes:
   * `OPENROUTER_API_KEY`: Tu clave de OpenRouter.
   * `ELEVENLABS_API_KEY`: Tu clave de ElevenLabs.
   * `ELEVENLABS_VOICE_ID`: ID de la voz a utilizar.

2. **Sesión de YouTube Music (Opcional)**:
   Si quieres que el DJ acceda a tu historial, listas de reproducción personales y dé "me gusta" reales en tu cuenta de YouTube Music:
   * Genera el archivo `headers.json` siguiendo la documentación de [ytmusicapi](https://ytmusicapi.readthedocs.io/en/stable/setup.html#copy-request-headers).
   * Coloca el archivo `headers.json` dentro de la carpeta `backend/`.
   * *Nota: Si no agregas este archivo, el sistema funcionará automáticamente en **Modo Invitado**, permitiendo búsquedas generales.*

---

## Cómo Iniciar con Docker

Para iniciar todo el entorno de desarrollo con Docker Compose, ejecuta en la raíz del proyecto:

```bash
docker compose up --build
```

Esto compilará las imágenes necesarias, inicializará la base de datos PostgreSQL, y levantará los servicios.

* Acceso a la aplicación web (Frontend): [http://localhost:5173](http://localhost:5173)
* Documentación interactiva de la API Python (FastAPI): [http://localhost:8000/docs](http://localhost:8000/docs)
* Servidor Orquestador (Node): [http://localhost:3001](http://localhost:3001)

###  Detener los contenedores
Para apagar los servicios y conservar los datos de la base de datos:
```bash
docker compose down
```

Si deseas limpiar totalmente los datos y volúmenes de PostgreSQL:
```bash
docker compose down -v
```

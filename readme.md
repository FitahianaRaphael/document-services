document-service/
├── src/
|   |── benchmark/
|   |   └── bench.ts
│   ├── config/
│   │   └── index.ts
│   ├── models/
│   │   ├── batch.model.ts
│   │   └── document.model.ts
│   ├── routes/
│   │   ├── documents.routes.ts
│   │   ├── health.routes.ts
│   │   └── metrics.routes.ts
│   ├── services/
│   │   ├── batch.service.ts
│   │   ├── pdf.service.ts
│   │   └── queue.service.ts
│   ├── workers/
│   │   ├── pdf.thread.ts    
│   │   └── queue.worker.ts  
│   ├── middleware/
│   │   ├── errorHandler.ts
│   │   ├── rateLimiter.ts
│   │   └── validate.ts
│   ├── utils/
│   │   ├── circuitBreaker.ts
│   │   ├── logger.ts
│   │   └── metrics.ts
│   ├── app.ts
│   └── index.ts
│   └── bench.ts
├── docker-compose.yml
├── Dockerfile
├── swagger.yaml
├── package.json
└── tsconfig.json



#Document Generation Service

> API Node.js/TypeScript ultra-optimisée pour la génération de documents CERFA en batch  
> **Live demo** → `https://document-service.onrender.com` *(mettre à jour après déploiement)*

---

##  Fonctionnalités

- Génération asynchrone de **1 000 documents PDF** en parallèle
- Queue **Bull + Redis** avec retry exponentiel (3 tentatives)
- **Worker Threads** isolés pour la génération PDF (non-bloquant)
- Stockage PDF via **GridFS** (streaming, pas de charge mémoire)
- **Circuit Breaker** sur appels externes (DocuSign simulé)
- Métriques **Prometheus** + dashboard **Grafana**
- Logs **JSON structurés** avec corrélation `batchId` / `documentId`
- **Graceful shutdown** sur SIGTERM
- Fallback mémoire si Redis est indisponible

---


## Justification des choix techniques

| Technologie | Pourquoi |
|---|---|
| **Bull + Redis** | Queue persistante, retry natif avec backoff exponentiel, concurrency configurable, dashboard disponible (Bull Board) |
| **Worker Threads** | La génération PDF (CPU-bound) ne bloque jamais l'event loop Node.js — chaque thread est isolé avec timeout de 5s |
| **GridFS** | Streaming des fichiers PDF directement vers MongoDB sans charger le buffer entier en RAM — supporte des fichiers > 16 MB |
| **Opossum (Circuit Breaker)** | Protège les appels DocuSign/externes — évite l'effet cascade si le service tiers est lent ou down |
| **prom-client** | Standard de facto pour l'exposition de métriques Prometheus en Node.js |
| **Winston JSON** | Logs structurés indexables (ELK, Datadog) avec corrélation par `batchId`/`documentId` |
| **Mongoose + insertMany** | Insert de 1 000 documents en une seule opération réseau MongoDB |

---

##  Résultats de benchmark (1000 documents)

| Métrique | Résultat |
|---|---|
| Durée totale | 31.3 secondes |
| Documents / seconde | **32 docs/s** |
| Documents générés | **1000 / 1000 (0 erreur)** |
| Pic mémoire heap | 103 MB |
| CPU user | 1225 ms |

> Benchmark exécuté en local — performance en production sur Render sera similaire.
> Rapport HTML complet généré dans `benchmark-reports/`.

##  Démarrage local

### Prérequis

- Docker + Docker Compose
- Node.js 20+

### 1 — Cloner et démarrer

```bash
git clone https://github.com/TON_USER/document-service.git
cd document-service

# Tout démarre en une commande
docker-compose up --build
```

### 2 — Vérifier

```bash
curl http://localhost:3000/health
# → {"mongodb":"up","redis":"up","queue":"up",...}
```

### 3 — Scaler les workers

```bash
docker-compose up --scale worker=4
```

---

##  Déploiement sur Render

### Étape 1 — Préparer les services externes

1. Crée un compte sur [render.com](https://render.com)
2. Crée un **Redis** (New → Redis) → copie l'**Internal URL**
3. Crée un **MongoDB Atlas** gratuit sur [mongodb.com](https://cloud.mongodb.com) → copie la connection string

### Étape 2 — Déployer l'API

1. New → **Web Service** → connecte ton repo GitHub
2. Configure :
   - **Build Command** : `npm install && npm run build`
   - **Start Command** : `node dist/index.js`
   - **Instance Type** : Free (ou Starter pour la prod)
3. Ajoute les variables d'environnement :

```
NODE_ENV=production
MONGO_URI=mongodb+srv://...  (depuis Atlas)
REDIS_HOST=...               (depuis Render Redis Internal URL)
REDIS_PORT=6379
QUEUE_CONCURRENCY=20
PDF_WORKERS=4
PORT=3000
```

### Étape 3 — Déployer le Worker

1. New → **Background Worker** → même repo
2. **Start Command** : `node dist/workers/queue.worker.js`
3. Mêmes variables d'environnement que l'API

### Étape 4 — Mettre à jour le README

Remplace le lien en haut de ce README avec l'URL Render de ton API.

---

##  API Reference

### `POST /api/documents/batch`

Lance la génération d'un batch de documents.

```bash
curl -X POST https://document-service.onrender.com/api/documents/batch \
  -H "Content-Type: application/json" \
  -d '{"userIds": ["user-001","user-002","user-003"]}'
```

```json
{ "batchId": "550e8400-e29b-41d4-a716-446655440000", "message": "Batch accepted for processing" }
```

### `GET /api/documents/batch/:batchId`

Statut du batch.

```bash
curl https://document-service.onrender.com/api/documents/batch/550e8400-...
```

```json
{
  "batchId": "550e8400-...",
  "status": "completed",
  "totalCount": 3,
  "processedCount": 3,
  "failedCount": 0,
  "documents": [...]
}
```

### `GET /api/documents/:documentId`

Télécharge le PDF généré.

```bash
curl https://document-service.onrender.com/api/documents/DOC_ID --output cerfa.pdf
```

### `GET /health`

```json
{ "mongodb": "up", "redis": "up", "queue": "up", "uptime": 42.5 }
```

### `GET /metrics`

Métriques au format Prometheus.

### `GET /api-docs`

Documentation Swagger interactive.

---

## 🧪 Tests

```bash
npm test                
npm test -- --coverage   
```

Couverture cible : **≥ 70 %** des lignes.

---

## Benchmark

```bash
# Lancer un batch de 1000 documents et afficher le rapport
API_URL=http://localhost:3000 DOC_COUNT=1000 npm run benchmark
```

Exemple de sortie :
```
┌─────────────────────────────────────┐
│        RAPPORT DE BENCHMARK         │
├─────────────────────────────────────┤
│ Durée totale      : 48320   m       │
│ Documents/seconde : 20              │
│ Documents OK      : 1000            │
│ Documents KO      : 0               │
│ Mémoire ∆ heap    : 38      MB      │
│ CPU user          : 12400   ms      │
│ CPU system        : 890     ms      │
│ Statut final      : completed       │
└─────────────────────────────────────┘
```

---

## Métriques clés (Grafana)

| Métrique | Description |
|---|---|
| `documents_generated_total{status="success"}` | Documents générés avec succès |
| `documents_generated_total{status="failure"}` | Documents en échec |
| `batch_processing_duration_seconds` | Durée de traitement par batch |
| `queue_size` | Jobs en attente dans la queue |
| `pdf_generation_duration_seconds` | Durée de génération d'un PDF |

Grafana disponible sur `http://localhost:3001` (admin / admin).

---

## 📁 Structure du projet

```
src/
├── config/           Configuration centralisée
├── models/           Schémas Mongoose (Batch, Document)
├── routes/           Endpoints Express
├── services/         Logique métier (batch, queue, pdf)
├── workers/          Queue consumer + PDF Worker Thread
├── middleware/        Rate limiter, validation, error handler
└── utils/            Logger, métriques, circuit breaker
tests/
├── services/         Tests unitaires
└── routes/           Tests d'intégration
benchmark/            Script de performance
```
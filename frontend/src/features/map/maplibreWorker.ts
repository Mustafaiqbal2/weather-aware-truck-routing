import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

// MapLibre 6 finds its tile worker next to its own module via a computed file name, which
// bundlers can't follow. Let Vite bundle the worker and tell MapLibre where it ended up.
setWorkerUrl(workerUrl)

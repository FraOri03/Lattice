import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import '@/styles/index.css'
import App from '@/App'
import { useStore } from '@/store/useStore'
import { storage } from '@/lib/storage/StorageProvider'
import { docJsonToMarkdown } from '@/lib/export/ExportService'
import { docJsonToOdtXml } from '@/lib/convert/odt'
import { docJsonToRtf, rtfToDocJson } from '@/lib/convert/rtf'
import { ADAPTERS } from '@/lib/convert/ConversionService'

// dev-only handles for debugging from the browser console
if (import.meta.env.DEV) {
  const w = window as unknown as Record<string, unknown>
  w.__lattice = useStore
  w.__latticeDebug = {
    storage,
    docJsonToMarkdown,
    docJsonToOdtXml,
    docJsonToRtf,
    rtfToDocJson,
    ADAPTERS,
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

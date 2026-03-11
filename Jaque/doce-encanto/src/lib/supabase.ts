import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const storageBucket = (import.meta.env.VITE_SUPABASE_STORAGE_BUCKET as string | undefined) ?? 'images'

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

if (!hasSupabaseConfig) {
  console.error('Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente.')
}

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : createClient('https://invalid.supabase.local', 'invalid')

function randomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

function fileExtension(file: File) {
  const name = file.name || ''
  const dot = name.lastIndexOf('.')
  if (dot !== -1 && dot < name.length - 1) return name.slice(dot + 1).toLowerCase()
  const t = file.type || ''
  if (t.startsWith('image/')) return t.replace('image/', '').toLowerCase()
  return 'bin'
}

export async function uploadImageToSupabaseStorage(params: {
  file: File
  folder: string
  bucket?: string
}): Promise<{ publicUrl: string; path: string }> {
  const bucket = params.bucket ?? storageBucket
  const ext = fileExtension(params.file)
  const path = `${params.folder}/${new Date().toISOString().slice(0, 10)}/${randomId()}.${ext}`

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, params.file, {
    upsert: true,
    contentType: params.file.type || undefined,
  })
  if (uploadError) {
    const msg = String((uploadError as { message?: unknown }).message ?? '')
    if (msg.toLowerCase().includes('bucket not found')) {
      throw new Error(
        `Bucket "${bucket}" não encontrado no Supabase Storage. Crie esse bucket no projeto Supabase ou defina VITE_SUPABASE_STORAGE_BUCKET com o nome correto.`
      )
    }
    throw uploadError
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  const publicUrl = data?.publicUrl
  if (!publicUrl) throw new Error('Falha ao gerar URL pública da imagem')

  return { publicUrl, path }
}

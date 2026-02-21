import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const src = path.resolve('public/logo.png')
const outDir = path.resolve('public/icons')

async function main() {
  if (!fs.existsSync(src)) {
    console.error('Logo não encontrado em public/logo.png')
    process.exit(1)
  }
  fs.mkdirSync(outDir, { recursive: true })

  const tasks = [
    { size: 180, name: 'apple-touch-icon-180.png' },
    { size: 192, name: 'icon-192.png' },
    { size: 256, name: 'icon-256.png' },
    { size: 384, name: 'icon-384.png' },
    { size: 512, name: 'icon-512.png' }
  ]

  await Promise.all(
    tasks.map(async ({ size, name }) => {
      const out = path.join(outDir, name)
      try {
        execFileSync('sips', ['-Z', String(size), src, '--out', out], { stdio: 'ignore' })
      } catch (e) {
        fs.copyFileSync(src, out)
      }
    })
  )
  console.log('Ícones gerados em public/icons')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

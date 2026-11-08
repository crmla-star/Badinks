import { showToast } from './toast'

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // fallback for older/insecure contexts
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    el.remove()
    return ok
  }
}

/** Uses the phone's native share sheet when available, otherwise copies. */
export async function shareLink(url: string, title: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text: `Join the pickleball queue: ${title}`, url })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  await copyLink(url, 'Game link copied')
}

export async function copyLink(url: string, message = 'Link copied') {
  if (await copy(url)) showToast(message, 'success')
  else showToast(`Copy this link: ${url}`, 'info')
}

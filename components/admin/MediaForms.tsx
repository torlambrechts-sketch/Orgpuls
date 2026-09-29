'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { mediaAdd, mediaDelete, mediaDescribe } from '@/lib/admin/cmsActions'
import { MEDIA_MAX_BYTES, MEDIA_TYPES, WEB_MAX_WIDTH } from '@/lib/cms/media'
import { BTN, FIELD, FIELD_LABEL } from './ui'

/**
 * Content › Media's writes (0124, D-169). The browser makes the web version before anything is
 * sent: at most WEB_MAX_WIDTH wide, re-encoded as WebP — which also drops what a camera writes
 * into a photo (place, device, time) — and at most 2 MB, trying a lower quality before it gives
 * up. The database then reads the type from the bytes.
 */
type Problems = Record<string, string>

export type UploadLabels = {
  open: string
  title: string
  lead: string
  file: string
  altNo: string
  altEn: string
  altHint: string
  cancel: string
  close: string
  submit: string
  working: string
  problems: Problems
}

async function webVersion(file: File): Promise<{ blob: Blob; width: number; height: number } | 'type' | 'too_large' | 'unreadable'> {
  if (!(MEDIA_TYPES as readonly string[]).includes(file.type)) return 'type'
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return 'unreadable'
  }
  const scale = Math.min(1, WEB_MAX_WIDTH / bitmap.width)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return 'unreadable'
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  for (const q of [0.86, 0.76, 0.64]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', q))
    if (blob && blob.size <= MEDIA_MAX_BYTES) return { blob, width, height }
  }
  return 'too_large'
}

const base64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

export function MediaUpload({ labels }: { labels: UploadLabels }) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, start] = useTransition()

  const close = () => {
    dialog.current?.close()
    setFile(null)
    setProblem(null)
  }

  const submit = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    if (!file) return
    const form = new FormData(ev.currentTarget)
    start(async () => {
      setProblem(null)
      const web = await webVersion(file)
      if (typeof web === 'string') return setProblem(labels.problems[web] ?? labels.problems.failed ?? '')
      const fd = new FormData()
      fd.set('name', file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 110) + '.webp')
      fd.set('data', await base64(web.blob))
      fd.set('width', String(web.width))
      fd.set('height', String(web.height))
      fd.set('alt_no', String(form.get('alt_no') ?? ''))
      fd.set('alt_en', String(form.get('alt_en') ?? ''))
      const r = await mediaAdd(null, fd)
      if (!r.ok) return setProblem(labels.problems[r.problem] ?? labels.problems.failed ?? '')
      close()
      router.refresh()
    })
  }

  return (
    <>
      <button type="button" className={BTN.primary} onClick={() => dialog.current?.showModal()}>
        {labels.open}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="media-upload-title"
        onClose={() => {
          setFile(null)
          setProblem(null)
        }}
        className="m-auto box-border max-h-[88vh] w-[calc(100%-48px)] max-w-[560px] overflow-y-auto rounded-[22px] border border-line bg-sf p-[26px] text-ink shadow-[0_34px_80px_rgba(25,21,16,.3)] backdrop:bg-ink/[.42]"
      >
        <form onSubmit={submit}>
          <div className="flex items-start justify-between gap-[16px]">
            <div>
              <h2 id="media-upload-title" className="m-0 font-display text-[25px] font-medium leading-[1.15] [text-wrap:balance]">
                {labels.title}
              </h2>
              <div className="mt-[6px] text-[13px] text-mut [text-wrap:pretty]">{labels.lead}</div>
            </div>
            <button type="button" onClick={close} aria-label={labels.close} title={labels.close} className="flex h-[36px] w-[36px] flex-none cursor-pointer items-center justify-center rounded-pill border border-line bg-transparent text-[18px] text-ink">
              ×
            </button>
          </div>
          <div className="mt-[22px] flex flex-col gap-[16px]">
            <label className="block">
              <span className={FIELD_LABEL}>{labels.file}</span>
              <input
                type="file"
                name="file"
                accept={MEDIA_TYPES.join(',')}
                required
                onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
                className={`${FIELD} file:mr-[10px] file:cursor-pointer file:rounded-bar file:border file:border-solid file:border-line file:bg-transparent file:px-[10px] file:py-[5px] file:text-[12px] file:font-semibold file:text-ink`}
              />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>{labels.altNo}</span>
              <input name="alt_no" maxLength={300} lang="nb" className={FIELD} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>{labels.altEn}</span>
              <input name="alt_en" maxLength={300} lang="en" className={FIELD} />
            </label>
            <p className="m-0 rounded-[12px] border border-dashed border-line bg-bg px-[14px] py-[12px] text-[12.5px] leading-[1.5] text-mut">{labels.altHint}</p>
            {problem ? (
              <p role="alert" className="m-0 text-[12.5px] font-semibold text-caution">
                {problem}
              </p>
            ) : null}
          </div>
          <div className="mt-[22px] flex flex-wrap justify-end gap-[10px]">
            <button type="button" onClick={close} className={BTN.secondary}>
              {labels.cancel}
            </button>
            <button type="submit" disabled={!file || busy} className={BTN.dark}>
              {busy ? labels.working : labels.submit}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}

export type DescribeLabels = {
  name: string
  altNo: string
  altEn: string
  save: string
  saving: string
  saved: string
  remove: string
  removeConfirm: string
  inUse: string
  problems: Problems
}

export function MediaDescribe({ id, name, altNo, altEn, used, canWrite, labels }: { id: string; name: string; altNo: string; altEn: string; used: boolean; canWrite: boolean; labels: DescribeLabels }) {
  const router = useRouter()
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, start] = useTransition()

  const save = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    const fd = new FormData(ev.currentTarget)
    start(async () => {
      const r = await mediaDescribe(null, fd)
      setNote(r.ok ? { ok: true, text: labels.saved } : { ok: false, text: labels.problems[r.problem] ?? labels.problems.failed ?? '' })
      if (r.ok) router.refresh()
    })
  }
  const remove = () => {
    if (!window.confirm(labels.removeConfirm)) return
    const fd = new FormData()
    fd.set('id', id)
    start(async () => {
      const r = await mediaDelete(null, fd)
      if (r && !r.ok) setNote({ ok: false, text: labels.problems[r.problem] ?? labels.problems.failed ?? '' })
    })
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-[14px]">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className={FIELD_LABEL}>{labels.name}</span>
        <input name="name" defaultValue={name} required maxLength={120} readOnly={!canWrite} className={FIELD} />
      </label>
      <label className="block">
        <span className={FIELD_LABEL}>{labels.altNo}</span>
        <input name="alt_no" defaultValue={altNo} maxLength={300} lang="nb" readOnly={!canWrite} className={FIELD} />
      </label>
      <label className="block">
        <span className={FIELD_LABEL}>{labels.altEn}</span>
        <input name="alt_en" defaultValue={altEn} maxLength={300} lang="en" readOnly={!canWrite} className={FIELD} />
      </label>
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-[10px]">
          <button type="submit" disabled={busy} className={BTN.dark}>
            {busy ? labels.saving : labels.save}
          </button>
          <button type="button" disabled={busy || used} onClick={remove} className={`${BTN.secondary} disabled:cursor-default disabled:opacity-50`}>
            {labels.remove}
          </button>
          {used ? <span className="text-[12px] text-mut">{labels.inUse}</span> : null}
        </div>
      ) : null}
      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={`m-0 text-[12.5px] font-semibold ${note.ok ? 'text-ink' : 'text-caution'}`}>
          {note.text}
        </p>
      ) : null}
    </form>
  )
}

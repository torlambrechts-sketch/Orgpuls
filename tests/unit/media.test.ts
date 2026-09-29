import { describe, expect, it } from 'vitest'
import { parseContent } from '@/lib/cms/content'
import { MEDIA_KEY, mediaSrc } from '@/lib/cms/media'
import { Block, wordCount } from '@/lib/marketing/blocks'

/** Content › Media (0124, D-169): the image block and the address it names. */
const key = '34b69495cabdb7bedac747fd06e34a7a'

describe('the image block', () => {
  it('needs a real address, its words and its size', () => {
    expect(Block.safeParse({ t: 'image', key, alt: 'Et møte', w: 1600, h: 1000 }).success).toBe(true)
    expect(Block.safeParse({ t: 'image', key, alt: '', caption: 'Bildetekst', w: 1, h: 1 }).success).toBe(true)
    expect(Block.safeParse({ t: 'image', key: '../etc/passwd', alt: '', w: 1, h: 1 }).success).toBe(false)
    expect(Block.safeParse({ t: 'image', key, alt: '', w: 0, h: 1 }).success).toBe(false)
    expect(Block.safeParse({ t: 'image', key, w: 1, h: 1 }).success).toBe(false)
  })

  it('keeps an image section when the page is read, and drops a malformed one', () => {
    const c = parseContent({ blocks: [{ t: 'image', key, alt: 'A', w: 2, h: 1 }, { t: 'image', key: 'nope', alt: '', w: 1, h: 1 }] })
    expect(c?.blocks).toEqual([{ t: 'image', key, alt: 'A', w: 2, h: 1 }])
  })

  it('counts a caption as words read, and the image itself as none', () => {
    expect(wordCount([{ t: 'image', key, alt: 'many words here', caption: 'Et teammøte', w: 1, h: 1 }])).toBe(2)
  })
})

describe('the address', () => {
  it('is 32 hex characters under /media, on the site’s own origin', () => {
    expect(MEDIA_KEY.test(key)).toBe(true)
    expect(MEDIA_KEY.test(key.toUpperCase())).toBe(false)
    expect(mediaSrc(key)).toBe(`/media/${key}`)
  })
})

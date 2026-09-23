import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/Button'
import { Card, NoteCard, Row } from '@/components/ui/Card'
import { Pill } from '@/components/ui/Pill'
import { BAND_BAR, MaskedCell, RiskBadge, StackedBar, type Band } from '@/components/ui/Risk'

/**
 * The primitive gallery.
 *
 * Not a product screen — it is the surface the S2 pixel gate measures. Every primitive
 * appears here in every state it has, so a regression in any one of them shows up as a
 * diff on a single route rather than being discovered later on whichever screen happens
 * to use it.
 *
 * It renders real factor data from the message catalogue rather than lorem text, so it
 * also exercises the i18n path and shows the primitives at realistic content lengths.
 */
export const dynamic = 'force-static'

const FACTORS: { key: string; index: number; band: Band }[] = [
  { key: 'ytring', index: 41, band: 'hoy' },
  { key: 'mengde', index: 44, band: 'hoy' },
  { key: 'motstrid', index: 52, band: 'middels' },
  { key: 'leder', index: 64, band: 'middels' },
  { key: 'medvirk', index: 66, band: 'lav' },
  { key: 'mening', index: 78, band: 'lav' },
]

export default async function PrimitivesPage() {
  const t = await getTranslations('factor')

  return (
    <main className="animate-entry mx-auto max-w-[1180px] px-[16px] md:px-[28px] py-[40px]">
      <h1 className="font-display text-[34px] font-semibold leading-tight">Primitives</h1>
      <p className="mt-[6px] text-mut">
        Every primitive in every state. This route is what the S2 pixel gate measures.
      </p>

      {/* ---------------------------------------------------------------- buttons */}
      <Card className="mt-[28px]">
        <h2 className="font-display text-[20px] font-semibold">Button</h2>
        <div className="mt-[18px] flex flex-wrap items-center gap-[12px]">
          <Button size="lg" tone="primary">Se hele resultatet</Button>
          <Button size="md" tone="primary">＋ Ny måling</Button>
          <Button size="sm" tone="primary">Oppdater</Button>
          <Button size="xs" tone="quiet">Les utkastet</Button>
        </div>
        <div className="mt-[12px] flex flex-wrap items-center gap-[12px]">
          <Button size="md" tone="secondary">Forhåndsvis som ansatt</Button>
          <Button size="sm" tone="secondary">Åpne samtaler</Button>
          <Button size="sm" tone="secondary" disabled className="opacity-50">
            Deaktivert
          </Button>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ pills */}
      <Card className="mt-[18px]">
        <h2 className="font-display text-[20px] font-semibold">Pill</h2>
        <div className="mt-[18px] flex flex-wrap items-center gap-[8px]">
          <Pill selected>Hele virksomheten</Pill>
          <Pill>Drift · 8</Pill>
          <Pill>Prosjekt · 9</Pill>
          <Pill>Verksted · 8</Pill>
          <Pill>Administrasjon · 3</Pill>
        </div>
      </Card>

      {/* ------------------------------------------------------------ risk + mask */}
      <Card className="mt-[18px]">
        <h2 className="font-display text-[20px] font-semibold">Risk band and k-anonymity</h2>
        <div className="mt-[18px] flex flex-wrap items-center gap-[10px]">
          <RiskBadge band="lav" label="Lav" />
          <RiskBadge band="middels" label="Middels" />
          <RiskBadge band="hoy" label="Høy" />
          <MaskedCell threshold={5} />
        </div>

        <div className="mt-[22px] space-y-[10px]">
          {FACTORS.map((f) => (
            <div key={f.key} className="flex items-center gap-[14px]">
              <span className="w-[220px] flex-none text-[13px]">{t(`${f.key}.label`)}</span>
              <span className="w-[36px] flex-none text-right text-[13px] font-bold tabular-nums">
                {f.index}
              </span>
              <span className="h-[8px] flex-1 overflow-hidden rounded-pill bg-bg">
                <span
                  className="block h-full rounded-pill"
                  style={{ width: `${f.index}%`, background: BAND_BAR[f.band] }}
                />
              </span>
              <RiskBadge
                band={f.band}
                label={f.band === 'lav' ? 'Lav' : f.band === 'middels' ? 'Middels' : 'Høy'}
              />
            </div>
          ))}
        </div>

        <div className="mt-[22px]">
          <StackedBar
            segments={[
              { key: 'lav', flex: 5, background: '#CFE7E4' },
              { key: 'middels', flex: 4, background: '#F5DC96' },
              { key: 'hoy', flex: 2, background: '#F0B9A0' },
            ]}
          />
          <div className="mt-[8px] flex justify-between text-[11.5px] text-mut">
            <span>5 forsvarlig</span>
            <span>4 følges opp</span>
            <span>2 høy risiko</span>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------------ rows + note */}
      <Card className="mt-[18px]">
        <h2 className="font-display text-[20px] font-semibold">Row and note</h2>
        <div className="mt-[18px] space-y-[10px]">
          <Row tone="#D4633A">
            <span className="flex-1">
              <span className="block text-[14px] font-bold">
                Fast avviksssvar innen fem dager — Verksted
              </span>
              <span className="block text-[12.5px] text-mut">
                Du er ansvarlig · frist gikk ut i går
              </span>
            </span>
            <Button size="sm" tone="primary">Oppdater</Button>
          </Row>
          <Row tone="#E0A21F">
            <span className="flex-1">
              <span className="block text-[14px] font-bold">
                Tre anonyme kommentarer venter på svar
              </span>
              <span className="block text-[12.5px] text-mut">
                Eldste har ventet ni dager · du svarer uten å vite hvem
              </span>
            </span>
            <Button size="sm" tone="secondary">Åpne samtaler</Button>
          </Row>
        </div>

        <NoteCard className="mt-[18px]">
          <p className="text-[13.5px] leading-[1.55]">
            Ytringsklima falt mest på Verksted. Åtte har svart der, så tallet er trygt å
            bruke. Jeg har skrevet et utkast til risikovurdering — du trenger bare å lese
            gjennom.
          </p>
          <Button size="xs" tone="quiet" className="mt-[11px]">
            Les utkastet
          </Button>
        </NoteCard>
      </Card>
    </main>
  )
}

import type { Route } from "next";
import Link from "next/link";
import { createHash } from "node:crypto";
import { getTranslations } from "next-intl/server";
import {
  AutoApproveForm,
  MessageEditForm,
  MessagesApproveForm,
  TranslationApproveForm,
  TranslationImportForm,
} from "@/components/admin/TranslationForms";
import {
  Badge,
  BTN,
  Card,
  PageHead,
  Problem,
  Stat,
} from "@/components/admin/ui";
import { localePilots, translationState, whoami } from "@/lib/admin/api";
import {
  EnglishSurvey,
  LanguagePilots,
} from "@/components/admin/LanguageApproval";
import { autoRecord } from "@/lib/admin/auto";
import {
  ADMIN_LANGUAGES,
  autoApprove,
  isAdminLanguage,
  isScope,
  languageOverview,
  languageView,
  PLATFORM_CATALOGUE,
  platformView,
  SCOPE_SECTIONS,
  SITE_PAGES,
  sitePage,
  surveyTexts,
  type AdminLanguage,
  type LanguageOverview,
  type LanguageView,
  type PlatformView,
  type Scope,
  type SiteEntry,
} from "@/lib/admin/translations";
import { isError } from "@/lib/admin/api";
import { LOCALE_REGISTRY } from "@/lib/i18n/locales";
import {
  currentText,
  overrideStanding,
  shownText,
  type Override,
} from "@/lib/i18n/platform-package";
import type { Section } from "@/lib/i18n/survey-catalogue";
import { ORIGINS, standing } from "@/lib/i18n/translation-package";

/**
 * Translations (D-133, D-152). Two tabs — the questionnaire, and every page — and seven languages:
 * bokmål, the source; English, the platform's second language; and the survey languages a
 * respondent may pick. Each language goes out as a file for a translator (JSON, or XLIFF for an
 * agency) and comes back the same way; what is waiting is approved here, or by the auto-approve
 * switch while it is on. The admin itself stays English. Super-admin.
 */
type Props = {
  searchParams: Promise<{
    view?: string;
    lang?: string;
    section?: string;
    show?: string;
    ns?: string;
    q?: string;
    page?: string;
    site?: string;
  }>;
};

type T = Awaited<ReturnType<typeof getTranslations<"admin">>>;
const SHOW = ["all", "none", "workflow", "approved", "stale"] as const;
type Show = (typeof SHOW)[number];
const PAGE_SHOW = ["all", "overridden", "waiting"] as const;
type PageShow = (typeof PAGE_SHOW)[number];
const PER_PAGE = 150;

const pill = (active: boolean) =>
  `rounded-pill border px-[11px] py-[5px] font-semibold no-underline hover:no-underline ${active ? "border-ink bg-ink text-bg hover:text-bg" : "border-line bg-sf text-ink hover:text-ink"}`;
const tab = (active: boolean) =>
  `border-b-2 px-[4px] pb-[8px] text-[15px] font-semibold no-underline hover:no-underline ${active ? "border-ink text-ink hover:text-ink" : "border-transparent text-mut hover:text-ink"}`;
const nameOf = (code: string) =>
  code === "no"
    ? "Norsk (bokmål)"
    : (LOCALE_REGISTRY.find((l) => l.code === code)?.nativeName ?? code);

export default async function AdminTranslations(props: Props) {
  const t = await getTranslations({ locale: "en", namespace: "admin" });
  const sp = await props.searchParams;
  const view: Scope = isScope(sp.view) ? sp.view : "questionnaire";
  const lang: AdminLanguage = isAdminLanguage(sp.lang) ? sp.lang : "no";

  const who = await whoami();
  if (who?.role !== "super_admin")
    return <Problem text={t("common.notAllowed")} />;
  // while the switch is on, what this build shows is approved as it is opened (0101)
  const auto = await autoApprove();
  if (!isError(auto) && auto.on) await autoRecord();

  const [en, pilots, overview] = await Promise.all([
    translationState("en"),
    localePilots(),
    languageOverview(),
  ]);
  const offerProblems = Object.fromEntries(
    [
      "not_allowed",
      "invalid",
      "not_found",
      "stale",
      "confirm_required",
      "failed",
    ].map((k) => [k, t(`legal.problem.${k}`)]),
  );

  const href = (next: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { view, lang, ...next };
    for (const [k, v] of Object.entries(merged))
      if (
        v &&
        !(k === "view" && v === "questionnaire") &&
        !(k === "lang" && v === "no")
      )
        q.set(k, v);
    return `/admin/translations${q.size ? `?${q}` : ""}` as Route;
  };

  let body: React.ReactNode;
  if (view === "questionnaire" && lang === "no")
    body = await bokmalQuestionnaire(t, sp, href);
  else if (view === "pages" && (lang === "no" || lang === "en"))
    body = await platformPages(t, lang, sp, href);
  else {
    const v = await languageView(lang as Exclude<AdminLanguage, "no">, view);
    body =
      v === "not_allowed" ? (
        <Problem text={t("common.notAllowed")} />
      ) : v === "failed" ? (
        <Problem text={t("common.failed")} />
      ) : (
        registryPanel(t, v, sp, href)
      );
  }

  const exportHref = `/admin/translations/export?locale=${lang}&scope=${view}&format=json`;
  const hasImport = !(view === "questionnaire" && lang === "no");
  const o = typeof overview === "string" ? null : overview;

  return (
    <>
      <PageHead
        title={t("translations.overview.title")}
        lead={
          o
            ? t("translations.overview.lead", { n: o.open })
            : t("translations.lead")
        }
      >
        <div className="flex flex-wrap gap-[10px]">
          {hasImport ? (
            <a href="#import" className={BTN.secondary}>
              {t("translations.overview.import")}
            </a>
          ) : null}
          <a href={exportHref} className={BTN.secondary}>
            {t("translations.overview.export")}
          </a>
        </div>
      </PageHead>

      {o ? <Overview t={t} o={o} href={href} /> : null}

      <h2 className="mb-[6px] mt-[34px] font-display text-[22px] font-medium md:px-[18px]">
        {t("translations.overview.workspace")}
      </h2>
      <p className="mb-[16px] mt-0 max-w-[90ch] text-[13px] leading-[1.55] text-mut md:px-[18px]">
        {t("translations.lead")}
      </p>

      {isError(auto) ? null : (
        <Card
          title={t("translations.auto.title")}
          aside={
            <Badge tone={auto.on ? "yellow" : "grey"}>
              {t(auto.on ? "translations.auto.on" : "translations.auto.off")}
            </Badge>
          }
          className="mb-[16px]"
        >
          <p className="mb-[10px] mt-0 max-w-[80ch] text-[13px] leading-[1.55] text-mut">
            {t("translations.auto.lead")}
          </p>
          {auto.on && auto.by ? (
            <p className="mb-[10px] mt-0 text-[12.5px] text-mut">
              {t("translations.auto.since", {
                by: auto.by,
                at: (auto.at ?? "").slice(0, 16).replace("T", " "),
              })}
            </p>
          ) : null}
          <AutoApproveForm
            on={auto.on}
            labels={{
              turnOn: t("translations.auto.turnOn"),
              turnOff: t("translations.auto.turnOff"),
              confirm: t("translations.auto.confirm"),
              saving: t("legal.saving"),
              done: t("translations.auto.done"),
              problems: {
                not_allowed: t("translations.problem.not_allowed"),
                failed: t("translations.problem.failed"),
                invalid: t("translations.problem.invalid"),
              },
            }}
          />
        </Card>
      )}

      <nav
        aria-label={t("translations.tabs")}
        className="mb-[14px] flex gap-[22px] border-b border-line"
      >
        {(["questionnaire", "pages"] as const).map((s) => (
          <Link
            key={s}
            href={href({
              view: s,
              section: undefined,
              show: undefined,
              ns: undefined,
              q: undefined,
              page: undefined,
              site: undefined,
            })}
            aria-current={s === view ? "page" : undefined}
            className={tab(s === view)}
          >
            {t(`translations.tab.${s}`)}
          </Link>
        ))}
      </nav>
      <p className="mb-[12px] mt-0 max-w-[80ch] text-[12.5px] leading-[1.55] text-mut">
        {t(`translations.tabLead.${view}`)}
      </p>

      <nav
        aria-label={t("translations.languages")}
        className="mb-[18px] flex flex-wrap items-center gap-[6px] text-[13px]"
      >
        {ADMIN_LANGUAGES.map((l) => (
          <Link
            key={l}
            href={href({
              lang: l,
              section: undefined,
              show: undefined,
              ns: undefined,
              q: undefined,
              page: undefined,
            })}
            aria-current={l === lang ? "page" : undefined}
            className={pill(l === lang)}
            lang={l === "no" ? "nb" : l}
          >
            {nameOf(l)}
          </Link>
        ))}
      </nav>

      {body}

      {/* which languages a survey is offered in: moved here from the legal review (X-096) */}
      <div className="mt-[18px] flex flex-col gap-[16px]">
        {isError(en) ? null : (
          <EnglishSurvey t={t} state={en} problems={offerProblems} />
        )}
        {isError(pilots) ? null : (
          <LanguagePilots
            t={t}
            pilots={pilots.pilots}
            problems={offerProblems}
          />
        )}
      </div>
    </>
  );
}

const problemsOf = (t: T) =>
  Object.fromEntries(
    [
      "not_allowed",
      "invalid",
      "no_file",
      "too_large",
      "bad_file",
      "wrong_language",
      "stale",
      "confirm_required",
      "failed",
    ].map((k) => [k, t(`translations.problem.${k}`)]),
  );

const CODES = [
  "unknown_key",
  "syntax",
  "placeholders",
  "plural",
  "stale",
  "approved_capped",
  "step",
  "sms_long",
  "questionnaire",
] as const;

function importLabels(t: T) {
  return {
    file: t("translations.file"),
    origin: t("translations.origin"),
    origins: Object.fromEntries(
      ORIGINS.map((o) => [o, t(`translations.origins.${o}`)]),
    ),
    check: t("translations.check"),
    apply: t("translations.apply"),
    checking: t("translations.checking"),
    summary: t("translations.summary"),
    outside: t("translations.outside"),
    written: t("translations.written"),
    removed: t("translations.removed"),
    nothing: t("translations.nothing"),
    codes: Object.fromEntries(
      CODES.map((c) => [c, t(`translations.code.${c}`)]),
    ),
    problems: problemsOf(t),
    problemsHead: t("translations.problemsHead"),
  };
}

function exportCard(
  t: T,
  locale: string,
  scope: Scope,
  lead: string,
  ns?: string,
) {
  const base = `/admin/translations/export?locale=${locale}&scope=${scope}${ns ? `&ns=${ns}` : ""}`;
  return (
    <Card title={t("translations.exportTitle")}>
      <p className="mb-[10px] mt-0 text-[13px] leading-[1.55] text-mut">
        {lead}
      </p>
      <span className="flex flex-wrap gap-[10px] text-[13px]">
        <a href={`${base}&format=json`} className="font-semibold text-link">
          {t("translations.exportJson")}
        </a>
        <a href={`${base}&format=xliff`} className="font-semibold text-link">
          {t("translations.exportXliff")}
        </a>
      </span>
    </Card>
  );
}

// ---------------------------------------------------------------- bokmål's questions: the source
async function bokmalQuestionnaire(
  t: T,
  sp: Awaited<Props["searchParams"]>,
  href: (n: Record<string, string | undefined>) => Route,
) {
  const catalogue = await surveyTexts();
  if (!catalogue) return <Problem text={t("common.failed")} />;
  const sections = SCOPE_SECTIONS.questionnaire;
  const section = sections.includes(sp.section as Section)
    ? (sp.section as Section)
    : "all";
  const all = catalogue.filter((e) => sections.includes(e.section));
  const rows = all.filter((e) => section === "all" || e.section === section);
  return (
    <>
      <div className="mb-[16px] grid gap-[16px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={t("translations.sourceTitle")}>
          <p className="m-0 text-[13px] leading-[1.55] text-mut">
            {t("translations.sourceLead")}
          </p>
        </Card>
        {exportCard(
          t,
          "no",
          "questionnaire",
          t("translations.exportLeadSource"),
        )}
      </div>
      <nav
        aria-label={t("translations.filter")}
        className="my-[18px] flex flex-wrap items-center gap-[6px] text-[13px]"
      >
        {(["all", ...sections] as const).map((s) => (
          <Link
            key={s}
            href={href({ section: s === "all" ? undefined : s })}
            aria-current={s === section ? "page" : undefined}
            className={pill(s === section)}
          >
            {s === "all"
              ? t("translations.allSections")
              : `${t(`translations.section.${s}`)} · ${all.filter((e) => e.section === s).length}`}
          </Link>
        ))}
      </nav>
      <Card title={t("translations.textsTitle", { n: rows.length })}>
        <ul className="m-0 list-none p-0">
          {rows.map((e) => (
            <li key={e.key} className="border-t border-line py-[10px]">
              <span className="break-all font-mono text-[11px] text-mut">
                {e.key}
              </span>
              <div className="mt-[6px] grid gap-[10px] [grid-template-columns:minmax(0,1fr)] md:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
                <Column
                  label={t("translations.bokmal")}
                  lang="nb"
                  text={e.source}
                />
                <Column
                  label={t("translations.english")}
                  lang="en"
                  text={e.en}
                  empty={t("translations.untranslated")}
                />
              </div>
              <p className="m-0 mt-[4px] text-[11.5px] text-mut">{e.context}</p>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function Column({
  label,
  lang,
  text,
  empty,
  note,
}: {
  label: string;
  lang: string;
  text: string | null;
  empty?: string;
  note?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-mut">
        {label}
      </span>
      {text ? (
        <p
          lang={lang}
          className="m-0 whitespace-pre-wrap text-[13px] leading-[1.55]"
        >
          {text}
        </p>
      ) : (
        <p className="m-0 text-[13px] italic text-mut">{empty}</p>
      )}
      {note}
    </div>
  );
}

// ---------------------------------------------------------------- English and the survey languages: the registry
function registryPanel(
  t: T,
  view: LanguageView,
  sp: Awaited<Props["searchParams"]>,
  href: (n: Record<string, string | undefined>) => Route,
) {
  const { locale: lang, sections } = view;
  const section: Section | "all" = sections.includes(sp.section as Section)
    ? (sp.section as Section)
    : "all";
  const show: Show = (SHOW as readonly string[]).includes(sp.show ?? "")
    ? (sp.show as Show)
    : "all";
  const rows = view.catalogue.filter(
    (e) =>
      (section === "all" || e.section === section) &&
      (show === "all" || standing(e, view.current.get(e.key)) === show),
  );
  const total = sections.reduce((n, s) => n + view.counts[s].total, 0);
  const approved = sections.reduce((n, s) => n + view.counts[s].approved, 0);
  const live = view.ready && (view.flagOn || view.pilots > 0);
  const problems = problemsOf(t);

  return (
    <>
      <Card
        title={t("translations.statusTitle", { language: nameOf(lang) })}
        aside={
          <Badge tone={live ? "green" : view.ready ? "yellow" : "red"}>
            {t(
              live
                ? "translations.live"
                : view.ready
                  ? "translations.readyOff"
                  : "translations.notReady",
            )}
          </Badge>
        }
      >
        <ul className="m-0 list-disc pl-[18px] text-[13px] leading-[1.7]">
          <li>{t("translations.approvedOf", { approved, total })}</li>
          {view.auto.size ? (
            <li>{t("translations.autoCount", { n: view.auto.size })}</li>
          ) : null}
          <li>
            {t(view.flagOn ? "translations.flagOn" : "translations.flagOff", {
              flag: `locale_${lang}`,
            })}
          </li>
          {lang === "en" ? null : (
            <li>{t("translations.pilots", { n: view.pilots })}</li>
          )}
        </ul>
        <p className="mb-0 mt-[8px] max-w-[80ch] text-[12.5px] leading-[1.55] text-mut">
          {t(lang === "en" ? "translations.ruleEn" : "translations.rule")}
        </p>
      </Card>

      <div className="my-[16px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        {sections.map((s) => (
          <Stat
            key={s}
            label={t(`translations.section.${s}`)}
            value={`${view.counts[s].approved} / ${view.counts[s].total}`}
            hint={t("translations.countHint", {
              workflow: view.counts[s].workflow,
              stale: view.counts[s].stale,
            })}
          />
        ))}
      </div>

      <div className="grid gap-[16px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        {exportCard(t, lang, view.scope, t("translations.exportLead"))}
        <Card title={t("translations.approveTitle")}>
          {view.approvable ? (
            <>
              <p className="mb-[10px] mt-0 text-[13px] leading-[1.55] text-mut">
                {t("translations.approveLead", { n: view.approvable })}
              </p>
              <TranslationApproveForm
                key={view.state.digest}
                locale={lang}
                digest={view.state.digest}
                labels={{
                  read: t("translations.approveRead"),
                  submit: t("translations.approveSubmit", {
                    n: view.approvable,
                  }),
                  saving: t("legal.saving"),
                  done: t("translations.approveDone"),
                  problems,
                }}
              />
            </>
          ) : (
            <p className="m-0 text-[13px] leading-[1.55] text-mut">
              {t("translations.approveNone")}
            </p>
          )}
        </Card>
      </div>

      <div id="import" className="mt-[16px] scroll-mt-[90px]">
        <Card title={t("translations.importTitle")}>
          <p className="mb-[10px] mt-0 max-w-[80ch] text-[13px] leading-[1.55] text-mut">
            {t("translations.importLead")}
          </p>
          <TranslationImportForm
            key={`${lang}-${view.scope}`}
            locale={lang}
            scope={view.scope}
            labels={importLabels(t)}
          />
        </Card>
      </div>

      <nav
        aria-label={t("translations.filter")}
        className="my-[18px] flex flex-wrap items-center gap-[6px] text-[13px]"
      >
        {(["all", ...sections] as const).map((s) => (
          <Link
            key={s}
            href={href({
              section: s === "all" ? undefined : s,
              show: show === "all" ? undefined : show,
            })}
            aria-current={s === section ? "page" : undefined}
            className={pill(s === section)}
          >
            {s === "all"
              ? t("translations.allSections")
              : t(`translations.section.${s}`)}
          </Link>
        ))}
        <span aria-hidden="true" className="mx-[6px] h-[18px] w-px bg-line" />
        {SHOW.map((w) => (
          <Link
            key={w}
            href={href({
              section: section === "all" ? undefined : section,
              show: w === "all" ? undefined : w,
            })}
            aria-current={w === show ? "page" : undefined}
            className={pill(w === show)}
          >
            {t(`translations.show.${w}`)}
          </Link>
        ))}
      </nav>

      <Card title={t("translations.textsTitle", { n: rows.length })}>
        {rows.length ? (
          <ul className="m-0 list-none p-0">
            {rows.map((e) => {
              const c = view.current.get(e.key);
              const s = standing(e, c);
              return (
                <li key={e.key} className="border-t border-line py-[10px]">
                  <span className="flex flex-wrap items-center gap-[6px]">
                    <Badge
                      tone={
                        s === "approved"
                          ? "green"
                          : s === "stale"
                            ? "yellow"
                            : s === "workflow"
                              ? "grey"
                              : "red"
                      }
                    >
                      {c && s === "workflow"
                        ? t(`translations.step.${c.status}`)
                        : t(`translations.show.${s}`)}
                    </Badge>
                    {view.auto.has(e.key) && s === "approved" ? (
                      <Badge tone="yellow">{t("translations.autoBadge")}</Badge>
                    ) : null}
                    <span className="break-all font-mono text-[11px] text-mut">
                      {e.key}
                    </span>
                    {c ? (
                      <span className="text-[11.5px] text-mut">
                        {t(`translations.origins.${c.source}`)}
                      </span>
                    ) : null}
                  </span>
                  <div className="mt-[6px] grid gap-[10px] [grid-template-columns:minmax(0,1fr)] md:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
                    <Column
                      label={t("translations.bokmal")}
                      lang="nb"
                      text={e.source}
                      note={
                        e.en && lang !== "en" ? (
                          <p
                            lang="en"
                            className="m-0 mt-[4px] whitespace-pre-wrap text-[12px] leading-[1.5] text-mut"
                          >
                            {t("translations.english")}: {e.en}
                          </p>
                        ) : null
                      }
                    />
                    <Column
                      label={nameOf(lang)}
                      lang={lang}
                      text={c?.text ?? null}
                      empty={t("translations.untranslated")}
                      note={
                        c?.notes ? (
                          <p className="m-0 mt-[4px] whitespace-pre-wrap text-[12px] leading-[1.5] text-mut">
                            {t("translations.notes")}: {c.notes}
                          </p>
                        ) : null
                      }
                    />
                  </div>
                  <p className="m-0 mt-[4px] text-[11.5px] text-mut">
                    {e.context}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="m-0 text-[13px] text-mut">{t("translations.none")}</p>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- bokmål and English pages: messages/ and overrides
async function platformPages(
  t: T,
  lang: "no" | "en",
  sp: Awaited<Props["searchParams"]>,
  href: (n: Record<string, string | undefined>) => Route,
) {
  const v = await platformView(lang);
  if (v === "not_allowed") return <Problem text={t("common.notAllowed")} />;
  if (v === "failed") return <Problem text={t("common.failed")} />;
  const pages = PLATFORM_CATALOGUE.filter((e) => e.view === "pages");
  const site = sitePage(sp.site);
  const namespaces = [...new Set(pages.map((e) => e.ns))].sort();
  const ns = namespaces.includes(sp.ns ?? "") ? sp.ns! : undefined;
  const show: PageShow = (PAGE_SHOW as readonly string[]).includes(
    sp.show ?? "",
  )
    ? (sp.show as PageShow)
    : "all";
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 100);
  const matches = pages.filter((e) => {
    if (ns && e.ns !== ns) return false;
    const o = v.own.get(e.path);
    if (show === "overridden" && !o) return false;
    if (show === "waiting" && (!o || o.status === "approved")) return false;
    if (
      q &&
      !`${e.path}\n${e.no}\n${e.en ?? ""}\n${o?.text ?? ""}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    return true;
  });
  const pageNo = Math.max(
    1,
    Math.min(Math.ceil(matches.length / PER_PAGE) || 1, Number(sp.page) || 1),
  );
  const rows = matches.slice((pageNo - 1) * PER_PAGE, pageNo * PER_PAGE);
  const approvedCount = v.rows.filter((r) => r.status === "approved").length;
  const autoCount = v.rows.filter((r) => r.auto).length;
  const keep = {
    ns,
    show: show === "all" ? undefined : show,
    q: q || undefined,
  };
  const pendingItems = v.pending.map((r) => ({
    key: r.key,
    hash: createHash("sha256").update(r.text, "utf8").digest("hex"),
  }));

  return (
    <>
      <Card title={t("translations.platformTitle", { language: nameOf(lang) })}>
        <ul className="m-0 list-disc pl-[18px] text-[13px] leading-[1.7]">
          <li>
            {t("translations.platformCount", {
              n: pages.length,
              namespaces: namespaces.length,
            })}
          </li>
          <li>
            {t("translations.overrideCount", {
              approved: approvedCount,
              waiting: v.pending.length,
            })}
          </li>
          {autoCount ? (
            <li>{t("translations.autoCount", { n: autoCount })}</li>
          ) : null}
        </ul>
        <p className="mb-0 mt-[8px] max-w-[80ch] text-[12.5px] leading-[1.55] text-mut">
          {t(`translations.platformRule.${lang}`)}
        </p>
      </Card>

      <div className="mt-[16px] grid gap-[16px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        {site ? null : (
          <div className="flex flex-col gap-[16px]">
            {exportCard(
              t,
              lang,
              "pages",
              t(`translations.exportLeadPlatform.${lang}`),
            )}
            {ns
              ? exportCard(
                  t,
                  lang,
                  "pages",
                  t("translations.exportNs", { ns }),
                  ns,
                )
              : null}
          </div>
        )}
        <Card title={t("translations.approveTitle")}>
          {pendingItems.length ? (
            <>
              <p className="mb-[10px] mt-0 text-[13px] leading-[1.55] text-mut">
                {t("translations.approveOverrides", { n: pendingItems.length })}
              </p>
              <MessagesApproveForm
                key={pendingItems.map((i) => i.hash).join("")}
                locale={lang}
                items={pendingItems}
                labels={{
                  read: t("translations.approveRead"),
                  submit: t("translations.approveSubmit", {
                    n: pendingItems.length,
                  }),
                  saving: t("legal.saving"),
                  done: t("translations.approveDone"),
                  problems: problemsOf(t),
                }}
              />
            </>
          ) : (
            <p className="m-0 text-[13px] leading-[1.55] text-mut">
              {t("translations.approveNoneOverrides")}
            </p>
          )}
        </Card>
      </div>

      {site ? null : (
        <div id="import" className="mt-[16px] scroll-mt-[90px]">
          <Card title={t("translations.importTitle")}>
            <p className="mb-[10px] mt-0 max-w-[80ch] text-[13px] leading-[1.55] text-mut">
              {t("translations.importLeadPlatform")}
            </p>
            <TranslationImportForm
              key={`${lang}-pages`}
              locale={lang}
              scope="pages"
              platform
              labels={importLabels(t)}
            />
          </Card>
        </div>
      )}

      <Card title={t("translations.site.nav")} className="mt-[16px]">
        <p className="mb-[10px] mt-0 max-w-[80ch] text-[12.5px] leading-[1.55] text-mut">
          {t("translations.site.lead")}
        </p>
        <nav
          aria-label={t("translations.site.nav")}
          className="flex flex-wrap items-center gap-[6px] text-[12.5px]"
        >
          {SITE_PAGES.map((p) => (
            <Link
              key={p.id}
              href={href({ site: p.id })}
              aria-current={p.id === site?.id ? "page" : undefined}
              className={pill(p.id === site?.id)}
            >
              {siteLabel(t, p.id)} · {p.entries.length}
            </Link>
          ))}
        </nav>
      </Card>

      {site ? (
        <SitePanel t={t} v={v} id={site.id} entries={site.entries} />
      ) : (
        <>
          <nav
            aria-label={t("translations.namespaces")}
            className="mt-[18px] flex flex-wrap items-center gap-[6px] text-[12.5px]"
          >
            <Link
              href={href({ ...keep, ns: undefined, page: undefined })}
              aria-current={!ns ? "page" : undefined}
              className={pill(!ns)}
            >
              {t("translations.allNamespaces")}
            </Link>
            {namespaces.map((n) => (
              <Link
                key={n}
                href={href({ ...keep, ns: n, page: undefined })}
                aria-current={n === ns ? "page" : undefined}
                className={pill(n === ns)}
              >
                {n} · {pages.filter((e) => e.ns === n).length}
              </Link>
            ))}
          </nav>
          <div className="my-[14px] flex flex-wrap items-center gap-[6px] text-[13px]">
            {PAGE_SHOW.map((w) => (
              <Link
                key={w}
                href={href({
                  ...keep,
                  show: w === "all" ? undefined : w,
                  page: undefined,
                })}
                aria-current={w === show ? "page" : undefined}
                className={pill(w === show)}
              >
                {t(`translations.pageShow.${w}`)}
              </Link>
            ))}
            <form
              method="get"
              action="/admin/translations"
              className="ml-auto flex items-center gap-[6px]"
            >
              <input type="hidden" name="view" value="pages" />
              {lang !== "no" ? (
                <input type="hidden" name="lang" value={lang} />
              ) : null}
              {ns ? <input type="hidden" name="ns" value={ns} /> : null}
              {show !== "all" ? (
                <input type="hidden" name="show" value={show} />
              ) : null}
              <label className="sr-only" htmlFor="tr-q">
                {t("translations.search")}
              </label>
              <input
                id="tr-q"
                name="q"
                defaultValue={q}
                placeholder={t("translations.search")}
                className="h-[34px] w-[16rem] max-w-full rounded-ctl border border-line bg-bg px-[10px] text-[13px] outline-none focus-visible:border-ink"
              />
            </form>
          </div>

          <PlatformRows t={t} v={v} rows={rows} />

          {matches.length > PER_PAGE ? (
            <nav
              aria-label={t("translations.pagination")}
              className="mt-[12px] flex flex-wrap items-center gap-[6px] text-[13px]"
            >
              {Array.from(
                { length: Math.ceil(matches.length / PER_PAGE) },
                (_, i) => i + 1,
              ).map((p) => (
                <Link
                  key={p}
                  href={href({
                    ...keep,
                    page: p === 1 ? undefined : String(p),
                  })}
                  aria-current={p === pageNo ? "page" : undefined}
                  className={pill(p === pageNo)}
                >
                  {p}
                </Link>
              ))}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}

/** An override's step, or where the files have taken over from it (0109) */
function OverrideBadge({
  t,
  o,
  st,
}: {
  t: T;
  o: Override | undefined;
  st: ReturnType<typeof overrideStanding>;
}) {
  if (!o) return <Badge tone="grey">{t("translations.fileText")}</Badge>;
  if (st === "folded" || st === "superseded")
    return <Badge tone="grey">{t(`translations.standing.${st}Badge`)}</Badge>;
  return (
    <Badge tone={o.status === "approved" ? "green" : "grey"}>
      {t(`translations.step.${o.status}`)}
    </Badge>
  );
}

const siteLabel = (t: T, id: string) =>
  id === "shared"
    ? t("translations.site.shared")
    : id === "other"
      ? t("translations.site.other")
      : id;

/** A page of the site (X-090): its texts in order, bokmål and English, each editable; the page as a spreadsheet */
function SitePanel({
  t,
  v,
  id,
  entries,
}: {
  t: T;
  v: PlatformView;
  id: string;
  entries: SiteEntry[];
}) {
  const current = (e: SiteEntry["entry"], l: "no" | "en") =>
    currentText(e, l, l === "no" ? v.bokmal : v.english);
  const editLabels = {
    edit: t("translations.site.edit"),
    bokmal: t("translations.bokmal"),
    english: t("translations.english"),
    save: t("translations.site.save"),
    saving: t("legal.saving"),
    done: t("translations.site.done"),
    problems: {
      ...problemsOf(t),
      unchanged: t("translations.site.unchanged"),
      ...Object.fromEntries(
        CODES.map((c) => [`code.${c}`, t(`translations.code.${c}`)]),
      ),
    },
  };
  const side = (e: SiteEntry["entry"], l: "no" | "en") => {
    const map = l === "no" ? v.bokmal : v.english;
    const o = map.get(e.path);
    const st = overrideStanding(e, l, map);
    return (
      <Column
        label={
          l === "no" ? t("translations.bokmal") : t("translations.english")
        }
        lang={l === "no" ? "nb" : "en"}
        text={shownText(e, l, map)}
        empty={t("translations.untranslated")}
        note={
          o ? (
            <p className="m-0 mt-[4px] whitespace-pre-wrap text-[11.5px] leading-[1.5] text-mut">
              {st === "folded" || st === "superseded"
                ? t(`translations.standing.${st}`)
                : o.status === "approved"
                  ? t("translations.overridden")
                  : `${t("translations.waiting")}: ${o.text}`}
            </p>
          ) : null
        }
      />
    );
  };
  return (
    <>
      <div className="mt-[16px] grid gap-[16px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={t("translations.site.sheetTitle")}>
          <p className="mb-[10px] mt-0 text-[13px] leading-[1.55] text-mut">
            {t("translations.site.sheetLead")}
          </p>
          <a
            href={`/admin/translations/sheet?site=${encodeURIComponent(id)}`}
            className="text-[13px] font-semibold text-link"
          >
            {t("translations.site.download")}
          </a>
          <p className="mb-0 mt-[10px] text-[12.5px] leading-[1.55] text-mut">
            {t("translations.site.fold")}
          </p>
        </Card>
        <div id="import" className="scroll-mt-[90px]">
          <Card title={t("translations.site.importTitle")}>
            <p className="mb-[10px] mt-0 text-[13px] leading-[1.55] text-mut">
              {t("translations.site.importLead")}
            </p>
            <TranslationImportForm
              key={`sheet-${id}`}
              locale="no"
              scope="pages"
              platform
              sheet
              labels={importLabels(t)}
            />
          </Card>
        </div>
      </div>

      <Card
        title={t("translations.site.title", {
          page: siteLabel(t, id),
          n: entries.length,
        })}
        className="mt-[16px]"
      >
        {entries.some((e) => !e.reached) ? (
          <p className="mb-[6px] mt-0 max-w-[80ch] text-[12.5px] leading-[1.55] text-mut">
            {t("translations.site.unreachedHint")}
          </p>
        ) : null}
        {entries.length ? (
          <ol className="m-0 list-none p-0">
            {entries.map(({ entry: e, reached }) => {
              const o = v.own.get(e.path);
              return (
                <li key={e.key} className="border-t border-line py-[10px]">
                  <span className="flex flex-wrap items-center gap-[6px]">
                    <OverrideBadge
                      t={t}
                      o={o}
                      st={overrideStanding(e, v.locale, v.own)}
                    />
                    {reached ? null : (
                      <Badge tone="yellow">
                        {t("translations.site.unreached")}
                      </Badge>
                    )}
                    <span className="break-all font-mono text-[11px] text-mut">
                      {e.path}
                    </span>
                  </span>
                  <div className="mt-[6px] grid gap-[10px] [grid-template-columns:minmax(0,1fr)] md:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
                    {side(e, "no")}
                    {side(e, "en")}
                  </div>
                  <MessageEditForm
                    key={e.path}
                    path={e.path}
                    no={current(e, "no")}
                    en={current(e, "en")}
                    labels={editLabels}
                  />
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="m-0 text-[13px] text-mut">{t("translations.none")}</p>
        )}
      </Card>
    </>
  );
}

function PlatformRows({
  t,
  v,
  rows,
}: {
  t: T;
  v: PlatformView;
  rows: typeof PLATFORM_CATALOGUE;
}) {
  if (!rows.length) {
    return (
      <Card title={t("translations.textsTitle", { n: 0 })}>
        <p className="m-0 text-[13px] text-mut">{t("translations.none")}</p>
      </Card>
    );
  }
  const side = (e: (typeof rows)[number], l: "no" | "en") => {
    const map = l === "no" ? v.bokmal : v.english;
    const o = map.get(e.path);
    const st = overrideStanding(e, l, map);
    const shown = shownText(e, l, map);
    return (
      <Column
        label={
          l === "no" ? t("translations.bokmal") : t("translations.english")
        }
        lang={l === "no" ? "nb" : "en"}
        text={shown}
        empty={t("translations.untranslated")}
        note={
          o ? (
            <p className="m-0 mt-[4px] text-[11.5px] leading-[1.5] text-mut">
              {st === "folded" || st === "superseded"
                ? t(`translations.standing.${st}`)
                : o.status === "approved"
                  ? t("translations.overridden")
                  : `${t("translations.waiting")}: ${o.text}`}
            </p>
          ) : null
        }
      />
    );
  };
  return (
    <Card title={t("translations.textsTitle", { n: rows.length })}>
      <ul className="m-0 list-none p-0">
        {rows.map((e) => {
          const o = v.own.get(e.path);
          return (
            <li key={e.key} className="border-t border-line py-[10px]">
              <span className="flex flex-wrap items-center gap-[6px]">
                <OverrideBadge
                  t={t}
                  o={o}
                  st={overrideStanding(e, v.locale, v.own)}
                />
                {o?.auto ? (
                  <Badge tone="yellow">{t("translations.autoBadge")}</Badge>
                ) : null}
                <span className="break-all font-mono text-[11px] text-mut">
                  {e.path}
                </span>
              </span>
              <div className="mt-[6px] grid gap-[10px] [grid-template-columns:minmax(0,1fr)] md:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
                {side(e, "no")}
                {side(e, "en")}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- the design's Languages overview (X-095)
const QUEUE = 8;
const CELL_DOT = {
  none: "bg-peach",
  workflow: "bg-ac",
  stale: "bg-ac",
} as const;

function Overview({
  t,
  o,
  href,
}: {
  t: T;
  o: LanguageOverview;
  href: (n: Record<string, string | undefined>) => Route;
}) {
  const cards = [
    {
      code: "no",
      name: nameOf("no"),
      role: t("translations.overview.source"),
      approved: o.sourceTotal,
      total: o.sourceTotal,
    },
    ...o.cards.map((c) => ({
      code: c.locale as string,
      name: nameOf(c.locale),
      role: t(
        c.locale === "en"
          ? "translations.overview.roleEn"
          : c.offered
            ? "translations.overview.offered"
            : c.pilots
              ? "translations.overview.pilot"
              : "translations.overview.notOffered",
        { n: c.pilots },
      ),
      approved: c.approved,
      total: c.total,
    })),
  ];
  const scopeOf = (section: string) =>
    section === "ui" || section === "mail" ? "pages" : "questionnaire";
  return (
    <>
      <div className="grid gap-[16px] [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        {cards.map((c) => {
          const pct = c.total ? Math.floor((100 * c.approved) / c.total) : 0;
          return (
            <div
              key={c.code}
              className="rounded-panel border border-line bg-sf px-[22px] py-[20px]"
            >
              <div className="flex items-center gap-[10px]">
                <span className="rounded-pill border border-line bg-sbg px-[8px] py-[3px] text-[11px] font-bold">
                  {c.code.toUpperCase()}
                </span>
                <Link
                  href={href({
                    lang: c.code,
                    section: undefined,
                    show: undefined,
                    ns: undefined,
                    q: undefined,
                    page: undefined,
                    site: undefined,
                  })}
                  className="text-[14px] font-semibold text-ink no-underline hover:text-ink hover:underline"
                  lang={c.code === "no" ? "nb" : c.code}
                >
                  {c.name}
                </Link>
              </div>
              <div className="mt-[6px] text-[12.5px] text-mut">{c.role}</div>
              <div className="mt-[14px] flex items-center gap-[10px]">
                <span
                  aria-hidden="true"
                  className="block h-[8px] flex-1 overflow-hidden rounded-pill bg-ink/[.08]"
                >
                  <span
                    className="block h-full rounded-pill bg-ac"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="whitespace-nowrap text-[12.5px]">
                  <b>{pct} %</b>{" "}
                  <span className="text-mut">
                    {t("translations.overview.frac", {
                      approved: c.approved,
                      total: c.total,
                    })}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-[18px] grid items-start gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.1fr)_minmax(300px,.9fr)]">
        <section className="min-w-0 rounded-panel border border-line bg-sf">
          <div className="flex items-baseline justify-between gap-[12px] px-[20px] pt-[20px]">
            <h2 className="m-0 font-display text-[22px] font-medium">
              {t("translations.overview.queue")}
            </h2>
            <span className="text-[12.5px] text-mut">
              {t("translations.overview.texts", { n: o.queue.length })}
            </span>
          </div>
          {o.queue.length ? (
            <ul className="m-0 mt-[10px] flex list-none flex-col p-0">
              {o.queue.slice(0, QUEUE).map(({ entry, cells }) => {
                const first = cells[0]!;
                return (
                  <li
                    key={entry.key}
                    className="flex items-center gap-[14px] border-t border-line px-[20px] py-[13px]"
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        lang="nb"
                        className="truncate text-[13.5px] font-semibold"
                      >
                        {entry.source}
                      </div>
                      <div className="truncate text-[12px] text-mut">
                        {t(`translations.section.${entry.section}`)} ·{" "}
                        {entry.key}
                      </div>
                      <div className="mt-[8px] flex flex-wrap gap-[6px]">
                        {cells.map((c) => (
                          <span
                            key={c.locale}
                            className="inline-flex items-center gap-[6px] whitespace-nowrap rounded-pill bg-sbg px-[10px] py-[5px] text-[11.5px] font-bold"
                          >
                            <span
                              aria-hidden="true"
                              className={`block h-[6px] w-[6px] rounded-pill ${CELL_DOT[c.state]}`}
                            />
                            {c.locale.toUpperCase()} ·{" "}
                            {t(`translations.overview.cell.${c.state}`)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Link
                      href={href({
                        lang: first.locale,
                        view: scopeOf(entry.section),
                        section: entry.section,
                        show: first.state,
                        ns: undefined,
                        q: undefined,
                        page: undefined,
                        site: undefined,
                      })}
                      className={BTN.row}
                    >
                      {t("translations.overview.translate")}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="m-0 px-[20px] py-[18px] text-[13px] text-mut">
              {t("translations.overview.queueEmpty")}
            </p>
          )}
          {o.queue.length > QUEUE ? (
            <p className="m-0 border-t border-line px-[20px] py-[12px] text-[12.5px] text-mut">
              {t("translations.overview.more", { n: o.queue.length - QUEUE })}
            </p>
          ) : null}
        </section>

        <section className="rounded-panel border border-line bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px]">
          <h2 className="m-0 font-display text-[22px] font-medium">
            {t("translations.overview.machine")}
          </h2>
          <div className="mt-[8px] text-[13px] leading-[1.55] [text-wrap:pretty]">
            {t("translations.overview.machineText")}
          </div>
          <div className="mt-[14px] rounded-[12px] border border-line bg-bg px-[16px] py-[14px] text-[13px] leading-[1.55] [text-wrap:pretty]">
            {t("translations.overview.rule")}
          </div>
        </section>
      </div>
    </>
  );
}

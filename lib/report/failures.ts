import 'server-only'
import { cache } from 'react'

/**
 * The report's sections whose read failed on this request (review Q1). A reader still returns
 * what it has — an empty list, a null — so the page renders; it also records the section here,
 * and the document says which parts it could not read instead of passing an error off as
 * «nothing recorded». A statutory document that looks complete and is not is the worse failure.
 */
export type ReportSection = 'risk' | 'effects' | 'screening' | 'information' | 'trainings' | 'signers' | 'evaluation'

const failed = cache(() => new Set<ReportSection>())

export function markReportFailed(section: ReportSection): void {
  failed().add(section)
}

export function reportFailures(): ReportSection[] {
  return [...failed()]
}

/** A reader's failure return, recorded: `return failedAs('trainings', [])` */
export function failedAs<T>(section: ReportSection, value: T): T {
  markReportFailed(section)
  return value
}

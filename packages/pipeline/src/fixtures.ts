/**
 * Typed access to the checked-in offline fixtures (AGENTS.md testing policy 4:
 * recorded real-shaped responses replayed offline — unit tests never hit live APIs).
 */
import type { CompanyProfile } from '@regdelta/core';
import federalRegisterJson from '../fixtures/federal-register-cfpb-2026-09812.json';
import ecfrPriorJson from '../fixtures/ecfr-12-cfr-1026-40-prior.json';
import ecfrCurrentJson from '../fixtures/ecfr-12-cfr-1026-40-current.json';
import profileJson from '../fixtures/company-profile-consumer-lending.json';

export interface FederalRegisterDocumentFixture {
  readonly document_number: string;
  readonly title: string;
  readonly publication_date: string;
  readonly effective_on: string | null;
  readonly citation: string;
  readonly html_url: string;
  readonly raw_text_url: string;
  readonly full_text: string;
}

export interface EcfrSectionFixture {
  readonly section: string;
  readonly title: string;
  readonly retrieved_at: string;
  readonly url: string;
  readonly text: string;
}

export const federalRegisterCfpbDocument: FederalRegisterDocumentFixture = federalRegisterJson;

export const ecfrSectionPrior: EcfrSectionFixture = ecfrPriorJson;

export const ecfrSectionCurrent: EcfrSectionFixture = ecfrCurrentJson;

/** Seeded company profile for the M1 vertical slice (consumer lending, federal). */
export const consumerLendingProfile: CompanyProfile = {
  id: profileJson.id,
  name: profileJson.name,
  vertical: profileJson.vertical,
  products: profileJson.products,
  jurisdictions: profileJson.jurisdictions,
  licenseTypes: profileJson.licenseTypes,
  watchTerms: profileJson.watchTerms,
};

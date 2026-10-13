import { acceptTermsRequest, setRegistrationTermsVersion } from '../api/api';

// The version of the terms text shown in screens/TermsScreen.js. Keep it
// equal to TERMS_VERSION in the backend (account/views.py). When the terms
// change, update the text, then raise BOTH numbers: every account is then
// asked to agree again.
export const TERMS_VERSION = '1';

// True when this account already agreed to the current terms.
// `account` is the user profile from the login response or from
// getCurrentUser(); the backend sets `terms_accepted` on it. Anything else
// (no profile, an older backend without the field) counts as "not agreed",
// so the screen is shown rather than skipped.
export function hasAcceptedTerms(account) {
  return account?.terms_accepted === true;
}

// BEFORE REGISTERING: the user tapped "I Agree" on the Terms screen that
// opens ahead of the registration form. No account exists yet, so nothing is
// sent now; the version is attached to the sign-up request (registerUser in
// api/api.js) and the backend saves the consent on the new account.
export function agreeBeforeRegistering() {
  setRegistrationTermsVersion(TERMS_VERSION);
}

// Forgets that agreement (the user declined or left the Terms screen).
export function clearRegistrationAgreement() {
  setRegistrationTermsVersion(null);
}

// AFTER LOGIN: records on the account that the signed-in user agreed. Used
// for accounts that did not register through the app (e.g. created by staff)
// and when the terms version changes. Throws if the request fails, so the
// screen can tell the user it was not saved. Returns the updated account.
export async function acceptTerms() {
  return acceptTermsRequest(TERMS_VERSION);
}
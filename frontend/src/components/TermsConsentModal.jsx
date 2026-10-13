import React, { useState } from "react";
import { ShieldCheck } from "lucide-react";

// ==========================================================
// TERMS AND CONDITIONS AND DATA PRIVACY CONSENT
// Shown before the registration form (RegisterModal.jsx). The student or
// employee must tick the checkbox and click "I Agree" to continue; the
// backend also refuses a registration without this consent and records
// when it was given (Account.terms_accepted_at).
// ==========================================================

// Must equal TERMS_VERSION in backend/account/views.py (and the mobile app).
// Raise it together with the backend whenever the terms text changes.
export const TERMS_VERSION = "1";

const SECTIONS = [
  {
    title: "1. Collection of Personal Information",
    text: "The system may collect and process personal information necessary for the operation of the Lost and Found Management System. This may include, but is not limited to:",
    list: [
      "Full name",
      "School ID number",
      "Email address",
      "Contact information",
      "Account credentials",
      "Lost or found item information",
      "Claim and surrender records",
      "Information provided during item verification and claiming",
      "Points and leaderboard-related information, when applicable",
    ],
  },
  {
    title: "2. Purpose of Data Collection",
    text: "The information collected will be used only for legitimate purposes related to the operation of the system, including:",
    list: [
      "Creating and managing user accounts",
      "Recording lost and found items",
      "Processing and verifying item claims",
      "Recording surrendered items",
      "Preventing fraudulent or duplicate claims",
      "Tracking claim and surrender transactions",
      "Managing the system's points and leaderboard features",
      "Communicating important information regarding lost and found items",
      "Generating system reports and statistics for authorized school personnel",
    ],
  },
  {
    title: "3. Data Privacy and Protection",
    text: "The system will take reasonable measures to protect collected personal information against unauthorized access, disclosure, alteration, loss, or misuse. Access to personal information will be limited to authorized personnel who require the information to perform their assigned responsibilities.",
  },
  {
    title: "4. Data Sharing and Disclosure",
    text: "Personal information will not be publicly disclosed or shared with unauthorized individuals. Information may only be accessed or disclosed when necessary for legitimate school-related purposes, system administration, verification of claims, or when required or permitted by applicable laws and regulations.",
  },
  {
    title: "5. Accuracy of Information",
    text: "Users are responsible for providing accurate and truthful information. Providing false, misleading, or unauthorized information may result in the restriction or termination of account access and may affect the processing of lost and found claims.",
  },
  {
    title: "6. User Responsibility",
    text: "Users are responsible for keeping their account credentials confidential and for all activities performed through their account. Users must not attempt to access, modify, or obtain information belonging to other users without authorization.",
  },
  {
    title: "7. Data Retention",
    text: "Personal information and transaction records may be retained for as long as necessary to fulfill the purposes for which they were collected, comply with school policies, maintain appropriate records, and satisfy applicable legal or administrative requirements.",
  },
  {
    title: "8. User Consent",
    text: 'By selecting "I Agree" and continuing to use the system, you voluntarily consent to the collection, processing, storage, and use of your personal information for the purposes stated above.',
    extra: "You may contact the appropriate school office or system administrator regarding concerns about the collection or processing of your personal information.",
  },
  {
    title: "9. Changes to These Terms",
    text: "The system administrators may update these Terms and Conditions and Data Privacy Consent when necessary. Users will be informed of significant changes through appropriate system or school announcements.",
  },
];

export default function TermsConsentModal({ onAgree, onDecline }) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4 backdrop-blur-md">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-[0_30px_80px_rgba(0,0,0,.25)]">
        {/* Header */}
        <div className="flex items-center gap-3 bg-gradient-to-r from-[#0B648D] to-[#155F87] px-6 py-4 text-white">
          <ShieldCheck className="h-6 w-6 shrink-0" />
          <div>
            <h2 className="text-lg font-bold leading-tight">Terms and Conditions and Data Privacy Consent</h2>
            <p className="text-xs text-blue-100">Please read and agree before using Seek &amp; Balik.</p>
          </div>
        </div>

        {/* Body (scrolls) */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-slate-700">
          <p>
            By accessing and using the Seek &amp; Balik Lost and Found Management System, you acknowledge that
            you have read, understood, and agreed to the following terms and conditions.
          </p>

          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 className="mb-1 font-bold text-[#154B70]">{section.title}</h3>
              <p>{section.text}</p>
              {section.list && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-6">
                  {section.list.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              )}
              {section.extra && <p className="mt-2">{section.extra}</p>}
            </section>
          ))}

          <p className="rounded-xl border border-[#0B648D]/20 bg-[#0B648D]/5 p-3 text-[13px] text-[#154B70]">
            By clicking "I Agree," you confirm that you have read and understood these Terms and Conditions and
            consent to the collection and processing of your personal information for the legitimate purposes of
            the Seek &amp; Balik Lost and Found Management System.
          </p>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4">
          <label className="mb-3 flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#0B648D]"
            />
            <span>I have read and understood the Terms and Conditions and Data Privacy Consent.</span>
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onDecline}
              className="w-1/2 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={onAgree}
              disabled={!checked}
              className="w-1/2 rounded-xl bg-[#0B648D] py-2.5 text-sm font-semibold text-white transition hover:bg-[#094f70] disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              I Agree
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

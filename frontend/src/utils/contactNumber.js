// ==========================================================
// CONTACT NUMBER RULES (shared by every contact number field)
//
// A contact number is a Philippine mobile number written as exactly
// 11 digits, e.g. 09123456789. Inputs only accept digits and stop at
// 11, so a number can never exceed the limit. The backend applies the
// same rule (account/serializers.py and claim/serializers.py).
// ==========================================================

export const CONTACT_NUMBER_LENGTH = 11;

// For onChange: keeps digits only and cuts off anything past 11.
export const sanitizeContactNumber = (value) =>
  String(value ?? "").replace(/\D/g, "").slice(0, CONTACT_NUMBER_LENGTH);

// Converts older stored formats to the 11-digit form:
// "+639123456789" / "639123456789" / "9123456789" -> "09123456789".
export const toLocalContactNumber = (value) => {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("63")) digits = `0${digits.slice(2)}`;
  else if (digits.length === 10 && digits.startsWith("9")) digits = `0${digits}`;
  return digits.slice(0, CONTACT_NUMBER_LENGTH);
};

// "" when valid (or empty and optional), otherwise an error message.
export const contactNumberError = (value, { required = false } = {}) => {
  const digits = String(value ?? "").trim();
  if (!digits) return required ? "Contact number is required." : "";
  if (!/^\d+$/.test(digits)) return "Contact number must contain digits only.";
  if (digits.length !== CONTACT_NUMBER_LENGTH)
    return `Contact number must be exactly ${CONTACT_NUMBER_LENGTH} digits (e.g. 09123456789).`;
  return "";
};

// Business details for legal pages and footer. Set VITE_* in client/.env; placeholders start with "TODO".
const e = import.meta.env;
export const business = {
  legalName: e.VITE_BUSINESS_LEGAL_NAME || 'TODO Legal business name',
  address: e.VITE_BUSINESS_ADDRESS || 'TODO Registered address',
  email: e.VITE_BUSINESS_EMAIL || 'TODO support@example.com',
  phone: e.VITE_BUSINESS_PHONE || 'TODO Phone number',
  grievanceOfficer: e.VITE_GRIEVANCE_OFFICER || 'TODO Grievance officer name',
  grievanceEmail: e.VITE_GRIEVANCE_EMAIL || 'TODO grievance@example.com',
  jurisdiction: e.VITE_JURISDICTION || 'Vellore, Tamil Nadu, India',
};
